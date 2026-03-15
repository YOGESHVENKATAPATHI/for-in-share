import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { path as ffmpegPath } from '@ffmpeg-installer/ffmpeg';
import { path as ffprobePath } from '@ffprobe-installer/ffprobe';
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { dropboxManager } from "./dropbox-manager";
import { dbManager } from "./db";
import { insertForumSchema, insertMessageSchema, insertCommentSchema, insertAccessRequestSchema, users, forums, forumMembers, messages, files, fileTags, tags, messageTags, forumTags, adminUsers } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import fetch from "node-fetch";
import fs from 'fs';
import { eq, and, or, ilike, exists, isNotNull, sql } from "drizzle-orm";
import { distributedChunkManager } from "./distributed-chunk-manager";
// Transcoding removed - using direct streaming only
import { globalPriorityProcessor } from "./priority-chunk-processor";
import { globalStreamingProcessor } from "./memory-optimizer";
import { registerStreamingUploadRoutes } from "./streaming-routes";
// FFmpeg and transcoding functionality removed

// Configure ffmpeg paths
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
    files: 1
  }
});

// Helper function to parse cookies
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(';').forEach(cookie => {
    const [name, value] = cookie.trim().split('=');
    if (name && value) {
      cookies[name] = decodeURIComponent(value);
    }
  });
  
  return cookies;
}

// WebSocket client management
interface WSClient {
  ws: WebSocket;
  userId?: string;
  forumId?: string;
}

const clients = new Map<WebSocket, WSClient>();

// WebSocket registration: listen for userId from client
function setupWebSocketRegistration(wss) {
  wss.on('connection', (ws) => {
    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg);
        if (data.type === 'register' && data.userId) {
          clients.set(ws, { ws, userId: data.userId });
          console.log('[WebSocket] Registered client for user:', data.userId);
        }
      } catch (e) {
        console.error('[WebSocket] Registration error:', e);
      }
    });
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  // HLS serving removed - using direct streaming only

  app.get("/health", (req, res) => {
    const memoryUsage = process.memoryUsage();
    
    res.json({ 
      status: "healthy", 
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        heap: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        percentage: Math.round((memoryUsage.rss / (512 * 1024 * 1024)) * 100) // Assuming 512MB limit
      }
    });
  });

  app.get("/api/health", (req, res) => {
    // Lightweight health check for alternative pings
    res.json({ 
      ok: true, 
      timestamp: Date.now(),
      pid: process.pid,
      uptime: Math.floor(process.uptime())
    });
  });

  // Setup authentication routes and get session settings
  const sessionSettings = setupAuth(app);

  // Setup session management routes
  const { setupSessionRoutes } = await import("./session-manager");
  setupSessionRoutes(app);

  // Setup app.locals for shared services
  app.locals.chunkManager = distributedChunkManager;
  
  // Middleware to check authentication
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) {
      console.log('🔐 Authentication required but user not authenticated');
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Please log in to access this resource'
      });
    }
    
    if (!req.user?.id) {
      console.log('🔐 User authenticated but missing user ID');
      return res.status(401).json({ 
        error: 'Invalid user session',
        message: 'User session is invalid, please log in again'
      });
    }
    
    next();
  };

  // Optional auth middleware (doesn't require authentication)
  const optionalAuth = (req: any, res: any, next: any) => {
    // Just continue, req.user will be available if authenticated
    next();
  };

  const isAdminUser = async (user: any): Promise<boolean> => {
    if (!user?.username && !user?.email) {
      return false;
    }

    const instances = dbManager.getAllInstances();
    for (const instance of instances) {
      try {
        const admin = await instance.db
          .select({ id: adminUsers.id })
          .from(adminUsers)
          .where(and(
            eq(adminUsers.isActive, true),
            or(
              user.username ? eq(adminUsers.username, user.username) : sql`false`,
              user.email ? eq(adminUsers.email, user.email) : sql`false`
            )
          ))
          .limit(1)
          .then((rows) => rows[0]);

        if (admin) {
          return true;
        }
      } catch (error) {
        console.error(`Error checking admin user in shard ${instance.id}:`, error);
      }
    }

    return false;
  };

  // Debug endpoint to check authentication and user session
  app.get("/api/debug/auth", async (req, res) => {
    try {
      res.json({
        isAuthenticated: req.isAuthenticated(),
        currentUser: req.user ? { 
          id: req.user.id, 
          username: req.user.username,
          email: req.user.email 
        } : null,
        sessionID: req.sessionID,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create test user endpoint
  app.post("/api/debug/create-test-user", async (req, res) => {
    try {
      const testUser = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'testpassword123'
      };

      // Check if test user already exists
      const existing = await storage.getUserByUsername(testUser.username);
      if (existing) {
        return res.json({ message: 'Test user already exists', user: { id: existing.id, username: existing.username } });
      }

      // Create test user
      const hashedPassword = await require('crypto').scrypt(testUser.password, 'salt', 64);
      const user = await storage.createUser({
        ...testUser,
        password: `${hashedPassword.toString('hex')}.salt`
      });

      res.json({ message: 'Test user created successfully', user: { id: user.id, username: user.username } });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Import cluster components for monitoring endpoints
  const { clusterManager } = await import("./cluster-manager");
  const { loadBalancer } = await import("./load-balancer");
  const { memoryOptimizer } = await import("./memory-optimizer");

  // Cluster monitoring endpoints
  app.get("/api/cluster/status", (req, res) => {
    const clusterMetrics = clusterManager.getClusterMetrics();
    const loadBalancerHealth = loadBalancer.getHealthStatus();
    const memoryStats = memoryOptimizer.getMemoryStats();

    res.json({
      cluster: clusterMetrics,
      loadBalancer: loadBalancerHealth,
      memory: memoryStats,
      timestamp: new Date().toISOString()
    });
  });

  app.get("/api/cluster/metrics", (req, res) => {
    const metrics = loadBalancer.getMetrics();
    const workerStats = clusterManager.getWorkerStats();
    
    res.json({
      loadBalancer: metrics,
      workers: workerStats,
      timestamp: new Date().toISOString()
    });
  });

  app.get("/api/cluster/workers", (req, res) => {
    const workers = clusterManager.getAllWorkers();
    res.json(workers);
  });

  app.get("/api/cluster/memory", (req, res) => {
    const memoryStats = memoryOptimizer.getMemoryStats();
    const connectionStats = memoryOptimizer.getConnectionStats();
    
    res.json({
      memory: memoryStats,
      connections: connectionStats,
      timestamp: new Date().toISOString()
    });
  });

  // Distributed Upload Server Management Endpoints
  app.get("/api/upload-servers/status", requireAuth, (req, res) => {
    try {
      const stats = distributedChunkManager.getStats();
      res.json({
        ...stats,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      res.status(500).json({
        error: "Failed to get upload server status",
        message: error.message
      });
    }
  });

  app.post("/api/upload-servers/add", requireAuth, async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({
          error: "Server URL required"
        });
      }

      const success = distributedChunkManager.addServer(url);
      res.json({
        success,
        message: success ? `Successfully added server: ${url}` : `Failed to add server: ${url}`
      });
    } catch (error: any) {
      res.status(500).json({
        error: "Failed to add upload server",
        message: error.message
      });
    }
  });

  app.post("/api/upload-servers/add-batch", requireAuth, async (req, res) => {
    try {
      const { urls } = req.body;
      if (!urls || !Array.isArray(urls)) {
        return res.status(400).json({
          error: "URLs array required"
        });
      }

      console.log(`🚀 Starting batch add of ${urls.length} upload servers...`);
      const result = distributedChunkManager.addServersBatch(urls);
      
      res.json({
        message: `Batch processing complete for ${urls.length} servers`,
        result
      });
    } catch (error: any) {
      res.status(500).json({
        error: "Failed to batch add upload servers",
        message: error.message
      });
    }
  });

  // Upload server registration and discovery endpoints

  app.get("/api/upload-servers/list", (req, res) => {
    try {
      const stats = distributedChunkManager.getStats();
      const serverList = distributedChunkManager.getUploadServers();
      
      const servers = Array.from(serverList.values()).map(server => ({
        serverId: server.id,
        url: server.url,
        region: server.region,
        isActive: server.isActive,
        currentJobs: server.currentJobs,
        maxConcurrentJobs: server.maxConcurrentJobs,
        consecutiveFailures: server.consecutiveFailures,
        totalJobsCompleted: server.totalJobsCompleted,
        averageUploadTime: server.averageUploadTime,
        lastHealthCheck: server.lastHealthCheck
      }));

      res.json({
        servers,
        totalServers: servers.length,
        activeServers: servers.filter(s => s.isActive).length,
        stats
      });
    } catch (error: any) {
      res.status(500).json({
        error: "Failed to list upload servers",
        message: error.message
      });
    }
  });

  app.get("/api/upload-servers/available", async (req, res) => {
    try {
      // For now, return empty array until we have actual servers registered
      const servers: any[] = [];

      res.json({
        servers,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      res.status(500).json({
        error: "Failed to get available servers",
        message: error.message
      });
    }
  });

  // Upload server registration endpoints
  app.post("/api/upload-servers/register", async (req, res) => {
    try {
      const { serverId, url, region, capabilities, maxConcurrentUploads } = req.body;
      
      if (!serverId || !url) {
        return res.status(400).json({
          error: "Missing required fields: serverId, url"
        });
      }

      // Add server to distributed chunk manager
      distributedChunkManager.addUploadServer(url, {
        serverId,
        region: region || 'unknown',
        maxJobs: maxConcurrentUploads || 5,
        capabilities: capabilities || ['file-upload']
      });

      console.log(`📡 Upload server registered: ${serverId} at ${url}`);
      
      res.json({
        success: true,
        serverId,
        message: "Upload server registered successfully"
      });
    } catch (error: any) {
      console.error('❌ Upload server registration failed:', error);
      res.status(500).json({
        error: "Failed to register upload server",
        message: error.message
      });
    }
  });

  app.delete("/api/upload-servers/:serverId", async (req, res) => {
    try {
      const { serverId } = req.params;
      
      // Remove server from distributed chunk manager
      distributedChunkManager.removeUploadServer(serverId);
      
      console.log(`📡 Upload server unregistered: ${serverId}`);
      
      res.json({
        success: true,
        message: "Upload server unregistered successfully"
      });
    } catch (error: any) {
      res.status(500).json({
        error: "Failed to unregister upload server",
        message: error.message
      });
    }
  });

  // Forum routes
  app.get("/api/forums", optionalAuth, async (req, res, next) => {
    try {
      const forums = await storage.getForums();
      
      // Add access information for each forum
      const forumsWithAccess = await Promise.all(
        forums.map(async (forum) => {
          const userId = req.user?.id;
          let hasAccess = forum.isPublic;
          
          if (userId) {
            if (forum.creatorId === userId) {
              hasAccess = true;
            } else if (!hasAccess && !forum.isPublic) {
              // Check if user is a member of this private forum
              hasAccess = await storage.isForumMember(forum.id, userId);
            }
          }
          
          let requestStatus = null;
          let requestId = null;
          
          // If no access and forum is private, check for existing access request
          if (userId && !hasAccess && !forum.isPublic) {
            const existingRequest = await storage.getAccessRequestByUser(forum.id, userId);
            if (existingRequest) {
              requestStatus = existingRequest.status;
              requestId = existingRequest.id;
            }
          }
          
          return {
            ...forum,
            hasAccess,
            requestStatus,
            requestId,
          };
        })
      );
      
      res.json(forumsWithAccess);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/forums/:id", optionalAuth, async (req, res, next) => {
    try {
      const forum = await storage.getForumById(req.params.id);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }

      // Check access for private forums
      if (!forum.isPublic) {
        if (!req.isAuthenticated?.() || !req.user) {
          return res.sendStatus(401);
        }
        const isMember = await storage.isForumMember(forum.id, req.user.id);
        const isCreator = forum.creatorId === req.user.id;
        if (!isMember && !isCreator) {
          return res.status(403).send("Access denied");
        }
      }

      res.json(forum);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/forums", requireAuth, async (req, res, next) => {
    try {
      // Strict check: must be authenticated and have a valid user
      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'Not authenticated', message: 'You must be logged in to create a forum.' });
      }

      const validationResult = insertForumSchema.safeParse(req.body);
      if (!validationResult.success) {
        const error = fromZodError(validationResult.error);
        return res.status(400).send(error.message);
      }

      // Verify user exists in database
      const user = await storage.getUser(req.user.id);
      if (!user) {
        console.error(`🔐 User ${req.user.id} not found in database when creating forum`);
        // Destroy session if user is missing
        if (req.session) req.session.destroy(() => {});
        return res.status(401).json({
          error: 'User not found',
          message: 'Your user account was not found. Please log in again.'
        });
      }

      // Only proceed if user is valid
      console.log(`📋 Creating forum "${validationResult.data.name}" by user ${user.username} (${user.id})`);
      const forum = await storage.createForum(validationResult.data, user.id);

      // Broadcast forum creation to all connected clients
      clients.forEach((c) => {
        if (c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'forum_created',
            forum: forum
          }));
        }
      });

      res.status(201).json(forum);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/forums/:id", requireAuth, async (req, res, next) => {
    try {
      const forum = await storage.getForumById(req.params.id);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }

      if (forum.creatorId !== req.user!.id) {
        return res.status(403).send("Only the creator can delete this forum");
      }

      await storage.deleteForum(req.params.id);

      // Broadcast forum deletion to all connected clients
      clients.forEach((c) => {
        if (c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'forum_deleted',
            forumId: req.params.id
          }));
        }
      });

      res.status(200).json({ message: "Forum deleted successfully" });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/users/:id/forums", requireAuth, async (req, res, next) => {
    try {
      if (req.params.id !== req.user!.id) {
        return res.status(403).send("Access denied");
      }

      const forums = await storage.getUserForums(req.params.id);
      res.json(forums);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/forums/:id/members", requireAuth, async (req, res, next) => {
    try {
      const forum = await storage.getForumById(req.params.id);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }

      if (!forum.isPublic) {
        const isMember = await storage.isForumMember(forum.id, req.user!.id);
        const isCreator = forum.creatorId === req.user!.id;
        if (!isMember && !isCreator) {
          return res.status(403).send("Access denied");
        }
      }

      const members = await storage.getForumMembers(req.params.id);
      res.json(members);
    } catch (error) {
      next(error);
    }
  });

  // Message routes
  app.get("/api/forums/:id/messages", optionalAuth, async (req, res, next) => {
    try {
      const forum = await storage.getForumById(req.params.id);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }

      // Check access
      if (!forum.isPublic) {
        if (!req.isAuthenticated?.() || !req.user) {
          return res.sendStatus(401);
        }
        const isMember = await storage.isForumMember(forum.id, req.user.id);
        if (!isMember) {
          return res.status(403).send("Access denied");
        }
      }

      const messages = await storage.getMessages(req.params.id);
      res.json(messages);
    } catch (error) {
      next(error);
    }
  });

  // File routes
  app.get("/api/forums/:id/files", optionalAuth, async (req, res, next) => {
    try {
      const forum = await storage.getForumById(req.params.id);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }

      // Check access
      if (!forum.isPublic) {
        if (!req.isAuthenticated?.() || !req.user) {
          return res.sendStatus(401);
        }
        const isMember = await storage.isForumMember(forum.id, req.user.id);
        if (!isMember) {
          return res.status(403).send("Access denied");
        }
      }

      const limit = parseInt(req.query.limit as string) || 10;
      const offset = parseInt(req.query.offset as string) || 0;

      const files = await storage.getFiles(req.params.id, limit, offset);
      res.json(files);
    } catch (error) {
      next(error);
    }
  });

  // Get total file count for forum (includes extracted count for Xmaster)
  app.get("/api/forums/:id/files/count", optionalAuth, async (req, res, next) => {
    try {
      const forum = await storage.getForumById(req.params.id);
      if (!forum) return res.status(404).send("Forum not found");

      // Check access
      if (!forum.isPublic) {
        if (!req.isAuthenticated?.() || !req.user) return res.sendStatus(401);
        const isMember = await storage.isForumMember(forum.id, req.user.id);
        if (!isMember) return res.status(403).send("Access denied");
      }

      const counts = await storage.getFilesCount(req.params.id);
      res.json(counts);
    } catch (error) {
      next(error);
    }
  });

  // Update tags for extracted video mappings
  app.post("/api/files/update-extracted-tags", requireAuth, async (req, res, next) => {
    try {
      const { id, tags } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      // Connection string for video mappings DB
      const connectionString = 'postgresql://neondb_owner:npg_rjmolz6Ecn9T@ep-autumn-hall-aho0evwl-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
      const { Client } = await import('pg');
      const client = new Client({ connectionString });

      await client.connect();

      // Update the tags column
      await client.query(
        'UPDATE video_mappings SET tags = $1, last_updated = NOW() WHERE id = $2',
        [tags, id]
      );

      await client.end();

      res.json({ message: 'Tags updated successfully' });
    } catch (error) {
      console.error('Update extracted tags error:', error);
      next(error);
    }
  });

  app.post("/api/files/upload", requireAuth, upload.single("file"), async (req, res, next) => {
        // Strict user existence check
        if (!req.user || !req.user.id) {
          if (req.session) req.session.destroy(() => {});
          return res.status(401).json({ error: 'Not authenticated', message: 'You must be logged in to upload files.' });
        }
        const dbUser = await storage.getUser(req.user.id);
        if (!dbUser) {
          if (req.session) req.session.destroy(() => {});
          return res.status(401).json({ error: 'User not found', message: 'Your user account was not found. Please log in again.' });
        }
    try {
      if (!req.file) {
        return res.status(400).send("No file uploaded");
      }

      const { forumId, checksum, resumeUploadId } = req.body;
      if (!forumId) {
        return res.status(400).send("Forum ID required");
      }

      // Check forum access
      const forum = await storage.getForumById(forumId);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }

      if (!forum.isPublic) {
        const isMember = await storage.isForumMember(forum.id, req.user!.id);
        if (!isMember) {
          return res.status(403).send("Access denied");
        }
      }

      const fileBuffer = req.file.buffer;
      const fileName = req.file.originalname;
      const fileSize = req.file.size;
      const mimeType = req.file.mimetype;

      // Check file size limit (10MB maximum)
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
      if (fileSize > MAX_FILE_SIZE) {
        return res.status(400).json({
          error: "File too large",
          message: `File size (${(fileSize / (1024 * 1024)).toFixed(2)}MB) exceeds the maximum limit of 10MB`,
          maxSize: MAX_FILE_SIZE,
          actualSize: fileSize
        });
      }

      // Skip processing dummy files used for partial upload checking
      if (fileName === "dummy" && fileSize === 0) {
        // Calculate file checksum if not provided
        const actualChecksum = checksum || crypto.createHash('sha256').update(fileBuffer).digest('hex');

        // Check if there's an existing partial upload for this file
        const partialUpload = await storage.getPartialUploadByChecksum(actualChecksum, req.user!.id);
        if (partialUpload) {
          // Ask client if they want to resume
          return res.json({
            resumeRequired: true,
            partialUpload: {
              id: partialUpload.id,
              fileName: partialUpload.fileName,
              fileSize: partialUpload.fileSize,
              uploadedChunks: (partialUpload.uploadedChunks as number[]).length,
              totalChunks: partialUpload.totalChunks,
              progress: ((partialUpload.uploadedChunks as number[]).length / partialUpload.totalChunks) * 100
            }
          });
        }

        // No partial upload found
        return res.json({ resumeRequired: false });
      }

      // Calculate file checksum if not provided
      const actualChecksum = checksum || crypto.createHash('sha256').update(fileBuffer).digest('hex');

      // Prefer client-generated thumbnail for serverless compatibility.
      // This avoids relying on native binaries (sharp/ffmpeg) on Vercel.
      let thumbnail: string | undefined;
      const providedThumbnail = typeof req.body.thumbnail === 'string' ? req.body.thumbnail.trim() : '';
      if (providedThumbnail.startsWith('data:image/')) {
        thumbnail = providedThumbnail;
      } else if (mimeType.startsWith('image/')) {
        try {
          const sharp = await import('sharp');
          const thumbnailBuffer = await sharp.default(fileBuffer)
            .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
          thumbnail = `data:${mimeType};base64,${thumbnailBuffer.toString('base64')}`;
          console.log(`✅ Generated thumbnail for ${fileName}`);
        } catch (error) {
          console.warn(`Failed to generate thumbnail for ${fileName}:`, error);
        }
      } else if (mimeType.startsWith('video/')) {
        try {
          // Write video buffer to temp file for ffmpeg processing
          const fs = await import('fs/promises');
          const os = await import('os');
          const path = await import('path');

          const tempVideoPath = path.join(os.tmpdir(), `temp_video_${crypto.randomUUID()}${path.extname(fileName)}`);
          await fs.writeFile(tempVideoPath, fileBuffer);

          // Generate video thumbnail
          const thumbnailBuffer = await generateVideoThumbnail(tempVideoPath);
          if (thumbnailBuffer) {
            thumbnail = `data:image/jpeg;base64,${thumbnailBuffer.toString('base64')}`;
            console.log(`✅ Generated video thumbnail for ${fileName}`);
          }

          // Clean up temp file
          await fs.unlink(tempVideoPath);
        } catch (error) {
          console.warn(`Failed to generate video thumbnail for ${fileName}:`, error);
        }
      }

      let partialUpload: any = null;
      let uploadedChunks: number[] = [];
      let resumeFromChunk = 0;

      // Check if resuming an existing upload
      if (resumeUploadId) {
        partialUpload = await storage.getPartialUploadByChecksum(actualChecksum, req.user!.id);
        if (partialUpload && partialUpload.id === resumeUploadId) {
          uploadedChunks = partialUpload.uploadedChunks || [];
          resumeFromChunk = uploadedChunks.length;
        }
      } else {
        // Check if there's an existing partial upload for this file
        partialUpload = await storage.getPartialUploadByChecksum(actualChecksum, req.user!.id);
        if (partialUpload) {
          // Ask client if they want to resume
          return res.json({
            resumeRequired: true,
            partialUpload: {
              id: partialUpload.id,
              fileName: partialUpload.fileName,
              fileSize: partialUpload.fileSize,
              uploadedChunks: partialUpload.uploadedChunks.length,
              totalChunks: partialUpload.totalChunks,
              progress: (partialUpload.uploadedChunks.length / partialUpload.totalChunks) * 100
            }
          });
        }
      }

      // Create partial upload if it doesn't exist
      if (!partialUpload) {
        const chunkSize = dropboxManager.getChunkSize();
        const totalChunks = Math.ceil(fileSize / chunkSize);
        
        partialUpload = await storage.createPartialUpload(
          forumId,
          req.user!.id,
          fileName,
          fileSize,
          mimeType,
          actualChecksum,
          totalChunks
        );
        uploadedChunks = [];
        resumeFromChunk = 0;
      } else {
        uploadedChunks = partialUpload.uploadedChunks || [];
        resumeFromChunk = uploadedChunks.length;
      }

      // Verify storage capacity before uploading (both Dropbox and Database)
      // Skip verification for small files or if we have space available
      try {
        const dropboxCheck = await dropboxManager.verifyCapacity(fileSize);
        if (!dropboxCheck.success && fileSize > 100 * 1024 * 1024) { // Only fail for files > 100MB
          console.warn('Dropbox capacity check failed:', dropboxCheck.message);
          // Don't fail upload, just warn
        }
      } catch (error) {
        console.warn('Dropbox capacity check error:', error);
        // Continue with upload
      }

      // Calculate chunk information
      const chunkSize = dropboxManager.getChunkSize();
      const numChunks = Math.ceil(fileSize / chunkSize);
      
      // Estimate database storage needed for file metadata and chunks
      const estimatedDbSize = 1000 + (numChunks * 500); // File record + chunk records
      
      // Check database capacity but be more lenient
      try {
        const dbCheck = await dbManager.verifyCapacity(estimatedDbSize);
        if (!dbCheck.success) {
          console.warn('Database capacity warning:', dbCheck.message);
          // Continue with upload but warn
        }
      } catch (error) {
        console.warn('Database capacity check error:', error);
        // Continue with upload
      }

      // Create file record
      const file = await storage.createFile(forumId, req.user!.id, fileName, fileSize, mimeType, thumbnail);
      
      // Find the next chunk to upload (first missing chunk)
      let nextChunkToUpload = 0;
      for (let i = 0; i < numChunks; i++) {
        if (!uploadedChunks.includes(i)) {
          nextChunkToUpload = i;
          break;
        }
      }
      
      // Send initial progress update
      clients.forEach((c) => {
        if (c.userId === req.user!.id && c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'upload_progress',
            fileId: file.id,
            progress: (uploadedChunks.length / numChunks) * 100,
            status: nextChunkToUpload > 0 ? 'resuming' : 'starting'
          }));
        }
      });

      try {
        console.log(`🚀 Starting distributed upload for ${numChunks} chunks using upload servers...`);
        
        // Process all chunks locally
        for (let i = nextChunkToUpload; i < numChunks; i++) {
          // Skip already uploaded chunks
          if (uploadedChunks.includes(i)) {
            continue;
          }

          const start = i * chunkSize;
          const end = Math.min(start + chunkSize, fileSize);
          const chunk = fileBuffer.slice(start, end);
          const dropboxPath = `/forums/${forumId}/${file.id}/chunk_${i}`;

          // Find best account for this chunk
          const accountId = dropboxManager.findBestAccount(chunk.length);
          if (accountId === null) {
             throw new Error('No Dropbox account has sufficient space');
          }

          // Upload to Dropbox
          console.log(`📤 Uploading chunk ${i}/${numChunks} to Dropbox account ${accountId}...`);
          const uploadResult = await dropboxManager.uploadChunkWithRetry(
            accountId,
            chunk,
            dropboxPath
          );

          // Save chunk record to database
          await storage.createFileChunk(
            file.id,
            i,
            chunk.length,
            uploadResult.checksum,
            accountId,
            uploadResult.dropboxPath,
            uploadResult.dropboxFileId,
            uploadResult.downloadUrl
          );

          uploadedChunks.push(i);
          
          // Send progress update
          const progressPercent = (uploadedChunks.length / numChunks) * 100;
          clients.forEach((c) => {
            if (c.userId === req.user!.id && c.ws.readyState === WebSocket.OPEN) {
              c.ws.send(JSON.stringify({
                type: 'upload_progress',
                fileId: file.id,
                progress: progressPercent,
                status: uploadedChunks.length === numChunks ? 'completed' : 'processing'
              }));
            }
          });
          
          // Update partial upload progress
          await storage.updatePartialUploadChunks(partialUpload.id, uploadedChunks);
        }


        


        console.log(`🎉 Successfully processed all ${numChunks} chunks`);

        // Clean up partial upload on successful completion
        await storage.deletePartialUpload(partialUpload.id);

        // Broadcast file upload completion to all clients in the forum
        // Attach full user object to avoid 'Unknown' display on clients that receive this event
        const uploader = await storage.getUser(req.user!.id);
        const fileWithUser = { ...file, user: uploader };

        clients.forEach((c) => {
          if (c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(JSON.stringify({
              type: 'file_uploaded',
              forumId: forumId,
              data: {
                file: fileWithUser,
                filename: fileWithUser.fileName,
                forumId: forumId
              }
            }));
          }
        });

        res.status(201).json({ success: true, fileId: file.id });
      } catch (uploadError) {
        // Update partial upload with current progress
        await storage.updatePartialUploadChunks(partialUpload.id, uploadedChunks);

        // Send error progress update
        clients.forEach((c) => {
          if (c.userId === req.user!.id && c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(JSON.stringify({
              type: 'upload_progress',
              fileId: file.id,
              progress: (uploadedChunks.length / numChunks) * 100,
              status: 'error',
              error: uploadError instanceof Error ? uploadError.message : 'Upload failed'
            }));
          }
        });

        // Rollback: delete uploaded chunks and file record on failure
        console.error("Upload failed, initiating rollback:", uploadError);
        
        // Delete chunks that were uploaded in this session
        for (let i = nextChunkToUpload; i < uploadedChunks.length; i++) {
          const chunkIndex = uploadedChunks[i];
          try {
            const chunk = await storage.getFileById(file.id);
            if (chunk) {
              const chunkData = chunk.chunks.find(c => c.chunkIndex === chunkIndex);
              if (chunkData && chunkData.dropboxPath) {
                await dropboxManager.deleteChunk(chunkData.dropboxAccountId, chunkData.dropboxPath);
                dropboxManager.updateAccountUsage(chunkData.dropboxAccountId, -chunkData.chunkSize);
              }
            }
          } catch (deleteError) {
            console.error(`Failed to delete chunk ${chunkIndex} during rollback:`, deleteError);
          }
        }
        
        // Remove uploaded chunks from the list
        uploadedChunks.splice(nextChunkToUpload);
        await storage.updatePartialUploadChunks(partialUpload.id, uploadedChunks);

        throw uploadError;
      }
    } catch (error) {
      console.error("File upload error:", error);
      next(error);
    }
  });

  // Register streaming upload routes for large files
  registerStreamingUploadRoutes(app, requireAuth, clients, storage, dropboxManager);

  // Callback endpoint for distributed upload servers to report progress
  app.post("/api/upload/callback", express.json(), async (req, res) => {
    try {
      const { 
        jobId, 
        fileId, 
        chunkIndex, 
        status, 
        progress, 
        phase,
        serverId, 
        message, 
        error,
        chunkId,
        checksum,
        downloadUrl
      } = req.body;

      console.log(`📡 Upload callback received - Job: ${jobId}, Chunk: ${chunkIndex}, Phase: ${phase || status}, Progress: ${progress || 'N/A'}%`);

      // Get the distributed chunk manager instance
      const chunkManager = req.app.locals.chunkManager;
      if (!chunkManager) {
        console.warn('⚠️ No chunk manager available for callback processing');
        return res.status(503).json({ 
          success: false, 
          message: 'Chunk manager not available' 
        });
      }

      // Update job status in chunk manager
      if (chunkManager.updateJobStatus) {
        chunkManager.updateJobStatus(jobId, {
          status: status || (error ? 'failed' : 'uploading'),
          progress: progress || 0,
          phase: phase || status,
          message: message || error,
          serverId: serverId,
          chunkId: chunkId,
          checksum: checksum,
          downloadUrl: downloadUrl,
          lastUpdate: Date.now()
        });
      }

      // Send real-time progress update to connected clients
      const wsManager = req.app.locals.wsManager;
      if (wsManager && fileId) {
        try {
          // Calculate overall file progress if possible
          let fileProgress = progress || 0;
          if (chunkManager.getFileProgress) {
            fileProgress = chunkManager.getFileProgress(fileId);
          }

          wsManager.broadcast({
            type: 'upload_progress',
            fileId: fileId,
            jobId: jobId,
            chunkIndex: parseInt(chunkIndex),
            status: status || (error ? 'failed' : 'uploading'),
            phase: phase || status || 'processing',
            progress: fileProgress,
            chunkProgress: progress || 0,
            message: message || error || `Chunk ${chunkIndex} ${phase || status}`,
            serverId: serverId,
            timestamp: Date.now()
          });
        } catch (broadcastError) {
          console.warn('⚠️ Failed to broadcast progress update:', broadcastError.message);
        }
      }

      // Handle completion or failure
      if (status === 'completed') {
        console.log(`✅ Chunk ${chunkIndex} completed successfully on ${serverId}`);
        res.json({ 
          success: true, 
          message: 'Progress updated successfully',
          acknowledged: true 
        });
      } else if (status === 'failed' || error) {
        console.error(`❌ Chunk ${chunkIndex} failed on ${serverId}: ${error || message}`);
        res.json({ 
          success: true, 
          message: 'Failure acknowledged',
          acknowledged: true 
        });
      } else {
        // In-progress update
        res.json({ 
          success: true, 
          message: 'Progress update received',
          acknowledged: true 
        });
      }

    } catch (callbackError) {
      console.error('❌ Upload callback processing error:', callbackError);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to process callback',
        error: callbackError.message 
      });
    }
  });

  // Speed test endpoint for adaptive bitrate detection
  app.head("/api/files/:id/speed-test", requireAuth, async (req, res) => {
    // Simple endpoint to test connection speed
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.status(200).end();
  });

  // Transcoding endpoints removed - using direct streaming only

  // Get video metadata (duration, etc.)
  app.get("/api/files/:id/metadata", requireAuth, async (req, res) => {
    try {
      const file = await storage.getFileById(req.params.id);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      // Determine input URL
      let inputUrl = file.directDownloadUrl;
      if (!inputUrl) {
        return res.status(400).json({ error: "File does not have a direct download URL" });
      }
      inputUrl = getDirectDownloadUrl(inputUrl);

      // Use ffprobe to get metadata
      const ffmpeg = (await import('fluent-ffmpeg')).default;
      
      // Try to set ffprobe path from installer if available
      try {
        const ffprobeInstaller = (await import('@ffprobe-installer/ffprobe')).default;
        ffmpeg.setFfprobePath(ffprobeInstaller.path);
      } catch (e) {
        console.warn("Could not load @ffprobe-installer/ffprobe, relying on system path");
      }

      ffmpeg.ffprobe(inputUrl, (err, metadata) => {
        if (err) {
          console.error("ffprobe error:", err);
          return res.status(500).json({ error: "Failed to probe file" });
        }
        
        res.json({
          duration: metadata.format.duration,
          format: metadata.format.format_name,
          streams: metadata.streams.map(s => ({
            codec_type: s.codec_type,
            codec_name: s.codec_name,
            width: s.width,
            height: s.height
          }))
        });
      });

    } catch (error: any) {
      console.error("Metadata request error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get full file metadata and details (includes chunks for local files)
  app.get('/api/files/:id', optionalAuth, async (req, res, next) => {
    try {
      const id = req.params.id;
      const file = await storage.getFileById(id);
      if (!file) return res.status(404).json({ error: 'File not found' });

      // Access check: verify forum membership if forum is private
      try {
        const forum = await storage.getForumById(file.forumId);
        if (forum && !forum.isPublic) {
          if (!req.isAuthenticated?.() || !req.user) return res.sendStatus(401);
          const isMember = await storage.isForumMember(forum.id, req.user.id);
          const isCreator = forum.creatorId === req.user.id;
          if (!isMember && !isCreator) return res.status(403).json({ error: 'Access denied' });
        }
      } catch (e) {
        // If forum lookup fails, continue; non-fatal
      }

      res.json(file);
    } catch (error) {
      next(error);
    }
  });



  // Advanced video streaming endpoint with adaptive bitrate and chunked delivery
  // Simple request cache for chunk-info to prevent duplicate processing
  const chunkInfoCache = new Map<string, { data: any, timestamp: number }>();
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Get priority chunk status
  app.get("/api/files/:id/priority-status", requireAuth, async (req, res, next) => {
    try {
      const fileId = req.params.id;
      
      const file = await storage.getFileById(fileId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      // Check access permissions
      if (!file.isPublic) {
        const user = req.user as SelectUser;
        if (!user) {
          return res.status(401).json({ error: "Authentication required" });
        }
        
        const hasAccess = await storage.isForumMember(file.forumId, user.id);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      
      const processorStatus = globalPriorityProcessor.getStatus();
      const streamingStatus = globalStreamingProcessor.getStatus?.() || { activeChunks: [], priorityChunks: [] };
      
      res.json({
        fileId,
        fileName: file.fileName,
        priorityProcessor: processorStatus,
        streamingProcessor: streamingStatus,
        timestamp: Date.now()
      });
      
    } catch (error: any) {
      console.error("Priority status error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Cancel all priority processing
  app.post("/api/priority-processing/cancel-all", requireAuth, async (req, res, next) => {
    try {
      console.log('[PriorityProcessor] Cancelling all priority processing');
      
      globalPriorityProcessor.cancelAll();
      globalStreamingProcessor.clearPriorityChunks();
      
      res.json({
        success: true,
        message: 'All priority processing cancelled',
        timestamp: Date.now()
      });
      
    } catch (error: any) {
      console.error("Cancel priority processing error:", error);
      res.status(500).json({ error: error.message });
    }
  });


  // Get chunk information for smart seeking calculations
  app.get("/api/files/:id/chunk-info", requireAuth, async (req, res, next) => {
    try {
      const fileId = req.params.id;
      const cacheKey = `chunk-info-${fileId}`;
      const now = Date.now();
      
      // Check cache first
      const cached = chunkInfoCache.get(cacheKey);
      if (cached && (now - cached.timestamp) < CACHE_TTL) {
        console.log(`[ChunkInfo] Serving cached data for file ${fileId}`);
        return res.json(cached.data);
      }
      
      console.log(`[ChunkInfo] Fetching fresh data for file ${fileId}`);
      const file = await storage.getFileById(fileId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      // Check access permissions
      if (!file.isPublic) {
        const user = req.user as SelectUser;
        if (!user) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const hasAccess = await storage.isForumMember(file.forumId, user.id);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const chunks = file.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      const chunkInfo = chunks.map((chunk, index) => ({
        index: chunk.chunkIndex,
        size: chunk.size,
        startByte: chunks.slice(0, index).reduce((sum, c) => sum + c.size, 0),
        endByte: chunks.slice(0, index + 1).reduce((sum, c) => sum + c.size, 0) - 1
      }));

      const responseData = {
        totalChunks: chunks.length,
        totalSize: file.fileSize,
        chunks: chunkInfo,
        avgChunkSize: file.fileSize / chunks.length
      };

      // Cache the response
      chunkInfoCache.set(cacheKey, { data: responseData, timestamp: now });
      
      // Clean up expired cache entries periodically
      if (chunkInfoCache.size > 100) {
        for (const [key, value] of chunkInfoCache.entries()) {
          if ((now - value.timestamp) > CACHE_TTL) {
            chunkInfoCache.delete(key);
          }
        }
      }

      res.json(responseData);

    } catch (error) {
      console.error("Chunk info error:", error);
      next(error);
    }
  });

  // Immediate chunk processing endpoint for priority requests
  app.post("/api/files/:id/priority-chunk", requireAuth, async (req, res, next) => {
    try {
      const { chunkIndex, forceProcess = true } = req.body;
      const fileId = req.params.id;
      
      if (chunkIndex === undefined || chunkIndex < 0) {
        return res.status(400).json({ error: "Valid chunk index required" });
      }
      
      const file = await storage.getFileById(fileId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      // Check access permissions
      if (!file.isPublic) {
        const user = req.user as SelectUser;
        if (!user) {
          return res.status(401).json({ error: "Authentication required" });
        }
        
        const hasAccess = await storage.isForumMember(file.forumId, user.id);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      
      const chunks = file.chunks?.sort((a, b) => a.chunkIndex - b.chunkIndex) || [];
      const targetChunk = chunks.find(c => c.chunkIndex === chunkIndex);
      
      if (!targetChunk) {
        return res.status(404).json({ error: "Chunk not found" });
      }
      
      console.log(`[PriorityChunk] Processing priority request for chunk ${chunkIndex} of file ${file.fileName}`);
      
      // Set this chunk as priority in our streaming processor
      globalStreamingProcessor.setPriorityChunks([chunkIndex]);
      
      try {
        // Process the chunk with high priority
        const result = await globalPriorityProcessor.processChunkImmediate(
          `${fileId}-${chunkIndex}`,
          chunkIndex,
          async (signal) => {
            // Simulate immediate chunk processing
            await new Promise(resolve => {
              if (signal.aborted) {
                throw new Error('Aborted');
              }
              
              // Check if chunk needs processing (in a real scenario, this would check if chunk is already processed/available)
              setTimeout(() => {
                if (signal.aborted) {
                  throw new Error('Aborted');
                }
                resolve(null);
              }, 100); // Small delay to simulate immediate processing
            });
            
            return {
              chunkId: `${fileId}-${chunkIndex}`,
              chunkIndex,
              processed: true,
              timestamp: Date.now()
            };
          },
          {
            priority: 'high',
            cancelOthers: forceProcess,
            timeout: 15000 // 15 second timeout for chunk processing
          }
        );
        
        console.log(`[PriorityChunk] Successfully processed priority chunk ${chunkIndex} for file ${file.fileName}`);
        
        res.json({
          success: true,
          message: `Chunk ${chunkIndex} processed with high priority`,
          result,
          streamUrl: `/api/files/${fileId}/stream?chunk=${chunkIndex}&priority=true`
        });
        
      } catch (error: any) {
        console.error(`[PriorityChunk] Failed to process priority chunk ${chunkIndex}:`, error);
        res.status(500).json({
          success: false,
          error: "Failed to process priority chunk",
          message: error.message
        });
      }
      
    } catch (error: any) {
      console.error("Priority chunk processing error:", error);
      res.status(500).json({ error: error.message });
    }
  });



  // Smart streaming endpoint for optimized seeking
  // On-the-fly transcoding endpoint removed - using direct streaming only

  app.get("/api/files/:id/stream-smart", requireAuth, async (req, res, next) => {
    try {
      const fileId = req.params.id;
      const file = await storage.getFileById(fileId);
      if (!file) {
        return res.status(404).send("File not found");
      }

      const seekTime = parseFloat(req.query.seekTime as string) || 0;
      const duration = parseFloat(req.query.duration as string) || 0;
      const bufferAhead = parseInt(req.query.bufferAhead as string) || 2; // Number of chunks to buffer ahead
      const bufferBehind = parseInt(req.query.bufferBehind as string) || 1; // Number of chunks to buffer behind
      
      console.log(`[SmartStream] 🎯 SMART SEEK DEBUG for ${file.fileName}:`);
      console.log(`[SmartStream]   - seekTime: ${seekTime}s (${Math.floor(seekTime/60)}:${Math.floor(seekTime%60).toString().padStart(2,'0')})`);
      console.log(`[SmartStream]   - duration: ${duration}s (${Math.floor(duration/60)}:${Math.floor(duration%60).toString().padStart(2,'0')})`);
      console.log(`[SmartStream]   - bufferAhead: ${bufferAhead}, bufferBehind: ${bufferBehind}`);

      // Check access permissions
      if (!file.isPublic) {
        const user = req.user as SelectUser;
        if (!user) {
          return res.status(401).send("Authentication required");
        }

        const hasAccess = await storage.isForumMember(file.forumId, user.id);
        if (!hasAccess) {
          return res.status(403).send("Access denied");
        }
      }

      // Calculate target chunk based on seek time
      const chunks = file.chunks?.sort((a, b) => a.chunkIndex - b.chunkIndex) || [];
      
      // Handle files without chunks (e.g., admin-created files with direct URLs)
      if (chunks.length === 0) {
        console.log(`[SmartSeek] No chunks found for file ${file.fileName} (${file.id}), checking for direct URL fallback`);
        
        // If it's an admin-created file with a direct URL, use range requests on the direct URL
        if (file.isAdminCreated && file.directDownloadUrl) {
          console.log(`[SmartSeek] Using direct URL streaming for ${file.fileName}: ${file.directDownloadUrl}`);
          
          // Calculate byte range based on seek time with better video-aware logic
          const seekRatio = duration > 0 ? seekTime / duration : 0;
          const fileSize = file.fileSize || 0;
          
          // For video files, we need to account for metadata and keyframes
          // Start a bit earlier to ensure we get a keyframe
          const safeSeekRatio = Math.max(0, seekRatio - 0.02); // Go back 2% to catch keyframe
          const chunkSize = 1024 * 1024 * 8; // 8MB chunks for better video streaming
          const startByte = Math.floor(safeSeekRatio * fileSize);
          const endByte = Math.min(startByte + chunkSize - 1, fileSize - 1);
          
          console.log(`[SmartSeek] 🎯 BYTE RANGE CALCULATION:`);
          console.log(`[SmartSeek]   - seekTime: ${seekTime}s (${Math.floor(seekTime/60)}:${Math.floor(seekTime%60).toString().padStart(2,'0')})`);
          console.log(`[SmartSeek]   - duration: ${duration}s (${Math.floor(duration/60)}:${Math.floor(duration%60).toString().padStart(2,'0')})`);
          console.log(`[SmartSeek]   - seekRatio: ${seekRatio.toFixed(4)} (${(seekRatio * 100).toFixed(2)}%)`);
          console.log(`[SmartSeek]   - fileSize: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);
          console.log(`[SmartSeek]   - startByte: ${startByte} (${(startByte / 1024 / 1024).toFixed(2)}MB)`);
          console.log(`[SmartSeek]   - endByte: ${endByte} (${(endByte / 1024 / 1024).toFixed(2)}MB)`);
          console.log(`[SmartSeek]   - Range: ${startByte}-${endByte} (${((endByte - startByte + 1) / 1024 / 1024).toFixed(2)}MB)`);
          
          // Validate byte range
          if (startByte >= fileSize || endByte >= fileSize || startByte > endByte) {
            console.error(`[SmartSeek] Invalid byte range: ${startByte}-${endByte} for file size ${fileSize}`);
            return res.redirect(302, `/api/files/${file.id}/stream`);
          }
          
          try {
            console.log(`[SmartSeek] Fetching range from: ${file.directDownloadUrl}`);
            console.log(`[SmartSeek] Range header: bytes=${startByte}-${endByte}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
            
            const response = await fetch(file.directDownloadUrl, {
              headers: { 
                'Range': `bytes=${startByte}-${endByte}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'video/webm,video/mp4,video/*;q=0.9,*/*;q=0.8',
                'Accept-Encoding': 'identity',
                'Connection': 'keep-alive'
              },
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            console.log(`[SmartSeek] Direct URL response: ${response.status} ${response.statusText}`);
            console.log(`[SmartSeek] Response headers:`, {
              'content-length': response.headers.get('content-length'),
              'content-range': response.headers.get('content-range'),
              'content-type': response.headers.get('content-type'),
              'accept-ranges': response.headers.get('accept-ranges')
            });
            
            if (response.ok) {
              res.setHeader('Content-Type', file.mimeType || 'video/mp4');
              res.setHeader('Accept-Ranges', 'bytes');
              res.setHeader('Content-Length', endByte - startByte + 1);
              res.setHeader('Content-Range', `bytes ${startByte}-${endByte}/${fileSize}`);
              res.setHeader('X-Smart-Seek-Mode', 'direct-url');
              res.setHeader('X-Smart-Seek-Time', seekTime.toString());
              res.setHeader('X-Smart-Seek-Duration', duration.toString());
              res.setHeader('X-Smart-Seek-Ratio', seekRatio.toString());
              res.status(206);
              
              // Use Node.js stream approach instead of Web Streams API
              if (response.body) {
                try {
                  console.log(`[SmartSeek] Streaming ${((endByte - startByte + 1) / 1024 / 1024).toFixed(2)}MB from direct URL`);
                  
                  // Try to pipe the response body directly to the client
                  if (typeof response.body.pipe === 'function') {
                    response.body.pipe(res);
                    
                    response.body.on('error', (error) => {
                      console.error(`[SmartSeek] Stream error:`, error);
                      if (!res.headersSent) {
                        res.status(500).end('Streaming error');
                      }
                    });
                    
                    response.body.on('end', () => {
                      console.log(`[SmartSeek] Stream completed for ${file.fileName}`);
                    });
                    
                    return;
                  } else {
                    // Fallback: convert to buffer and send
                    console.log(`[SmartSeek] Using buffer fallback for streaming`);
                    const buffer = Buffer.from(await response.arrayBuffer());
                    res.write(buffer);
                    res.end();
                    console.log(`[SmartSeek] Buffer streaming completed for ${file.fileName}`);
                    return;
                  }
                } catch (streamError) {
                  console.error(`[SmartSeek] Streaming error:`, streamError);
                }
              } else {
                console.error(`[SmartSeek] No response body available`);
              }
            } else {
              console.error(`[SmartSeek] Direct URL request failed: ${response.status} ${response.statusText}`);
            }
          } catch (error) {
            console.error(`[SmartSeek] Error fetching direct URL:`, error);
          }
        }
        
        // Fallback to regular streaming endpoint with range support
        console.log(`[SmartSeek] Falling back to regular streaming for ${file.fileName}`);
        
        // Forward the range request to regular streaming
        const rangeHeader = req.headers.range;
        if (!rangeHeader) {
          // Create a range header based on seek time for better fallback
          const seekRatio = duration > 0 ? seekTime / duration : 0;
          const estimatedStart = Math.floor(seekRatio * (file.fileSize || 0));
          req.headers.range = `bytes=${estimatedStart}-`;
          console.log(`[SmartSeek] Added range header for fallback: bytes=${estimatedStart}-`);
        }
        
        // Redirect to regular streaming with the modified request
        return res.redirect(302, `/api/files/${file.id}/stream`);
      }

      console.log(`[SmartSeek] File: ${file.fileName} (${file.id})`);
      console.log(`[SmartSeek] Request params: seekTime=${seekTime}s, duration=${duration}s, bufferAhead=${bufferAhead}, bufferBehind=${bufferBehind}`);
      console.log(`[SmartSeek] Total chunks available: ${chunks.length}`);

      // Estimate which chunk contains the seek time
      const seekRatio = duration > 0 ? seekTime / duration : 0;
      const targetChunkIndex = Math.floor(seekRatio * chunks.length);
      
      // Calculate range of chunks to load (target ± buffer)
      const startChunkIndex = Math.max(0, targetChunkIndex - bufferBehind);
      const endChunkIndex = Math.min(chunks.length - 1, targetChunkIndex + bufferAhead);
      
      const chunksToLoad = chunks.slice(startChunkIndex, endChunkIndex + 1);
      
      console.log(`[SmartSeek] Seek calculation: ratio=${seekRatio.toFixed(3)}, targetChunk=${targetChunkIndex}`);
      console.log(`[SmartSeek] Loading chunks ${startChunkIndex} to ${endChunkIndex} (${chunksToLoad.length} chunks)`);
      console.log(`[SmartSeek] Chunk details:`, chunksToLoad.map(c => `${c.chunkIndex}(${Math.round(c.size/1024)}KB)`).join(', '));

      // Calculate total size of chunks to load
      const totalSize = chunksToLoad.reduce((sum, chunk) => sum + chunk.size, 0);
      console.log(`[SmartSeek] Total size to stream: ${Math.round(totalSize/1024/1024*100)/100}MB`);
      
      res.setHeader('Content-Type', file.mimeType || 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', totalSize);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Seek-Chunks', `${startChunkIndex}-${endChunkIndex}`);
      res.setHeader('X-Target-Chunk', targetChunkIndex.toString());

      await streamSpecificChunks(chunksToLoad, res);

    } catch (error) {
      console.error("Smart streaming error:", error);
      next(error);
    }
  });

  app.get("/api/files/:id/stream", requireAuth, async (req, res, next) => {
    try {
      const file = await storage.getFileById(req.params.id);
      if (!file) {
        return res.status(404).send("File not found");
      }

      // Parse quality and adaptive parameters
      const requestedQuality = parseInt(req.query.quality as string) || 720;
      const adaptiveMode = req.query.adaptive === 'true';
      const chunkIndex = parseInt(req.query.chunk as string) || -1;
      const chunkSize = parseInt(req.query.size as string) || 1024 * 1024; // 1MB default
      const isPriorityRequest = req.query.priority === 'true';
      
      // If this is a priority request for a specific chunk, set it as priority
      // Removed priority queue logic as requested
      /*
      if (isPriorityRequest && chunkIndex >= 0) {
        console.log(`[Stream] Setting chunk ${chunkIndex} as priority for file ${file.fileName}`);
        globalStreamingProcessor.setPriorityChunks([chunkIndex]);
      }
      */

      // Check access permissions
      if (!file.isPublic) {
        const user = req.user as SelectUser;
        if (!user) {
          return res.status(401).send("Authentication required");
        }

        // Check if user can access this file based on forum membership
        const hasAccess = await storage.isForumMember(file.forumId, user.id);
        if (!hasAccess) {
          return res.status(403).send("Access denied");
        }
      }

      // Handle admin-created files with direct URLs using advanced streaming
      if (file.isAdminCreated && file.directDownloadUrl) {
        // Special handling for M3U8 files - return the M3U8 playlist directly for HLS.js
        if (file.mimeType === 'application/x-mpegurl' || file.directDownloadUrl.toLowerCase().endsWith('.m3u8')) {
          console.log(`[M3U8 Direct] Serving M3U8 playlist directly for: ${file.fileName}, URL: ${file.directDownloadUrl}`);
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const response = await fetch(file.directDownloadUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              },
              signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
              console.error(`[M3U8 Direct] Failed to fetch M3U8 playlist: ${response.status}`);
              return res.status(response.status).json({ error: 'Failed to fetch M3U8 playlist' });
            }

            const m3u8Content = await response.text();
            console.log(`[M3U8 Direct] Successfully fetched M3U8 playlist, length: ${m3u8Content.length} chars`);

            // Rewrite .ts URLs to use the proxy for CORS
            const baseUrl = new URL(file.directDownloadUrl).origin + new URL(file.directDownloadUrl).pathname.split('/').slice(0, -1).join('/') + '/';
            // Use configured media proxy base URL in env, or derive from request
            const defaultProxyHost = `${req.protocol}://${req.get('host')}`;
            const proxyBaseUrl = process.env.MEDIA_PROXY_BASE || defaultProxyHost;
            const rewrittenContent = m3u8Content.split('\n').map(line => {
              if (line.trim() && !line.startsWith('#')) {
                try {
                  const fullUrl = new URL(line, baseUrl).href;
                  return `${proxyBaseUrl}/api/proxy?url=${encodeURIComponent(fullUrl)}`;
                } catch (error) {
                  console.error(`[M3U8 Direct] Error rewriting URL ${line}:`, error);
                  return line;
                }
              }
              return line;
            }).join('\n');

            res.setHeader('Content-Type', 'application/x-mpegurl');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.send(rewrittenContent);
            return;
          } catch (error) {
            console.error(`[M3U8 Direct] Error fetching M3U8 playlist:`, error);
            return res.status(500).json({ error: 'Failed to fetch M3U8 playlist', message: error.message });
          }
        }

        try {
          return await handleExternalFileStreaming(file, req, res, { chunkIndex, chunkSize, adaptiveMode });
        } catch (error) {
          console.error(`[Streaming] External URL streaming failed for ${file.fileName}:`, error.message);
          // Return error for external URL failures
          return res.status(502).json({ 
            error: 'External video source unavailable', 
            message: 'The video source is temporarily unavailable. Please try again later.',
            details: error.message.includes('ETIMEDOUT') ? 'Connection timeout' : 'Network error'
          });
        }
      }

      // Handle regular chunked files with enhanced streaming
      const contentLength = file.fileSize;
      const range = req.headers.range;

      res.setHeader('Content-Type', file.mimeType || 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Range');

      // Handle chunked streaming for MSE
      if (chunkIndex >= 0) {
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize - 1, contentLength - 1);
        
        if (start >= contentLength) {
          return res.status(416).send('Range Not Satisfiable');
        }

        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${contentLength}`);
        res.setHeader('Content-Length', end - start + 1);

        await streamFileRange(file, start, end, res);
        return;
      }

      // Handle range requests with optimized chunk size
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        // Increase chunk size to 10MB for better streaming performance
        const CHUNK_SIZE = 10 * 1024 * 1024; 
        const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + CHUNK_SIZE - 1, contentLength - 1);
        const chunksize = (end - start) + 1;

        console.log(`[RegularStream] Range request for ${file.fileName}: bytes=${start}-${end} (${Math.round(chunksize/1024)}KB)`);

        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${contentLength}`);
        res.setHeader('Content-Length', chunksize);

        await streamFileRange(file, start, end, res);
      } else {
        console.log(`[RegularStream] Full file request for ${file.fileName} (${Math.round(contentLength/1024/1024*100)/100}MB)`);
        // For non-range requests, still use chunked streaming
        res.setHeader('Content-Length', contentLength);
        await streamFileRange(file, 0, contentLength - 1, res);
      }

    } catch (error) {
      console.error("File streaming error:", error);
      next(error);
    }
  });

  // Helper to optimize external URLs (e.g. Dropbox, Google Drive)
  function getDirectDownloadUrl(url: string): string {
    if (!url) return url;
    
    // Handle Dropbox URLs
    if (url.includes('dropbox.com')) {
      // Replace www.dropbox.com with dl.dropboxusercontent.com for direct access
      // and remove dl=0 or dl=1 query params to avoid confusion
      let directUrl = url.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
      
      // Remove existing query params that might conflict
      try {
        const urlObj = new URL(directUrl);
        urlObj.searchParams.delete('dl');
        urlObj.searchParams.delete('raw');
        return urlObj.toString();
      } catch (e) {
        return directUrl;
      }
    }

    // Handle Google Drive URLs
    if (url.includes('drive.google.com')) {
      try {
        // Convert /file/d/ID/view to /uc?export=download&id=ID
        const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
          return `https://drive.google.com/uc?export=download&id=${match[1]}`;
        }
      } catch (e) {
        console.warn('Failed to convert Google Drive URL:', e);
      }
    }
    
    return url;
  }

  // Advanced external file streaming with chunked delivery
  // Handle M3U8 streaming by parsing segments and streaming them sequentially
  async function handleM3U8Streaming(file: any, req: any, res: any) {
    try {
      console.log(`[M3U8 Stream] Starting M3U8 streaming for: ${file.fileName}, URL: ${file.directDownloadUrl}`);

      // Parse M3U8 playlist to get segments
      const defaultHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'video/webm,video/mp4,video/*,application/vnd.apple.mpegurl,application/x-mpegURL,*/*;q=0.9',
        'Referer': new URL(file.directDownloadUrl).origin
      };
      const segments = await parseM3U8Segments(file.directDownloadUrl, defaultHeaders);
      if (!segments || segments.length === 0) {
        console.error(`[M3U8 Stream] No segments found in playlist for ${file.fileName}`);
        return res.status(400).json({ error: 'Invalid M3U8 playlist', message: 'Could not parse video segments' });
      }

      console.log(`[M3U8 Stream] Found ${segments.length} segments to stream`);

      // Calculate total content length by fetching sizes of all segments
      let totalSize = 0;
      const segmentSizes: number[] = [];

      for (const segmentUrl of segments) {
        try {
          // First try HEAD
          let response = await fetch(segmentUrl, { method: 'HEAD', headers: defaultHeaders });
          if (!response.ok) {
            // Fallback to range GET if HEAD isn't supported/allowed
            response = await fetch(segmentUrl, { method: 'GET', headers: { ...defaultHeaders, Range: 'bytes=0-0' } });
          }
          if (response.ok) {
            const contentLength = response.headers.get('content-length');
            const size = contentLength ? parseInt(contentLength) : 0;
            segmentSizes.push(size);
            totalSize += size;
          } else {
            segmentSizes.push(0);
          }
        } catch (error) {
          console.warn(`[M3U8 Stream] Failed to get size for segment: ${segmentUrl}`, error?.message || error);
          segmentSizes.push(0);
        }
      }

      console.log(`[M3U8 Stream] Total calculated size: ${totalSize} bytes`);

      // Handle range requests
      const range = req.headers.range;
      let startByte = 0;
      let endByte = totalSize - 1;
      const unknownLength = totalSize === 0;

      if (range && !unknownLength) {
        const parts = range.replace(/bytes=/, "").split("-");
        startByte = parseInt(parts[0], 10);
        endByte = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
        console.log(`[M3U8 Stream] Range request: bytes=${startByte}-${endByte}`);
      }

      // Set headers
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Range');

      if (!unknownLength) {
        if (range) {
          res.status(206);
          res.setHeader('Content-Range', `bytes ${startByte}-${endByte}/${totalSize}`);
          res.setHeader('Content-Length', endByte - startByte + 1);
        } else {
          res.setHeader('Content-Length', totalSize);
        }
      } else {
        // Unknown length; use chunked transfer so we can stream without content-length
        res.setHeader('Transfer-Encoding', 'chunked');
      }

      // Stream segments sequentially
      let currentByte = 0;
      let bytesSent = 0;

      for (let i = 0; i < segments.length; i++) {
        const segmentUrl = segments[i];
        const segmentSize = segmentSizes[i];

        // Skip segments that are before our range
        if (currentByte + segmentSize <= startByte) {
          currentByte += segmentSize;
          continue;
        }

        // Skip segments that are after our range
        if (currentByte >= endByte) {
          break;
        }

        console.log(`[M3U8 Stream] Streaming segment ${i + 1}/${segments.length}: ${segmentUrl}`);

        try {
          const response = await fetch(segmentUrl, { headers: defaultHeaders });
          if (!response.ok) {
            console.error(`[M3U8 Stream] Failed to fetch segment ${i}: ${response.status}`);
            continue;
          }

          const reader = response.body?.getReader();
          if (!reader) continue;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Calculate which bytes to send based on range
            const chunkStart = Math.max(currentByte, startByte);
            const chunkEnd = Math.min(currentByte + value.length - 1, endByte);

            if (chunkStart <= chunkEnd) {
              const offset = chunkStart - currentByte;
              const length = chunkEnd - chunkStart + 1;
              const chunk = value.slice(offset, offset + length);

              res.write(chunk);
              bytesSent += chunk.length;
            }

            currentByte += value.length;
          }
        } catch (error) {
          console.error(`[M3U8 Stream] Error streaming segment ${i}:`, error);
        }
      }

      console.log(`[M3U8 Stream] Completed streaming ${bytesSent} bytes`);
      res.end();

    } catch (error) {
      console.error(`[M3U8 Stream] Error:`, error);
      res.status(500).json({ error: 'Streaming failed', message: error.message });
    }
  }

  // Helper function to parse M3U8 segments
  async function parseM3U8Segments(m3u8Url: string, headers: Record<string, string> | null = null): Promise<string[] | null> {
    try {
      console.log(`[M3U8 Parse] Fetching playlist from:`, m3u8Url);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(m3u8Url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ...(headers || {})
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[M3U8 Parse] Failed to fetch playlist:`, response.status);
        return null;
      }

      const content = await response.text();
      console.log(`[M3U8 Parse] Playlist content length:`, content.length);

      const lines = content.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
      const segments: string[] = [];

      for (const line of lines) {
        if (line.endsWith('.ts') || line.endsWith('.mp4') || line.includes('segment')) {
          // Resolve relative URLs to absolute
          const segmentUrl = line.startsWith('http') ? line : new URL(line, m3u8Url).href;
          segments.push(segmentUrl);
        }
      }

      console.log(`[M3U8 Parse] Extracted ${segments.length} segments:`, segments.slice(0, 3), segments.length > 3 ? '...' : '');
      return segments;
    } catch (error) {
      console.error(`[M3U8 Parse] Failed to parse playlist:`, error);
      return null;
    }
  }

  // Function to transcode M3U8 playlist to MP4 for download
  async function transcodeM3U8ToMP4(m3u8Url: string, res: any, fileId: string, userId: string, clients: Map<WebSocket, any>): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        console.log(`[M3U8 Transcode] Starting transcoding for: ${m3u8Url}`);

        // Parse segments from M3U8
        const defaultHeaders = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'video/webm,video/mp4,video/*,application/vnd.apple.mpegurl,application/x-mpegURL,*/*;q=0.9',
          'Referer': new URL(m3u8Url).origin
        };
        const segments = await parseM3U8Segments(m3u8Url, defaultHeaders);
        if (!segments || segments.length === 0) {
          throw new Error('No segments found in M3U8 playlist');
        }

        console.log(`[M3U8 Transcode] Found ${segments.length} segments to transcode`);

        // Set response headers for MP4 download
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Transfer-Encoding', 'chunked');

        // Create ffmpeg command to concatenate segments
        // Pass headers via inputOptions to ffmpeg so it can fetch segments from CDNs that require them
        const headersString = `User-Agent: ${defaultHeaders['User-Agent']}\r\nReferer: ${defaultHeaders['Referer']}\r\n`;
        const command = ffmpeg()
          .input(m3u8Url)
          .inputOptions(['-headers', headersString])
          .outputOptions([
            '-c', 'copy',  // Copy streams without re-encoding for speed
            '-bsf:a', 'aac_adtstoasc',  // Convert AAC format if needed
            '-movflags', 'frag_keyframe+empty_moov'  // Progressive download friendly
          ])
          .outputFormat('mp4')
          .on('start', (commandLine) => {
            console.log(`[M3U8 Transcode] FFmpeg command: ${commandLine}`);
          })
          .on('progress', (progress) => {
            console.log(`[M3U8 Transcode] Progress: ${progress.percent}% done`);
            // Emit progress to client's WebSocket
            clients.forEach((client) => {
              if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify({
                  type: 'download_progress',
                  fileId: fileId,
                  progress: progress.percent
                }));
              }
            });
          })
          .on('end', () => {
            console.log(`[M3U8 Transcode] Transcoding completed successfully`);
            // Emit completion
            clients.forEach((client) => {
              if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify({
                  type: 'download_complete',
                  fileId: fileId
                }));
              }
            });
            resolve();
          })
          .on('error', (err) => {
            console.error(`[M3U8 Transcode] FFmpeg error:`, err);
            // Emit error
            clients.forEach((client) => {
              if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify({
                  type: 'download_error',
                  fileId: fileId,
                  error: err.message
                }));
              }
            });
            reject(err);
          });

        // Pipe output directly to response
        command.pipe(res, { end: true });

      } catch (error) {
        console.error(`[M3U8 Transcode] Error:`, error);
        reject(error);
      }
    });
  }

  async function handleExternalFileStreaming(
    file: any, 
    req: any, 
    res: any, 
    options: { chunkIndex: number; chunkSize: number; adaptiveMode: boolean }
  ) {
    const { chunkIndex, chunkSize, adaptiveMode } = options;
    const range = req.headers.range;

    try {
      // Optimization: Use stored file size instead of making a HEAD request
      const contentLength = file.fileSize;
      
      // Set streaming headers
      res.setHeader('Content-Type', file.mimeType || 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Range');

      let start = 0;
      let end = contentLength - 1;

      // Handle chunked streaming for MSE
      if (chunkIndex >= 0) {
        start = chunkIndex * chunkSize;
        end = Math.min(start + chunkSize - 1, contentLength - 1);
        
        if (start >= contentLength) {
          return res.status(416).send('Range Not Satisfiable');
        }
      }
      // Handle regular range requests
      else if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        start = parseInt(parts[0], 10);
        
        // FORCE a small chunk size to simulate HLS/DASH-like behavior
        // This forces the browser to request small segments progressively
        // instead of trying to download the whole file at once.
        // Increased to 5MB to ensure browser gets enough data for metadata/keyframes
        const MAX_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
        const requestedEnd = parts[1] ? parseInt(parts[1], 10) : contentLength - 1;
        
        // For seeking, provide larger chunks to reduce requests
        // If they requested a specific range, we respect it but optimize chunk size
        const isSeekRequest = start > 0;
        const chunkSize = isSeekRequest ? 8 * 1024 * 1024 : MAX_CHUNK_SIZE; // 8MB for seeks, 5MB for start
        end = Math.min(start + chunkSize - 1, requestedEnd, contentLength - 1);
      } else {
        // No range, but we still want to stream efficiently.
        // Instead of streaming the whole file, we'll send the first chunk
        // and tell the client we support ranges.
        const MAX_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
        end = Math.min(MAX_CHUNK_SIZE - 1, contentLength - 1);
      }

      // Request specific range from external provider
      // We handle redirects manually to ensure Range header is preserved
      let currentUrl = getDirectDownloadUrl(file.directDownloadUrl!);
      console.log(`[Streaming] Processing request for ${file.fileName}`);
      console.log(`[Streaming] Client requested range: ${range || 'None (Full file)'}`);
      console.log(`[Streaming] Calculated chunk: ${start}-${end} (Size: ${end - start + 1} bytes)`);
      console.log(`[Streaming] Upstream URL: ${currentUrl}`);

      let rangeResponse;
      let redirectCount = 0;
      const maxRedirects = 5;

      while (redirectCount < maxRedirects) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 second timeout
            
            rangeResponse = await fetch(currentUrl, {
                headers: { 
                    'Range': `bytes=${start}-${end}`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'video/webm,video/mp4,video/*;q=0.9,*/*;q=0.8',
                    'Accept-Encoding': 'identity',
                    'Connection': 'keep-alive'
                },
                redirect: 'manual',
                timeout: 45000, // 45 second timeout for YouTube URLs
                signal: AbortSignal.timeout(45000)
            });

            if (rangeResponse.status === 301 || rangeResponse.status === 302 || rangeResponse.status === 307 || rangeResponse.status === 308) {
                const location = rangeResponse.headers.get('location');
                if (location) {
                    currentUrl = location;
                    redirectCount++;
                    continue;
                }
            }
            break;
        } catch (err) {
            console.error(`[Streaming] Error fetching external URL (attempt ${redirectCount + 1}):`, err);
            
            // Check if it's a timeout error
            if (err.code === 'ETIMEDOUT' || err.type === 'system') {
                console.error(`[Streaming] Timeout error for external URL: ${currentUrl}`);
                throw new Error(`Failed to proxy external URL: Connection timeout. The external video source may be temporarily unavailable.`);
            }
            
            if (redirectCount < maxRedirects - 1) {
                redirectCount++;
                continue;
            }
            
            throw err;
        }
      }

      if (!rangeResponse) {
          throw new Error("Failed to fetch external file");
      }

      console.log(`[Streaming] ${file.fileName} - Range: ${start}-${end} - Status: ${rangeResponse.status}`);

      if (rangeResponse.status === 206) {
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${contentLength}`);
        res.setHeader('Content-Length', end - start + 1);
        
        // Robust stream piping that handles both Node streams and Web Streams
        if (rangeResponse.body) {
          // @ts-ignore - Handle both stream types
          if (typeof rangeResponse.body.pipe === 'function') {
             // @ts-ignore
            rangeResponse.body.pipe(res);
          } else {
            // Web Stream (Node 18+ native fetch)
            // @ts-ignore
            const reader = rangeResponse.body.getReader();
            
            // Handle client disconnect to abort upstream fetch
            req.on('close', () => {
              console.log(`[Streaming] Client disconnected for ${file.fileName}, aborting upstream fetch.`);
              reader.cancel().catch(e => console.error('Error cancelling reader:', e));
            });

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                // Check if response is writable before writing
                if (!res.writableEnded) {
                  const canWrite = res.write(value);
                  if (!canWrite) {
                    // Backpressure handling: wait for drain
                    await new Promise(resolve => res.once('drain', resolve));
                  }
                } else {
                  break;
                }
              }
            } catch (e) {
               console.error('[Streaming] Error piping stream:', e);
            } finally {
               if (!res.writableEnded) res.end();
            }
          }
        } else {
          res.end();
        }
      } else if (rangeResponse.status === 200) {
        // Server doesn't support ranges, we must stream the whole file
        // BUT we must NOT send the whole file if we want to avoid 60MB/s bandwidth hogging.
        // We will simulate a chunk by reading only the requested amount and then destroying the stream.
        
        console.warn(`[Streaming] External provider returned 200 OK instead of 206 for ${file.fileName}. Simulating chunk.`);
        
        // We can't send 206 if the upstream sent 200, because we can't guarantee we have the right byte offset if start > 0.
        // However, if start === 0, we can pretend.
        
        if (start === 0) {
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${contentLength}`);
            res.setHeader('Content-Length', end - start + 1);
        } else {
            // If we requested a middle chunk but got the whole file, we are in trouble.
            // We have to download from 0 to start, discard it, then send start to end.
            // This is extremely inefficient. 
            // Better to just send 200 OK and let the browser handle it, BUT limit the data sent.
            // Actually, sending 200 OK with a partial body is a protocol violation.
            // So we MUST send 206 if we want to chunk.
            
            // Strategy: If upstream gives 200, we assume we are at byte 0.
            // If the client wanted byte 1000, we have to skip 1000 bytes.
            console.warn(`[Streaming] Simulating seek to ${start} from full stream.`);
        }

        if (rangeResponse.body) {
            // @ts-ignore
            const stream = rangeResponse.body;
            let bytesSent = 0;
            const maxBytes = end - start + 1;
            let bytesSkipped = 0;
            
            // @ts-ignore
            if (typeof stream.on === 'function') {
                // Node stream
                stream.on('data', (chunk: Buffer) => {
                    // Skip bytes if needed (simple skip logic)
                    let chunkToProcess = chunk;
                    
                    if (bytesSkipped < start) {
                        const remainingSkip = start - bytesSkipped;
                        if (chunk.length <= remainingSkip) {
                            bytesSkipped += chunk.length;
                            return;
                        } else {
                            chunkToProcess = chunk.slice(remainingSkip);
                            bytesSkipped += remainingSkip;
                        }
                    }

                    // Send bytes up to limit
                    if (bytesSent < maxBytes) {
                        const remainingSend = maxBytes - bytesSent;
                        const toSend = chunkToProcess.length > remainingSend ? chunkToProcess.slice(0, remainingSend) : chunkToProcess;
                        res.write(toSend);
                        bytesSent += toSend.length;
                        
                        if (bytesSent >= maxBytes) {
                            // We are done
                            console.log(`[Streaming] Chunk complete. Sent ${bytesSent} bytes. Closing stream.`);
                            stream.destroy(); // Stop downloading from upstream
                            res.end();
                        }
                    } else {
                        stream.destroy();
                        res.end();
                    }
                });
                
                stream.on('end', () => {
                    if (!res.writableEnded) res.end();
                });
                
                stream.on('error', (err: any) => {
                    console.error('[Streaming] Stream error:', err);
                    if (!res.writableEnded) res.end();
                });
            } else {
                // Web Stream (Node 18+ native fetch)
                // @ts-ignore
                const reader = stream.getReader();
                
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        
                        let chunk = value;
                        
                        // Skip bytes if needed
                        if (bytesSkipped < start) {
                            const remainingSkip = start - bytesSkipped;
                            if (chunk.length <= remainingSkip) {
                                bytesSkipped += chunk.length;
                                continue;
                            } else {
                                chunk = chunk.slice(remainingSkip);
                                bytesSkipped += remainingSkip;
                            }
                        }
                        
                        // Send bytes up to limit
                        if (bytesSent < maxBytes) {
                            const remainingSend = maxBytes - bytesSent;
                            const toSend = chunk.length > remainingSend ? chunk.slice(0, remainingSend) : chunk;
                            res.write(toSend);
                            bytesSent += toSend.length;
                            
                            if (bytesSent >= maxBytes) {
                                console.log(`[Streaming] Chunk complete. Sent ${bytesSent} bytes. Closing reader.`);
                                await reader.cancel();
                                break;
                            }
                        } else {
                            await reader.cancel();
                            break;
                        }
                    }
                } catch (err) {
                    console.error('[Streaming] Web Stream error:', err);
                } finally {
                    if (!res.writableEnded) res.end();
                }
            }
        } else {
          res.end();
        }
      } else {
        console.error(`[Streaming] External provider returned status ${rangeResponse.status}`);
        return res.status(416).send('Range Not Satisfiable');
      }

    } catch (error) {
      console.error('Advanced streaming error:', error);
      // Only send error if headers haven't been sent
      if (!res.headersSent) {
        return res.status(500).send('Failed to stream external file');
      }
      res.end();
    }
  }

  // Helper function to stream file ranges with memory management
  async function streamFileRange(file: any, start: number, end: number, res: any) {
    const chunks = file.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
    const STREAM_CHUNK_SIZE = 64 * 1024; // 64KB stream chunks to prevent memory issues
    
    let currentPosition = 0;
    
    for (const chunk of chunks) {
      const chunkStart = currentPosition;
      const chunkEnd = currentPosition + chunk.size - 1;
      
      // Skip chunks that are completely before our start range
      if (chunkEnd < start) {
        currentPosition += chunk.size;
        continue;
      }
      
      // Stop if we've passed our end range
      if (chunkStart > end) {
        break;
      }
      
      try {
        // Calculate which part of this chunk we need
        const dataStart = Math.max(0, start - chunkStart);
        const dataEnd = Math.min(chunk.size - 1, end - chunkStart);
        
        if (dataStart <= dataEnd) {
          // Stream chunk data in small pieces to prevent memory overflow
          if (chunk.downloadUrl) {
            // For external URLs, use fetch with range requests
            const rangeStart = dataStart;
            const rangeEnd = dataEnd;
            // Add timeout and retry logic for external URLs
            const chunkResponse = await fetch(chunk.downloadUrl, {
              headers: { 
                'Range': `bytes=${rangeStart}-${rangeEnd}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              },
              timeout: 30000, // 30 second timeout
              signal: AbortSignal.timeout(30000)
            });
            
            if (chunkResponse.ok && chunkResponse.body) {
              const reader = chunkResponse.body.getReader();
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  
                  res.write(value);
                  
                  // Check if client disconnected
                  if (res.destroyed) {
                    await reader.cancel();
                    return;
                  }
                }
              } finally {
                reader.releaseLock();
              }
            }
          } else {
            // For Dropbox chunks, try to get a temporary link first for efficient streaming
            let streamed = false;
            try {
              // Use the correct properties: dropboxAccountId and dropboxPath
              const tempLink = await dropboxManager.getTemporaryLink(chunk.dropboxAccountId, chunk.dropboxPath);
              
              // Use the temporary link to fetch only the needed range
              const rangeStart = dataStart;
              const rangeEnd = dataEnd;
              const chunkResponse = await fetch(tempLink, {
                headers: { 'Range': `bytes=${rangeStart}-${rangeEnd}` }
              });
              
              if (chunkResponse.ok && chunkResponse.body) {
                const reader = chunkResponse.body.getReader();
                try {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    res.write(value);
                    
                    if (res.destroyed) {
                      await reader.cancel();
                      return;
                    }
                  }
                  streamed = true;
                } finally {
                  reader.releaseLock();
                }
              }
            } catch (err) {
              console.warn(`Failed to get temp link for chunk ${chunk.chunkIndex}, falling back to full download:`, err);
            }

          if (!streamed) {
            // Check if client disconnected before starting expensive download
            if (res.destroyed) {
              console.log(`[Stream] Client disconnected, skipping download for chunk ${chunk.chunkIndex}`);
              return;
            }

            // Fallback: download and stream in small pieces
            // Fixed: use dropboxAccountId and dropboxPath correctly
            const chunkData = await dropboxManager.downloadChunk(chunk.dropboxAccountId, chunk.dropboxPath);
            
            // Check again after download
            if (res.destroyed) {
              console.log(`[Stream] Client disconnected after download for chunk ${chunk.chunkIndex}`);
              return;
            }

            const slicedData = chunkData.slice(dataStart, dataEnd + 1);              // Stream in small chunks to prevent memory issues
              for (let i = 0; i < slicedData.length; i += STREAM_CHUNK_SIZE) {
                const piece = slicedData.slice(i, i + STREAM_CHUNK_SIZE);
                res.write(piece);
                
                // Check if client disconnected
                if (res.destroyed) {
                  return;
                }
                
                // Allow event loop to process other requests
                await new Promise(resolve => setImmediate(resolve));
              }
            }
          }
        }
        
      } catch (error) {
        console.error(`Failed to stream chunk ${chunk.chunkIndex}:`, error);
        if (!res.destroyed) {
          res.status(500).end('Streaming error');
        }
        return;
      }
      
      currentPosition += chunk.size;
    }
    
    if (!res.destroyed) {
      res.end();
    }
  }

  // Stream only specific chunks for smart seeking
  async function streamSpecificChunks(chunks: any[], res: Response) {
    const STREAM_CHUNK_SIZE = 64 * 1024; // 64KB stream chunks
    console.log(`[StreamChunks] Starting to stream ${chunks.length} specific chunks`);
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`[StreamChunks] Processing chunk ${i+1}/${chunks.length}: index=${chunk.chunkIndex}, size=${Math.round(chunk.size/1024)}KB`);
      try {
        if (chunk.downloadUrl) {
          // For external URLs
          const chunkResponse = await fetch(chunk.downloadUrl);
          
          if (chunkResponse.ok && chunkResponse.body) {
            const reader = chunkResponse.body.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                res.write(value);
                
                if (res.destroyed) {
                  await reader.cancel();
                  return;
                }
              }
            } finally {
              reader.releaseLock();
            }
          }
        } else {
          // For Dropbox chunks
          let streamed = false;
          try {
            const tempLink = await dropboxManager.getTemporaryLink(chunk.dropboxAccountId, chunk.dropboxPath);
            
            const chunkResponse = await fetch(tempLink);
            
            if (chunkResponse.ok && chunkResponse.body) {
              const reader = chunkResponse.body.getReader();
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  
                  res.write(value);
                  
                  if (res.destroyed) {
                    await reader.cancel();
                    return;
                  }
                }
                streamed = true;
              } finally {
                reader.releaseLock();
              }
            }
          } catch (err) {
            console.warn(`Failed to get temp link for chunk ${chunk.chunkIndex}, falling back:`, err);
          }

          if (!streamed) {
            // Check if client disconnected before starting expensive download
            if (res.destroyed) {
              console.log(`[StreamChunks] Client disconnected, skipping download for chunk ${chunk.chunkIndex}`);
              return;
            }

            // Fallback: download and stream in small pieces
            const chunkData = await dropboxManager.downloadChunk(chunk.dropboxAccountId, chunk.dropboxPath);
            
            // Check again after download
            if (res.destroyed) {
              console.log(`[StreamChunks] Client disconnected after download for chunk ${chunk.chunkIndex}`);
              return;
            }
            
            for (let i = 0; i < chunkData.length; i += STREAM_CHUNK_SIZE) {
              const piece = chunkData.slice(i, i + STREAM_CHUNK_SIZE);
              res.write(piece);
              
              if (res.destroyed) {
                return;
              }
              
              await new Promise(resolve => setImmediate(resolve));
            }
          }
        }
      } catch (error) {
        console.error(`Failed to stream chunk ${chunk.chunkIndex}:`, error);
        if (!res.destroyed) {
          res.status(500).end('Streaming error');
        }
        return;
      }
    }
    
    if (!res.destroyed) {
      console.log(`[StreamChunks] Successfully streamed all ${chunks.length} chunks`);
      res.end();
    } else {
      console.log(`[StreamChunks] Response destroyed, stopping chunk streaming`);
    }
  }

  app.get("/api/files/:id/download", optionalAuth, async (req, res, next) => {
    try {
      const file = await storage.getFileById(req.params.id);
      if (!file) {
        return res.status(404).send("File not found");
      }

      // Check forum access - allow extracted files for authenticated users
      const isExtractedFile = req.params.id.startsWith('extracted_');
      const forum = await storage.getForumById(file.forumId);
      if (!forum && !isExtractedFile) {
        return res.status(404).send("Forum not found");
      }

      if (!forum?.isPublic && !isExtractedFile) {
        if (!req.isAuthenticated?.() || !req.user) {
          return res.sendStatus(401);
        }
        const isMember = await storage.isForumMember(forum.id, req.user.id);
        if (!isMember) {
          return res.status(403).send("Access denied");
        }
      } else if (isExtractedFile) {
        // Extracted files require authentication but not forum membership
        if (!req.isAuthenticated?.() || !req.user) {
          return res.sendStatus(401);
        }
      }

      // If this is an extracted file, resolve the live mp4/m3u8 and stream it via our proxy (preserve Range support)
      if (isExtractedFile) {
        try {
          // Build absolute URL to our resolve endpoint to reuse its logic and cache
          let hostHeader = req.get('host') || 'localhost:5000';
          hostHeader = hostHeader.replace('[::1]', '127.0.0.1').replace('::1', '127.0.0.1');
          const resolveUrl = `${req.protocol}://${hostHeader}/api/extracted/${encodeURIComponent(req.params.id)}/resolve`;

          console.log(`[Download] Resolving extracted file via ${resolveUrl}`);
          const r = await fetch(resolveUrl, { headers: { 'User-Agent': 'Node.js' } });
          if (!r.ok) {
            console.warn('[Download] Failed to resolve extracted file', await r.text());
            return res.status(502).send('Failed to resolve extracted file');
          }

          const body = await r.json();
          const chosenProxy = body.localProxyUrl ? `${req.protocol}://${hostHeader}${body.localProxyUrl}` : body.proxiedUrl || body.resolvedUrl;
          if (!chosenProxy) return res.status(404).send('Could not resolve mp4 for this extracted file');

          console.log(`[Download] Streaming resolved URL for ${file.fileName}: ${chosenProxy}`);

          // Forward Range header if present
          const upstreamHeaders: any = { 'User-Agent': 'Node.js' };
          if (req.headers.range) upstreamHeaders['Range'] = req.headers.range as string;

          const upstreamResp = await fetch(chosenProxy, { headers: upstreamHeaders });
          if (!upstreamResp.ok && upstreamResp.status !== 206) {
            console.warn('[Download] Upstream fetch failed:', upstreamResp.status);
            return res.status(502).send('Failed to fetch resolved file');
          }

          // Copy relevant headers
          const contentType = upstreamResp.headers.get('content-type') || file.mimeType || 'application/octet-stream';
          const contentLength = upstreamResp.headers.get('content-length');
          const contentRange = upstreamResp.headers.get('content-range');

          res.setHeader('Content-Type', contentType);
          res.setHeader('Accept-Ranges', 'bytes');
          if (contentLength) res.setHeader('Content-Length', contentLength);
          if (contentRange) {
            res.status(206);
            res.setHeader('Content-Range', contentRange);
          } else {
            // For downloads prefer attachment
            res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
          }

          // Stream the response body
          upstreamResp.body?.pipe(res);
          return;
        } catch (err) {
          console.error('[Download] Error resolving extracted file:', err);
          return res.status(500).send('Error resolving extracted file');
        }
      }

      // Check if this is an admin-created file with direct download URL
      if (file.isAdminCreated && file.directDownloadUrl) {
        // Special handling for M3U8 files - transcode to MP4 for download
        if (file.mimeType === 'application/x-mpegurl' || file.directDownloadUrl.toLowerCase().endsWith('.m3u8')) {
          console.log(`[Download] Detected M3U8 file, transcoding to MP4 for download: ${file.fileName}`);
          try {
            await transcodeM3U8ToMP4(file.directDownloadUrl, res, file.id, req.user?.id, clients);
            return;
          } catch (error) {
            console.error('Failed to transcode M3U8 file:', error);
            return res.status(500).send('Failed to transcode M3U8 file');
          }
        }

        // Proxy the external URL to avoid CORS issues
        try {
          const response = await fetch(file.directDownloadUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status}`);
          }
          
          // Set appropriate headers
          res.setHeader('Content-Type', response.headers.get('content-type') || file.mimeType || 'application/octet-stream');
          res.setHeader('Content-Length', response.headers.get('content-length') || file.fileSize);
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Cache-Control', 'public, max-age=31536000');
          
          // Handle range requests for video streaming
          const range = req.headers.range;
          if (range && response.headers.get('accept-ranges') === 'bytes') {
            const contentLength = parseInt(response.headers.get('content-length') || '0');
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : contentLength - 1;
            const chunksize = (end - start) + 1;
            
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${contentLength}`);
            res.setHeader('Content-Length', chunksize);
          }
          
          // Stream the response
          response.body?.pipe(res);
          return;
        } catch (error: any) {
          console.error('Failed to proxy external URL:', error);
          
          // Provide specific error messages based on HTTP status
          if (error.message?.includes('410')) {
            return res.status(410).send('This file is no longer available (content has been removed)');
          } else if (error.message?.includes('404')) {
            return res.status(404).send('File not found on external server');
          } else if (error.message?.includes('403')) {
            return res.status(403).send('Access denied to external file');
          } else if (error.message?.includes('429')) {
            return res.status(429).send('Too many requests to external server, please try again later');
          } else {
            return res.status(500).send('Failed to fetch external file');
          }
        }
      }

      // Set headers for streaming download
      res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
      res.setHeader('Content-Length', file.fileSize);
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Transfer-Encoding', 'chunked');

      // Stream file chunks progressively with smaller sub-chunks for granular progress
      const chunks = file.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      const SUB_CHUNK_SIZE = 64 * 1024; // 64KB sub-chunks for frequent progress updates
      let totalBytesSent = 0;

      for (const chunk of chunks) {
        try {
          let chunkData: Buffer;
          
          // Use permanent download URL if available, fallback to dropbox path
          if (chunk.downloadUrl) {
            console.log(`📥 Downloading chunk ${chunk.chunkIndex} from permanent URL`);
            const response = await fetch(chunk.downloadUrl);
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            chunkData = Buffer.from(arrayBuffer);
          } else if (chunk.dropboxPath) {
            console.log(`📥 Downloading chunk ${chunk.chunkIndex} from Dropbox path (fallback)`);
            chunkData = await dropboxManager.downloadChunk(
              chunk.dropboxAccountId,
              chunk.dropboxPath
            );
          } else {
            throw new Error(`No download URL or Dropbox path available for chunk ${chunk.chunkIndex}`);
          }

          // Send chunk data in smaller sub-chunks for more frequent progress updates
          for (let offset = 0; offset < chunkData.length; offset += SUB_CHUNK_SIZE) {
            const end = Math.min(offset + SUB_CHUNK_SIZE, chunkData.length);
            const subChunk = chunkData.slice(offset, end);

            res.write(subChunk);
            totalBytesSent += subChunk.length;

            // Small delay to prevent overwhelming the network
            await new Promise(resolve => setTimeout(resolve, 1));
          }
        } catch (chunkError) {
          console.error(`Failed to download chunk ${chunk.chunkIndex}:`, chunkError);
          // If we haven't sent any data yet, we can still return an error
          if (totalBytesSent === 0) {
            return res.status(500).send("Failed to download file chunk");
          }
          // If we've already started sending data, we can't change the response
          // Log the error and continue with other chunks if possible
          break;
        }
      }

      res.end();
    } catch (error) {
      console.error("File download error:", error);
      // Only send error if we haven't started the response yet
      if (!res.headersSent) {
        next(error);
      }
    }
  });



  // Helper function to stream file range
  async function streamFileRange(file: any, start: number, end: number, res: any) {
    const chunks = file.chunks.sort((a: any, b: any) => a.chunkIndex - b.chunkIndex);
    let currentOffset = 0;
    let bytesSent = 0;
    const totalBytes = end - start + 1;

    for (const chunk of chunks) {
      const chunkStart = currentOffset;
      const chunkEnd = currentOffset + chunk.chunkSize - 1;
      currentOffset += chunk.chunkSize;

      // Check if this chunk overlaps with the requested range
      if (chunkEnd < start || chunkStart > end) {
        continue; // Skip chunks outside the range
      }

      try {
        let chunkData: Buffer;
        
        // Use permanent download URL if available, fallback to dropbox path
        if (chunk.downloadUrl) {
          const response = await fetch(chunk.downloadUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          chunkData = Buffer.from(arrayBuffer);
        } else if (chunk.dropboxPath) {
          chunkData = await dropboxManager.downloadChunk(
            chunk.dropboxAccountId,
            chunk.dropboxPath
          );
        } else {
          throw new Error(`No download URL or Dropbox path available for chunk ${chunk.chunkIndex}`);
        }

        // Calculate the portion of this chunk to send
        const chunkOffset = Math.max(0, start - chunkStart);
        const chunkSendEnd = Math.min(chunkData.length, end - chunkStart + 1);
        const dataToSend = chunkData.slice(chunkOffset, chunkSendEnd);

        if (dataToSend.length > 0) {
          res.write(dataToSend);
          bytesSent += dataToSend.length;

          // If we've sent all requested bytes, stop
          if (bytesSent >= totalBytes) {
            break;
          }
        }
      } catch (chunkError) {
        console.error(`Failed to stream chunk ${chunk.chunkIndex}:`, chunkError);
        break;
      }
    }

    res.end();
  }

  app.delete("/api/files/:id", requireAuth, async (req, res, next) => {
    try {
      const file = await storage.getFileById(req.params.id);
      if (!file) {
        return res.status(404).send("File not found");
      }

      // Check if user owns the file
      if (file.userId !== req.user!.id) {
        return res.status(403).send("Access denied");
      }

      // Delete chunks from Dropbox
      for (const chunk of file.chunks) {
        try {
          if (chunk.dropboxPath) {
            await dropboxManager.deleteChunk(chunk.dropboxAccountId, chunk.dropboxPath);
            dropboxManager.updateAccountUsage(chunk.dropboxAccountId, -chunk.chunkSize);
          }
        } catch (error) {
          console.error("Failed to delete chunk:", error);
        }
      }

      // Delete from database
      await storage.deleteFile(file.id);

      // Broadcast file deletion to all clients (so UI can refresh)
      clients.forEach((c) => {
        if (c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'file_deleted',
            forumId: file.forumId,
            fileId: file.id
          }));
        }
      });

      res.sendStatus(200);
    } catch (error) {
      next(error);
    }
  });

  // Partial uploads management
  app.get("/api/partial-uploads", requireAuth, async (req, res, next) => {
    try {
      const partialUploads = await storage.getPartialUploadsByUser(req.user!.id);
      res.json(partialUploads);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/partial-uploads/:id", requireAuth, async (req, res, next) => {
    try {
      const partialUpload = await storage.getPartialUploadById(req.params.id);
      if (!partialUpload) {
        return res.status(404).send("Partial upload not found");
      }

      // Check if user owns the partial upload
      if (partialUpload.userId !== req.user!.id) {
        return res.status(403).send("Access denied");
      }

      // Delete uploaded chunks from Dropbox
      for (const chunkIndex of partialUpload.uploadedChunks as number[]) {
        try {
          // Find the chunk in the database (if file was partially created)
          const files = await storage.getFiles(partialUpload.forumId);
          const file = files.find(f => f.fileName === partialUpload.fileName && f.fileSize === partialUpload.fileSize);
          if (file) {
            const chunk = file.chunks.find(c => c.chunkIndex === chunkIndex);
            if (chunk && chunk.dropboxPath) {
              await dropboxManager.deleteChunk(chunk.dropboxAccountId, chunk.dropboxPath);
              dropboxManager.updateAccountUsage(chunk.dropboxAccountId, -chunk.chunkSize);
            }
          }
        } catch (error) {
          console.error(`Failed to delete chunk ${chunkIndex} during partial upload cleanup:`, error);
        }
      }

      // Delete any partially created file record
      const files = await storage.getFiles(partialUpload.forumId);
      const file = files.find(f => f.fileName === partialUpload.fileName && f.fileSize === partialUpload.fileSize);
      if (file) {
        await storage.deleteFile(file.id);
        // Broadcast deletion so clients update
        clients.forEach((c) => {
          if (c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(JSON.stringify({
              type: 'file_deleted',
              forumId: partialUpload.forumId,
              fileId: file.id
            }));
          }
        });
      }

      // Delete partial upload record
      await storage.deletePartialUpload(partialUpload.id);

      res.sendStatus(200);
    } catch (error) {
      next(error);
    }
  });

  // Access request routes
  app.get("/api/forums/:id/access-requests", requireAuth, async (req, res, next) => {
    try {
      const forum = await storage.getForumById(req.params.id);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }

      // Only forum creator can view access requests
      if (forum.creatorId !== req.user!.id) {
        return res.status(403).send("Access denied");
      }

      const requests = await storage.getAccessRequests(req.params.id);
      res.json(requests);
    } catch (error) {
      next(error);
    }
  });

  // Check access status for a forum
  app.get("/api/forums/:id/access-status", requireAuth, async (req, res, next) => {
    try {
      const forum = await storage.getForumById(req.params.id);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }

      // If forum is public, everyone has access
      if (forum.isPublic) {
        return res.json({ hasAccess: true });
      }

      // Check if user is a member
      const isMember = await storage.isForumMember(forum.id, req.user!.id);
      if (isMember) {
        return res.json({ hasAccess: true });
      }

      // Check if user has a pending/approved/rejected request
      const existingRequest = await storage.getAccessRequestByUser(forum.id, req.user!.id);
      if (existingRequest) {
        return res.json({
          hasAccess: false,
          requestStatus: existingRequest.status,
          requestId: existingRequest.id
        });
      }

      res.json({ hasAccess: false });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/access-requests", async (req, res, next) => {
    try {
      // Check authentication
      if (!req.user || !req.user.id) {
        console.log('🔐 Authentication required but user not authenticated');
        // Return JSON response indicating authentication required
        return res.status(401).json({ 
          error: 'Authentication required', 
          message: 'You must be logged in to request access to private forums.',
          redirect: '/auth'
        });
      }

      const validationResult = insertAccessRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        const error = fromZodError(validationResult.error);
        return res.status(400).send(error.message);
      }

      const { forumId } = validationResult.data;

      // Check if user already has an access request for this forum
      const existingRequest = await storage.getAccessRequestByUser(forumId, req.user!.id);
      if (existingRequest) {
        if (existingRequest.status === 'pending') {
          return res.status(400).send("You already have a pending access request for this forum");
        } else if (existingRequest.status === 'rejected') {
          return res.status(400).send("Your access request was rejected. You cannot request access again");
        } else if (existingRequest.status === 'approved') {
          return res.status(400).send("You already have access to this forum");
        }
      }

      const request = await storage.createAccessRequest(validationResult.data, req.user!.id);

      // Broadcast access request creation to all clients
      clients.forEach((c) => {
        if (c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'access_request_created',
            forumId: forumId,
            request: request
          }));
        }
      });

      res.status(201).json(request);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/access-requests/:id", requireAuth, async (req, res, next) => {
    try {
      const { status } = req.body;
      const request = await storage.updateAccessRequest(req.params.id, status);
      
      if (!request) {
        return res.status(404).send("Access request not found");
      }

      // If approved, add user to forum
      if (status === "approved") {
        await storage.addForumMember(request.forumId, request.userId);

        // Broadcast member addition to all clients
        clients.forEach((c) => {
          if (c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(JSON.stringify({
              type: 'member_added',
              forumId: request.forumId,
              userId: request.userId,
              requestId: request.id
            }));
          }
        });
      }

      // Broadcast access request update to all clients
      clients.forEach((c) => {
        if (c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'access_request_update',
            forumId: request.forumId,
            userId: request.userId,
            requestId: request.id,
            status: request.status
          }));
        }
      });

      res.json(request);
    } catch (error) {
      next(error);
    }
  });

  // Get pending access requests count for user's forums
  app.get("/api/user/pending-requests", requireAuth, async (req, res, next) => {
    try {
      const count = await storage.getPendingAccessRequestsCount(req.user!.id);
      res.json({ count });
    } catch (error) {
      next(error);
    }
  });

  // Reset all user cache and storage for fresh viewing experience
  app.post("/api/user/reset-cache", requireAuth, async (req, res, next) => {
    try {
      console.log(`🧹 Cache reset requested for user: ${req.user!.username} (${req.user!.id})`);
      
      // Call the comprehensive reset function from storage
      await storage.resetAllUserData(req.user!.id);
      
      console.log(`✅ Cache reset completed for user: ${req.user!.id}`);
      res.json({ 
        success: true, 
        message: "All user cache and storage reset successfully" 
      });
    } catch (error) {
      console.error(`❌ Cache reset failed for user ${req.user!.id}:`, error);
      next(error);
    }
  });

  // Database shard statistics endpoint (for monitoring)
  app.get("/api/admin/db-stats", requireAuth, async (req, res, next) => {
    try {
      // Only allow admin users to view DB stats (you can implement proper admin check)
      const stats = await dbManager.getShardStatistics();
      
      const formattedStats = stats.map(stat => ({
        ...stat,
        currentSizeFormatted: dbManager.formatBytes(stat.currentSize),
        maxSizeFormatted: dbManager.formatBytes(stat.maxSize),
        availableSpaceFormatted: dbManager.formatBytes(stat.availableSpace),
      }));
      
      res.json({
        totalShards: stats.length,
        totalStorage: stats.reduce((sum, stat) => sum + stat.currentSize, 0),
        totalCapacity: stats.reduce((sum, stat) => sum + stat.maxSize, 0),
        shards: formattedStats,
      });
    } catch (error) {
      next(error);
    }
  });

  // Manual shard rebalancing endpoint (for admin use)
  app.post("/api/admin/rebalance-shards", requireAuth, async (req, res, next) => {
    try {
      // Only allow admin users to trigger rebalancing (implement proper admin check)
      const result = await dbManager.rebalanceShards();
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Optimize shard selection endpoint (for admin use)
  app.post("/api/admin/optimize-shards", requireAuth, async (req, res, next) => {
    try {
      // Only allow admin users to trigger optimization (implement proper admin check)
      await dbManager.optimizeShardSelection();
      res.json({ 
        success: true, 
        message: 'Shard optimization completed. Check server logs for details.' 
      });
    } catch (error) {
      next(error);
    }
  });

  // Dropbox account status endpoint (for admin use)
  app.get("/api/admin/dropbox-stats", requireAuth, async (req, res, next) => {
    try {
      const accountStatuses = await dropboxManager.getAccountStatusWithReservations();
      const activeReservations = await dropboxManager.getAllActiveReservations();
      
      res.json({
        success: true,
        accounts: accountStatuses,
        activeReservations: activeReservations.length,
        totalReservedBytes: activeReservations.reduce((sum, r) => sum + r.bytes, 0)
      });
    } catch (error) {
      next(error);
    }
  });

  // Get detailed reservation information (for admin use)
  app.get("/api/admin/reservations", requireAuth, async (req, res, next) => {
    try {
      const activeReservations = await dropboxManager.getAllActiveReservations();
      res.json({
        success: true,
        reservations: activeReservations
      });
    } catch (error) {
      next(error);
    }
  });

  // Comments routes
  app.get("/api/comments/:entityType/:entityId", requireAuth, async (req, res, next) => {
    try {
      const { entityType, entityId } = req.params;

      // Validate entity type
      if (!['message', 'file', 'comment'].includes(entityType)) {
        return res.status(400).send("Invalid entity type");
      }

      // Check forum access based on entity type
      let forumId: string;
      if (entityType === 'message') {
        const message = await storage.getMessageById(entityId);
        if (!message) {
          return res.status(404).send("Message not found");
        }
        forumId = message.forumId;
      } else if (entityType === 'file') {
        const file = await storage.getFileById(entityId);
        if (!file) {
          return res.status(404).send("File not found");
        }
        forumId = file.forumId;
      } else {
        // For comments, we need to find the root entity
        const comment = await storage.getCommentById(entityId);
        if (!comment) {
          return res.status(404).send("Comment not found");
        }
        // Find the root entity by traversing up the comment chain
        let rootComment = comment;
        while (rootComment.parentId) {
          const parent = await storage.getCommentById(rootComment.parentId);
          if (!parent) break;
          rootComment = parent;
        }
        // Now find the root entity
        if (rootComment.entityType === 'message') {
          const message = await storage.getMessageById(rootComment.entityId);
          if (!message) {
            return res.status(404).send("Message not found");
          }
          forumId = message.forumId;
        } else if (rootComment.entityType === 'file') {
          const file = await storage.getFileById(rootComment.entityId);
          if (!file) {
            return res.status(404).send("File not found");
          }
          forumId = file.forumId;
        } else {
          return res.status(400).send("Invalid root entity type");
        }
      }

      // Check forum access
      const forum = await storage.getForumById(forumId);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }

      if (!forum.isPublic) {
        const isMember = await storage.isForumMember(forum.id, req.user!.id);
        if (!isMember) {
          return res.status(403).send("Access denied");
        }
      }

      const comments = await storage.getComments(entityType, entityId);
      res.json(comments);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/comments", requireAuth, async (req, res, next) => {
        // Strict user existence check
        if (!req.user || !req.user.id) {
          if (req.session) req.session.destroy(() => {});
          return res.status(401).json({ error: 'Not authenticated', message: 'You must be logged in to comment.' });
        }
        const dbUser = await storage.getUser(req.user.id);
        if (!dbUser) {
          if (req.session) req.session.destroy(() => {});
          return res.status(401).json({ error: 'User not found', message: 'Your user account was not found. Please log in again.' });
        }
    try {
      const validationResult = insertCommentSchema.safeParse(req.body);
      if (!validationResult.success) {
        const error = fromZodError(validationResult.error);
        return res.status(400).send(error.message);
      }

      const { entityType, entityId, parentId, content } = validationResult.data;

      // Validate entity type
      if (!['message', 'file', 'comment'].includes(entityType)) {
        return res.status(400).send("Invalid entity type");
      }

      // Check forum access based on entity type
      let forumId: string;
      if (entityType === 'message') {
        const message = await storage.getMessageById(entityId);
        if (!message) {
          return res.status(404).send("Message not found");
        }
        forumId = message.forumId;
      } else if (entityType === 'file') {
        const file = await storage.getFileById(entityId);
        if (!file) {
          return res.status(404).send("File not found");
        }
        forumId = file.forumId;
      } else {
        // For replying to comments, check the parent comment
        const parentComment = await storage.getCommentById(entityId);
        if (!parentComment) {
          return res.status(404).send("Parent comment not found");
        }
        // Find the root entity
        let rootComment = parentComment;
        while (rootComment.parentId) {
          const parent = await storage.getCommentById(rootComment.parentId);
          if (!parent) break;
          rootComment = parent;
        }
        if (rootComment.entityType === 'message') {
          const message = await storage.getMessageById(rootComment.entityId);
          if (!message) {
            return res.status(404).send("Message not found");
          }
          forumId = message.forumId;
        } else if (rootComment.entityType === 'file') {
          const file = await storage.getFileById(rootComment.entityId);
          if (!file) {
            return res.status(404).send("File not found");
          }
          forumId = file.forumId;
        } else {
          return res.status(400).send("Invalid root entity type");
        }
      }

      // Check forum access
      const forum = await storage.getForumById(forumId);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }

      if (!forum.isPublic) {
        const isMember = await storage.isForumMember(forum.id, req.user!.id);
        if (!isMember) {
          return res.status(403).send("Access denied");
        }
      }

      const comment = await storage.createComment({
        entityType,
        entityId,
        parentId,
        content
      }, req.user!.id);

      // Broadcast comment creation to all clients in the forum
      clients.forEach((c) => {
        if (c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'comment_created',
            forumId: forumId,
            comment: comment
          }));
        }
      });

      res.status(201).json(comment);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/comments/:id", requireAuth, async (req, res, next) => {
    try {
      const { content } = req.body;
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).send("Comment content is required");
      }

      const comment = await storage.updateComment(req.params.id, content.trim(), req.user!.id);
      if (!comment) {
        return res.status(404).send("Comment not found or access denied");
      }

      // Find forum ID for broadcasting
      let forumId: string | undefined;
      let rootComment = comment;
      while (rootComment.parentId) {
        const parent = await storage.getCommentById(rootComment.parentId);
        if (!parent) break;
        rootComment = parent;
      }
      if (rootComment.entityType === 'message') {
        const message = await storage.getMessageById(rootComment.entityId);
        if (message) forumId = message.forumId;
      } else if (rootComment.entityType === 'file') {
        const file = await storage.getFileById(rootComment.entityId);
        if (file) forumId = file.forumId;
      }

      // Broadcast comment update to all clients in the forum
      if (forumId) {
        clients.forEach((c) => {
          if (c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(JSON.stringify({
              type: 'comment_updated',
              forumId: forumId,
              comment: comment
            }));
          }
        });
      }

      res.json(comment);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/comments/:id", requireAuth, async (req, res, next) => {
    try {
      const comment = await storage.getCommentById(req.params.id);
      if (!comment) {
        return res.status(404).send("Comment not found");
      }

      // Check if user owns the comment
      if (comment.userId !== req.user!.id) {
        return res.status(403).send("Access denied");
      }

      await storage.deleteComment(req.params.id);

      // Find forum ID for broadcasting
      let forumId: string | undefined;
      let rootComment = comment;
      while (rootComment.parentId) {
        const parent = await storage.getCommentById(rootComment.parentId);
        if (!parent) break;
        rootComment = parent;
      }
      if (rootComment.entityType === 'message') {
        const message = await storage.getMessageById(rootComment.entityId);
        if (message) forumId = message.forumId;
      } else if (rootComment.entityType === 'file') {
        const file = await storage.getFileById(rootComment.entityId);
        if (file) forumId = file.forumId;
      }

      // Broadcast comment deletion to all clients in the forum (include entity info)
      if (forumId) {
        clients.forEach((c) => {
          if (c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(JSON.stringify({
              type: 'comment_deleted',
              forumId: forumId,
              commentId: req.params.id,
              entityType: comment.entityType,
              entityId: comment.entityId
            }));
          }
        });
      }

      res.sendStatus(200);
    } catch (error) {
      next(error);
    }
  });

  // Tags routes
  app.get("/api/tags", optionalAuth, async (req, res, next) => {
    try {
      const forumId = typeof req.query.forumId === 'string' && req.query.forumId.trim().length > 0
        ? req.query.forumId.trim()
        : undefined;
      const tags = await storage.getTags(false, forumId);
      res.json(tags);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tags", requireAuth, async (req, res, next) => {
    try {
      const { name, description, color, forumId } = req.body;
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).send("Tag name is required");
      }

      if (!forumId || typeof forumId !== 'string' || forumId.trim().length === 0) {
        return res.status(400).send("forumId is required");
      }

      const forum = await storage.getForumById(forumId.trim());
      if (!forum) {
        return res.status(404).send("Forum not found");
      }

      if (forum.creatorId !== req.user!.id) {
        return res.status(403).send("Only forum creator can create tags");
      }

      const tag = await storage.createTag({
        name: name.trim(),
        description: description?.trim(),
        color: color || "#6b7280",
        forumId: forum.id,
        createdBy: req.user!.id,
      });

      // Broadcast tag creation to all connected clients
      clients.forEach((c) => {
        if (c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'tag_created',
            tag: tag
          }));
        }
      });

      res.status(201).json(tag);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tags/:id", requireAuth, async (req, res, next) => {
    try {
      const tag = await storage.getTagById(req.params.id);
      if (!tag) {
        return res.status(404).send("Tag not found");
      }
      res.json(tag);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/tags/:id", requireAuth, async (req, res, next) => {
    try {
      const { name, description, color } = req.body;
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).send("Tag name is required");
      }

      const existingTag = await storage.getTagById(req.params.id);
      if (!existingTag) {
        return res.status(404).send("Tag not found");
      }

      const admin = await isAdminUser(req.user);
      if (!admin) {
        if (!existingTag.forumId) {
          return res.status(403).send("Only admin can update legacy tags without forum ownership");
        }

        const forum = await storage.getForumById(existingTag.forumId);
        if (!forum) {
          return res.status(404).send("Forum not found");
        }

        if (forum.creatorId !== req.user!.id) {
          return res.status(403).send("Only forum creator can update tags");
        }
      }

      const tag = await storage.updateTag(req.params.id, {
        name: name.trim(),
        description: description?.trim(),
        color: color || "#6b7280"
      });

      if (!tag) {
        return res.status(404).send("Tag not found");
      }

      // Broadcast tag update to all connected clients
      clients.forEach((c) => {
        if (c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'tag_updated',
            tag: tag
          }));
        }
      });

      res.json(tag);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/tags/:id", requireAuth, async (req, res, next) => {
    try {
      const tag = await storage.getTagById(req.params.id);
      if (!tag) {
        return res.status(404).send("Tag not found");
      }

      const admin = await isAdminUser(req.user);
      if (!admin) {
        if (!tag.forumId) {
          return res.status(403).send("Only admin can delete legacy tags without forum ownership");
        }

        const forum = await storage.getForumById(tag.forumId);
        if (!forum) {
          return res.status(404).send("Forum not found");
        }

        if (forum.creatorId !== req.user!.id) {
          return res.status(403).send("Only forum creator can delete tags");
        }
      }

      await storage.deleteTag(req.params.id);

      // Broadcast tag deletion to all connected clients
      clients.forEach((c) => {
        if (c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'tag_deleted',
            tagId: req.params.id
          }));
        }
      });

      res.sendStatus(200);
    } catch (error) {
      next(error);
    }
  });

  // Tag assignment routes
  app.get("/api/tags/entity/:entityType/:entityId", optionalAuth, async (req, res, next) => {
    try {
      const { entityType, entityId } = req.params;

      // Validate entity type
      if (!['file', 'message', 'forum'].includes(entityType)) {
        return res.status(400).send("Invalid entity type");
      }

      // Check forum access based on entity type
      let forumId: string | undefined;
      if (entityType === 'message') {
        const message = await storage.getMessageById(entityId);
        if (!message) {
          return res.status(404).send("Message not found");
        }
        forumId = message.forumId;
      } else if (entityType === 'file') {
        const file = await storage.getFileById(entityId);
        if (!file) {
          return res.status(404).send("File not found");
        }
        forumId = file.forumId;
      } else if (entityType === 'forum') {
        forumId = entityId;
      }

      if (!forumId) {
        return res.status(400).send("Could not determine forum ID");
      }

      // Check forum access
      const forum = await storage.getForumById(forumId);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }

      if (!forum.isPublic) {
        if (!req.isAuthenticated?.() || !req.user) {
          return res.sendStatus(401);
        }
        const isMember = await storage.isForumMember(forum.id, req.user.id);
        if (!isMember) {
          return res.status(403).send("Access denied");
        }
      }

      const tags = await storage.getEntityTags(entityType, entityId);
      res.json(tags);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tags/assign", requireAuth, async (req, res, next) => {
    try {
      const { entityType, entityId, tagIds } = req.body;

      // Validate entity type
      if (!['file', 'message', 'forum'].includes(entityType)) {
        return res.status(400).send("Invalid entity type");
      }

      if (!Array.isArray(tagIds) || tagIds.length === 0) {
        return res.status(400).send("Tag IDs array is required");
      }

      // Check forum access based on entity type
      let forumId: string | undefined;
      if (entityType === 'message') {
        const message = await storage.getMessageById(entityId);
        if (!message) {
          return res.status(404).send("Message not found");
        }
        forumId = message.forumId;
      } else if (entityType === 'file') {
        const file = await storage.getFileById(entityId);
        if (!file) {
          return res.status(404).send("File not found");
        }
        forumId = file.forumId;
      } else if (entityType === 'forum') {
        forumId = entityId;
      }

      if (!forumId) {
        return res.status(400).send("Could not determine forum ID");
      }

      const forum = await storage.getForumById(forumId);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }

      if (forum.creatorId !== req.user!.id) {
        return res.status(403).send("Only forum creator can assign tags");
      }

      for (const tagId of tagIds) {
        const tag = await storage.getTagById(tagId);
        if (!tag) {
          return res.status(404).send(`Tag not found: ${tagId}`);
        }

        if (tag.forumId && tag.forumId !== forumId) {
          return res.status(403).send("Cannot assign tags created for another forum");
        }
      }

      // Assign tags
      const assignments = await storage.assignTagsToEntity(entityType, entityId, tagIds);

      // Update SEO metadata for the entity
      if (entityType === 'forum') {
        await storage.updateForumSEOMetadata(entityId);
      } else if (entityType === 'file') {
        await storage.updateFileSEOMetadata(entityId);
      }

      // Broadcast tag assignment to all clients in the forum
      clients.forEach((c) => {
        if (c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'tags_assigned',
            forumId: forumId,
            entityType: entityType,
            entityId: entityId,
            tagIds: tagIds
          }));
        }
      });

      res.status(201).json(assignments);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/tags/assign/:entityType/:entityId/:tagId", requireAuth, async (req, res, next) => {
    try {
      const { entityType, entityId, tagId } = req.params;

      // Validate entity type
      if (!['file', 'message', 'forum'].includes(entityType)) {
        return res.status(400).send("Invalid entity type");
      }

      // Check forum access based on entity type
      let forumId: string | undefined;
      if (entityType === 'message') {
        const message = await storage.getMessageById(entityId);
        if (!message) {
          return res.status(404).send("Message not found");
        }
        forumId = message.forumId;
      } else if (entityType === 'file') {
        const file = await storage.getFileById(entityId);
        if (!file) {
          return res.status(404).send("File not found");
        }
        forumId = file.forumId;
      } else if (entityType === 'forum') {
        forumId = entityId;
      }

      if (!forumId) {
        return res.status(400).send("Could not determine forum ID");
      }

      const forum = await storage.getForumById(forumId);
      if (!forum) {
        return res.status(404).send("Forum not found");
      }

      if (forum.creatorId !== req.user!.id) {
        return res.status(403).send("Only forum creator can unassign tags");
      }

      const tag = await storage.getTagById(tagId);
      if (!tag) {
        return res.status(404).send("Tag not found");
      }

      if (tag.forumId && tag.forumId !== forumId) {
        return res.status(403).send("Cannot unassign tags created for another forum");
      }

      // Remove tag assignment
      await storage.removeTagFromEntity(entityType, entityId, tagId);

      // Update SEO metadata for the entity
      if (entityType === 'forum') {
        await storage.updateForumSEOMetadata(entityId);
      } else if (entityType === 'file') {
        await storage.updateFileSEOMetadata(entityId);
      }

      // Broadcast tag removal to all clients in the forum
      clients.forEach((c) => {
        if (c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'tag_removed',
            forumId: forumId,
            entityType: entityType,
            entityId: entityId,
            tagId: tagId
          }));
        }
      });

      res.sendStatus(200);
    } catch (error) {
      next(error);
    }
  });

  // Search Analytics endpoints
  
  // Global Search
  app.get("/api/search", optionalAuth, async (req, res, next) => {
    try {
      const query = req.query.q as string;
      if (!query || typeof query !== 'string') {
        return res.status(400).send("Query is required");
      }

      console.log(`[API] Search request: query="${query}", user=${req.user?.username || 'anonymous'}`);
      console.log(`[API] Starting search across local databases...`);
      const startTime = Date.now();
      
      const forumId = req.query.forumId as string | undefined;
      const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || '20'), 10)));
      const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10));

      // Perform local search
      const localResults = await storage.searchEntities(query, req.user?.id, forumId);

      // Sort files by uploadedAt desc
      const sortedFiles = localResults.files.sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

      const totalFiles = sortedFiles.length;
      const paginatedFiles = sortedFiles.slice(offset, offset + limit);

      const duration = Date.now() - startTime;
      console.log(`[API] Search completed: query="${query}", totalFiles:${totalFiles}, returned:${paginatedFiles.length}, duration=${duration}ms`);

      res.json({ forums: localResults.forums, messages: localResults.messages, files: paginatedFiles, totalFiles });
    } catch (error) {
      next(error);
    }
  });

  // Trigger Neon extracted replication between Neon DBs (admin only)
  app.post('/api/neon/replicate', requireAuth, async (req, res, next) => {
    try {
      const targetConn = (req.body && req.body.targetConn) || undefined;
      const neonManagerImport = await import('./neon-manager');
      const neonManager = neonManagerImport.default;
      const urls = await neonManager.getNeonDbUrls();
      if (!urls || urls.length < 2) return res.status(400).json({ ok: false, message: 'No available Neon DBs to replicate to' });
      const primary = urls[0];
      if (targetConn) {
        // Run replication synchronously and return results
        const result = await neonManager.default.replicateExtractedVideoMappings(primary, targetConn);
        return res.json({ ok: true, inserted: result.inserted, skipped: result.skipped });
      }
      // Pick the first non-primary as target
      const target = urls.find(u => u !== primary);
      if (!target) return res.status(400).json({ ok: false, message: 'No target Neon DB found' });
      // Run in background
      (async () => {
        try {
          const result = await neonManager.default.replicateExtractedVideoMappings(primary, target);
          console.log('[Neon] Background replication finished:', result);
        } catch (err) {
          console.warn('[Neon] Background replication failed', err);
        }
      })();
      return res.status(202).json({ ok: true, message: 'Replication started', target });
    } catch (err) {
      next(err);
    }
  });

  // Import backup JSON file into a suitable Neon DB (admin only)
  app.post('/api/neon/import-backup', requireAuth, async (req, res, next) => {
    try {
      const { targetConn, filePath } = req.body || {};
      const neonManager = await import('./neon-manager');
      const urls = await neonManager.default.getNeonDbUrls();
      if (!urls || urls.length === 0) return res.status(400).json({ ok: false, message: 'No Neon DBs available' });

      let target = targetConn;
      if (!target) {
        // Pick smallest DB size (prefer zero size)
        let minSize = Number.MAX_SAFE_INTEGER;
        let chosen = urls[0];
        for (const u of urls) {
          const size = await neonManager.getDbSizeBytes(u);
          if (size === null) continue;
          if (size === 0) { chosen = u; break; }
          if (size < minSize) { minSize = size; chosen = u; }
        }
        target = chosen;
      }

      const candidatePath = filePath || path.resolve(process.cwd(), 'video_mappings.json');
      if (!fs.existsSync(candidatePath)) return res.status(404).json({ ok: false, message: 'Backup file not found' });

      // Run import in background to avoid timeouts
      (async () => {
        try {
          const result = await neonManager.importVideoMappingsFromJson(target as string, candidatePath);
          console.log('[NeonImport] Import completed', result);
          // After successful import, set this target as main extracted DB
          try { await neonManager.setMainExtractedDb(target as string); } catch (e) { console.warn('Failed to set main extracted DB', e); }
        } catch (err) {
          console.warn('[NeonImport] Import failed', err?.message || err);
        }
      })();

      return res.status(202).json({ ok: true, message: 'Import started', target });
    } catch (err) {
      next(err);
    }
  });

  // List Neon DBs and current db sizes (admin only)
  app.get('/api/neon/list', requireAuth, async (req, res, next) => {
    try {
      const neonManagerImport = await import('./neon-manager');
      const neonManager = neonManagerImport.default;
      const urls = await neonManager.getNeonDbUrls();
      const list = [];
      for (const u of urls) {
        const size = await neonManager.getDbSizeBytes(u);
        list.push({ url: u, size });
      }
      return res.json({ ok: true, list });
    } catch (err) { next(err); }
  });

  // SSE Search stream for local DBs
  app.get('/api/search/stream', optionalAuth, async (req, res, next) => {
    try {
      const query = String(req.query.q || '');
      if (!query) return res.status(400).send('Query required');
      const forumId = req.query.forumId as string | undefined;
      const userId = req.user?.id;

      // Check access if forumId is provided
      if (forumId) {
        const forum = await storage.getForumById(forumId);
        if (!forum) return res.status(404).send('Forum not found');
        if (!forum.isPublic) {
          if (!req.isAuthenticated?.() || !req.user) return res.sendStatus(401);
          const isMember = await storage.isForumMember(forumId, req.user.id);
          if (!isMember) return res.status(403).send('Access denied');
        }
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const instances = dbManager.getAllInstances();
      const shardBatchSize = 5; // small batch for progressive streaming

      // For each instance, query files/messages/forums and stream results as they arrive
      const lower = `%${query.toLowerCase()}%`;
      // Keep a running count of streamed local files so clients can show totals progressively
      let localStreamedCount = 0;
      for (const instance of instances) {
        let offset = 0;
        let more = true;
        while (more) {
          try {
            const fileQueryBatch = instance.db
              .select({ file: files, user: users, forum: forums })
              .from(files)
              .innerJoin(users, eq(files.userId, users.id))
              .innerJoin(forums, eq(files.forumId, forums.id))
              .leftJoin(forumMembers, and(eq(forumMembers.forumId, forums.id), userId ? eq(forumMembers.userId, userId) : sql`1=0`))
              .where(and(
                or(eq(forums.isPublic, true), userId ? eq(forums.creatorId, userId) : sql`1=0`, userId ? isNotNull(forumMembers.id) : sql`1=0`),
                or(
                  ilike(files.fileName, lower),
                  and(isNotNull(files.metaTitle), ilike(files.metaTitle, lower)),
                  and(isNotNull(files.metaDescription), ilike(files.metaDescription, lower)),
                  and(isNotNull(files.keywords), ilike(files.keywords, lower)),
                  and(isNotNull(files.adminNotes), ilike(files.adminNotes, lower)),
                  exists(instance.db.select().from(fileTags).innerJoin(tags, eq(fileTags.tagId, tags.id)).where(and(eq(fileTags.fileId, files.id), ilike(tags.name, lower))))
                )
              ))
              .limit(shardBatchSize)
              .offset(offset);
            const rows = await fileQueryBatch;
            for (const r of rows) {
              const payload = { type: 'file', data: { ...r.file, user: r.user, forum: r.forum } };
              res.write(`data: ${JSON.stringify(payload)}\n\n`);
              localStreamedCount++;
              await new Promise(r => setTimeout(r, 10));
            }
            // Emit an updated count event for local streamed files after each batch
            if (rows.length > 0) {
              res.write(`event: count\ndata: ${JSON.stringify({ source: 'local', count: localStreamedCount })}\n\n`);
            }
            if (rows.length < shardBatchSize) more = false;
            else offset += shardBatchSize;
          } catch (err) {
            console.warn('Search stream shard batch error on', instance.id, err && (err as any).message || err);
            more = false;
          }
        }
        try {
          // Files
          const fileQuery = instance.db
            .select({ file: files, user: users, forum: forums })
            .from(files)
            .innerJoin(users, eq(files.userId, users.id))
            .innerJoin(forums, eq(files.forumId, forums.id))
            .leftJoin(forumMembers, and(eq(forumMembers.forumId, forums.id), userId ? eq(forumMembers.userId, userId) : sql`1=0`));

          const lower = `%${query.toLowerCase()}%`;
          let conditionedFileQuery = fileQuery.where(and(
            or(eq(forums.isPublic, true), userId ? eq(forums.creatorId, userId) : sql`1=0`, userId ? isNotNull(forumMembers.id) : sql`1=0`),
            or(
              ilike(files.fileName, lower),
              and(isNotNull(files.metaTitle), ilike(files.metaTitle, lower)),
              and(isNotNull(files.metaDescription), ilike(files.metaDescription, lower)),
              and(isNotNull(files.keywords), ilike(files.keywords, lower)),
              and(isNotNull(files.adminNotes), ilike(files.adminNotes, lower)),
              exists(instance.db.select().from(fileTags).innerJoin(tags, eq(fileTags.tagId, tags.id)).where(and(eq(fileTags.fileId, files.id), ilike(tags.name, lower))))
            )
          ));
          if (forumId) conditionedFileQuery = conditionedFileQuery.where(eq(files.forumId, forumId));
          const fileRows = await conditionedFileQuery;
          for (const r of fileRows) {
            const payload = { type: 'file', data: { ...r.file, user: r.user, forum: r.forum } };
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
            localStreamedCount++;
            await new Promise(r => setTimeout(r, 10));
          }
          if (fileRows.length > 0) {
            res.write(`event: count\ndata: ${JSON.stringify({ source: 'local', count: localStreamedCount })}\n\n`);
          }

          // Messages
          const messageQuery = instance.db
            .select({ message: messages, user: users, forum: forums })
            .from(messages)
            .innerJoin(users, eq(messages.userId, users.id))
            .innerJoin(forums, eq(messages.forumId, forums.id))
            .leftJoin(forumMembers, and(eq(forumMembers.forumId, forums.id), userId ? eq(forumMembers.userId, userId) : sql`1=0`));
          let conditionedMessageQuery = messageQuery.where(and(
            or(eq(forums.isPublic, true), userId ? eq(forums.creatorId, userId) : sql`1=0`, userId ? isNotNull(forumMembers.id) : sql`1=0`),
            or(
              ilike(messages.content, lower),
              exists(instance.db.select().from(messageTags).innerJoin(tags, eq(messageTags.tagId, tags.id)).where(and(eq(messageTags.messageId, messages.id), ilike(tags.name, lower))))
            )
          ));
          if (forumId) conditionedMessageQuery = conditionedMessageQuery.where(eq(messages.forumId, forumId));
          // Paginate messages in small batches for progressive streaming
          let msgOffset = 0;
          let msgMore = true;
          while (msgMore) {
            const msgBatch = await conditionedMessageQuery.limit(shardBatchSize).offset(msgOffset);
            for (const r of msgBatch) {
              const payload = { type: 'message', data: { ...r.message, user: r.user, forum: r.forum } };
              res.write(`data: ${JSON.stringify(payload)}\n\n`);
              await new Promise(r => setTimeout(r, 10));
            }
            if (msgBatch.length < shardBatchSize) msgMore = false;
            else msgOffset += shardBatchSize;
          }

          // Forums - only search on forum names or descriptions
          const forumQuery = instance.db
            .select({ forum: forums })
            .from(forums)
            .leftJoin(forumMembers, and(eq(forumMembers.forumId, forums.id), userId ? eq(forumMembers.userId, userId) : sql`1=0`))
            .where(and(
              or(eq(forums.isPublic, true), userId ? eq(forums.creatorId, userId) : sql`1=0`, userId ? isNotNull(forumMembers.id) : sql`1=0`),
              or(
                ilike(forums.name, lower),
                ilike(forums.description, lower),
                exists(instance.db.select().from(forumTags).innerJoin(tags, eq(forumTags.tagId, tags.id)).where(and(eq(forumTags.forumId, forums.id), ilike(tags.name, lower)))),
                exists(instance.db.select().from(files).where(and(eq(files.forumId, forums.id), or(
                  ilike(files.fileName, lower),
                  and(isNotNull(files.metaTitle), ilike(files.metaTitle, lower)),
                  and(isNotNull(files.metaDescription), ilike(files.metaDescription, lower)),
                  and(isNotNull(files.keywords), ilike(files.keywords, lower)),
                  and(isNotNull(files.adminNotes), ilike(files.adminNotes, lower))
                )))),
                exists(instance.db.select().from(messages).where(and(eq(messages.forumId, forums.id), or(
                  ilike(messages.content, lower),
                  exists(instance.db.select().from(messageTags).innerJoin(tags, eq(messageTags.tagId, tags.id)).where(and(eq(messageTags.messageId, messages.id), ilike(tags.name, lower))))
                ))))
              )
            ));
          const forumRows = await forumQuery.limit(20);
          for (const r of forumRows) {
            res.write(`data: ${JSON.stringify({ type: 'forum', data: r.forum })}\n\n`);
            await new Promise(r => setTimeout(r, 10));
          }
        } catch (err) {
          console.warn('Search stream instance error on', instance.id, err && (err as any).message || err);
        }
      }
      res.write(`event: done\ndata: {}\n\n`);
      res.end();
    } catch (error) {
      next(error);
    }
  });



  app.get('/api/extracted/:id/resolve', optionalAuth, async (req, res, next) => {
    try {
      const idParam = req.params.id;
      if (!idParam || !idParam.startsWith('extracted_')) return res.status(400).json({ error: 'Invalid extracted id' });
      // Check cache
      const cacheKey = idParam;
      const cached = resolvedExtractedCache.get(cacheKey);
      if (cached && (Date.now() - cached.ts) < RESOLVE_TTL_MS) {
        return res.json({ ok: true, resolvedUrl: cached.resolvedUrl, proxiedUrl: cached.proxiedUrl, cached: true });
      }

      // Use storage helper to get extracted record
      const file = await storage.getFileById(idParam);
      if (!file) return res.status(404).json({ error: 'Extracted file not found' });

      // The original video page (xvideos) is stored in file.videoUrl or directDownloadUrl
      const videoPage = (file as any).videoUrl || file.directDownloadUrl;
      if (!videoPage) return res.status(400).json({ error: 'No source video page available to resolve' });

      // Fetch the page via the Vercel proxy
      const fetchUrl = `${VERCEL_PROXY_BASE}${encodeURIComponent(videoPage)}`;
      console.log('[ExtractResolve] Fetching via vercel proxy:', fetchUrl);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      try {
        const r = await fetch(fetchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: controller.signal });
        clearTimeout(timeoutId);
        if (!r.ok) return res.status(502).json({ error: 'Failed to fetch source page', status: r.status });
        const html = await r.text();
        // Try to parse ld+json
        let resolvedUrl: string | null = null;
        try {
          const cheerioMod = await import('cheerio');
          const cheerio = cheerioMod && (cheerioMod.default || cheerioMod);
          if (!cheerio || typeof cheerio.load !== 'function') throw new Error('cheerio not available');
          const $ = cheerio.load(html);
          const ld = $('script[type="application/ld+json"]').html();
          if (ld) {
            try {
              const meta = JSON.parse(ld);
              if (meta && meta.contentUrl) {
                if (typeof meta.contentUrl === 'string') resolvedUrl = meta.contentUrl;
                else if (Array.isArray(meta.contentUrl) && meta.contentUrl.length > 0) resolvedUrl = meta.contentUrl[0];
              }
            } catch (e) {
              // ignore parse errors
            }
          }
        } catch (err) {
          console.warn('[ExtractResolve] Cheerio parse failed', err && err.message);
        }

        // Fallback: search for direct .mp4 links in HTML
        if (!resolvedUrl) {
          const mp4Match = html.match(/https?:\/\/[^'"\s>]+\.mp4[^'"\s]*/i);
          if (mp4Match) resolvedUrl = mp4Match[0];
        }

        if (!resolvedUrl) {
          // As a final fallback, use the stored directDownloadUrl
          resolvedUrl = file.directDownloadUrl || null;
        }

        if (!resolvedUrl) return res.status(404).json({ error: 'Could not resolve mp4 or m3u8 url from page' });

        const proxiedUrl = `${VERCEL_PROXY_BASE}${encodeURIComponent(resolvedUrl)}`;
        // Perform a quick HEAD or small ranged GET to collect headers for diagnostics
        let resolvedMeta: any = {};
        try {
          // Prefer HEAD but some servers block HEAD - try HEAD first
          let headResp = null;
          try {
            headResp = await fetch(resolvedUrl, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } });
          } catch (hErr) {
            // HEAD failed, try small ranged GET
            try {
              const r = await fetch(resolvedUrl, { headers: { 'User-Agent': 'Mozilla/5.0', 'Range': 'bytes=0-0' } });
              resolvedMeta = { status: r.status, contentType: r.headers.get('content-type'), acceptRanges: r.headers.get('accept-ranges') };
            } catch (gErr) {
              resolvedMeta = { error: (gErr && gErr.message) || String(gErr) };
            }
          }
          if (headResp) {
            resolvedMeta = { status: headResp.status, contentType: headResp.headers.get('content-type'), acceptRanges: headResp.headers.get('accept-ranges') };
          }
        } catch (metaErr) {
          resolvedMeta = { error: (metaErr && metaErr.message) || String(metaErr) };
        }

        // Also check proxied URL (vercel proxy) headers for diagnostic purposes
        let proxiedMeta: any = {};
        try {
          try {
            const pj = await fetch(proxiedUrl, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } });
            proxiedMeta = { status: pj.status, contentType: pj.headers.get('content-type'), acceptRanges: pj.headers.get('accept-ranges') };
          } catch (pErr) {
            try {
              const pr = await fetch(proxiedUrl, { headers: { 'User-Agent': 'Mozilla/5.0', 'Range': 'bytes=0-0' } });
              proxiedMeta = { status: pr.status, contentType: pr.headers.get('content-type'), acceptRanges: pr.headers.get('accept-ranges') };
            } catch (pErr2) {
              proxiedMeta = { error: (pErr2 && pErr2.message) || String(pErr2) };
            }
          }
        } catch (e) {
          proxiedMeta = { error: (e && e.message) || String(e) };
        }

        // Also check our local proxy endpoint for better compatibility (same-origin, range support)
        const localProxyUrl = `/api/proxy?url=${encodeURIComponent(resolvedUrl)}`;
        // Build absolute URL for server-side fetch (relative fetch fails in Node). Avoid IPv6 loopback issues by mapping ::1 to 127.0.0.1
        let hostHeader = req.get('host') || 'localhost:5000';
        hostHeader = hostHeader.replace('[::1]', '127.0.0.1').replace('::1', '127.0.0.1');
        const localProxyAbsolute = `${req.protocol}://${hostHeader}${localProxyUrl}`;
        let localProxyMeta: any = {};
        try {
          try {
            const lj = await fetch(localProxyAbsolute, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } });
            localProxyMeta = { status: lj.status, contentType: lj.headers.get('content-type'), acceptRanges: lj.headers.get('accept-ranges') };
          } catch (lErr) {
            try {
              const lr = await fetch(localProxyAbsolute, { headers: { 'User-Agent': 'Mozilla/5.0', 'Range': 'bytes=0-0' } });
              localProxyMeta = { status: lr.status, contentType: lr.headers.get('content-type'), acceptRanges: lr.headers.get('accept-ranges') };
            } catch (lErr2) {
              localProxyMeta = { error: (lErr2 && lErr2.message) || String(lErr2) };
            }
          }
        } catch (le) {
          localProxyMeta = { error: (le && le.message) || String(le) };
        }

        // Cache the resolved url and diagnostics (include local proxy info)
        resolvedExtractedCache.set(cacheKey, { ts: Date.now(), resolvedUrl, proxiedUrl, resolvedMeta, proxiedMeta, localProxyUrl, localProxyMeta });

        console.log('[ExtractResolve] Resolved URL', { resolvedUrl, proxiedUrl, resolvedMeta, proxiedMeta, localProxyUrl, localProxyMeta });
        return res.json({ ok: true, resolvedUrl, proxiedUrl, localProxyUrl, resolvedMeta, proxiedMeta, localProxyMeta });
      } catch (err) {
        clearTimeout(timeoutId);
        console.warn('[ExtractResolve] Fetch failed', err && err.message);
        return res.status(502).json({ error: 'Failed to fetch via proxy', details: err && err.message });
      }
    } catch (error) {
      next(error);
    }
  });

  // Get popular searches
  app.get("/api/search/popular", optionalAuth, async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      
      const popularSearches = await storage.getPopularSearches(limit);
      res.json(popularSearches);
    } catch (error) {
      next(error);
    }
  });

  // Track search query
  app.post("/api/search/track", requireAuth, async (req, res, next) => {
    try {
      const { query, resultsCount, sessionId } = req.body;
      
      if (!query || typeof query !== 'string') {
        return res.status(400).send("Query is required");
      }

      await storage.trackSearch({
        query: query.trim(),
        userId: req.user?.id,
        resultsCount: resultsCount || 0,
        sessionId: sessionId
      });

      res.sendStatus(200);
    } catch (error) {
      next(error);
    }
  });

  // Get search analytics stats (admin endpoint)
  app.get("/api/admin/search-stats", requireAuth, async (req, res, next) => {
    try {
      const stats = await storage.getSearchAnalyticsStats();
      res.json(stats);
    } catch (error) {
      next(error);
    }
  });

  // Web Proxy Route for accessing blocked content
  app.get("/api/proxy", optionalAuth, async (req, res, next) => {
    try {
      const targetUrl = req.query.url as string;
      
      console.log(`🌐 [WEB PROXY] Request received:`, {
        url: targetUrl,
        userAgent: req.headers['user-agent'],
        referer: req.headers.referer,
        range: req.headers.range,
        timestamp: new Date().toISOString()
      });

      if (!targetUrl || typeof targetUrl !== 'string') {
        console.error(`❌ [WEB PROXY] Invalid URL parameter:`, targetUrl);
        return res.status(400).json({ 
          error: 'URL parameter is required',
          message: 'Please provide a valid URL to proxy'
        });
      }

      // Validate URL format
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(targetUrl);
        console.log(`✅ [WEB PROXY] URL validation passed:`, {
          protocol: parsedUrl.protocol,
          hostname: parsedUrl.hostname,
          pathname: parsedUrl.pathname,
          search: parsedUrl.search
        });
      } catch (urlError) {
        console.error(`❌ [WEB PROXY] Invalid URL format:`, targetUrl, urlError);
        return res.status(400).json({ 
          error: 'Invalid URL format',
          message: 'The provided URL is not valid'
        });
      }

      // Security check: only allow http and https
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        console.error(`❌ [WEB PROXY] Unsupported protocol:`, parsedUrl.protocol);
        return res.status(400).json({ 
          error: 'Unsupported protocol',
          message: 'Only HTTP and HTTPS URLs are supported'
        });
      }

      console.log(`🚀 [WEB PROXY] Starting proxy request to:`, targetUrl);

      // Prepare headers for the proxy request
      const proxyHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'video/webm,video/mp4,video/*,application/vnd.apple.mpegurl,application/x-mpegURL,*/*;q=0.9',
        'Accept-Encoding': 'identity', // Disable compression to avoid issues
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Referer': parsedUrl.origin
      };

      // Forward range header if present (important for video streaming)
      if (req.headers.range) {
        proxyHeaders['Range'] = req.headers.range;
        console.log(`📊 [WEB PROXY] Forwarding range header:`, req.headers.range);
      }

      console.log(`📤 [WEB PROXY] Sending request with headers:`, proxyHeaders);

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn(`⏰ [WEB PROXY] Request timeout for URL:`, targetUrl);
        controller.abort();
      }, 30000); // 30 second timeout

      try {
        // Make the proxy request
        const response = await fetch(targetUrl, {
          method: 'GET',
          headers: proxyHeaders,
          redirect: 'follow', // Follow redirects automatically
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        console.log(`📥 [WEB PROXY] Response received:`, {
          status: response.status,
          statusText: response.statusText,
          headers: {
            'content-type': response.headers.get('content-type'),
            'content-length': response.headers.get('content-length'),
            'content-range': response.headers.get('content-range'),
            'accept-ranges': response.headers.get('accept-ranges'),
            'cache-control': response.headers.get('cache-control'),
            'last-modified': response.headers.get('last-modified')
          }
        });

        if (!response.ok && response.status !== 206) {
          console.error(`❌ [WEB PROXY] Upstream error:`, {
            status: response.status,
            statusText: response.statusText,
            url: targetUrl
          });
          return res.status(response.status).json({
            error: 'Upstream server error',
            message: `Failed to fetch content: ${response.status} ${response.statusText}`,
            upstreamStatus: response.status
          });
        }

        // Set response headers
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const contentLength = response.headers.get('content-length');
        const contentRange = response.headers.get('content-range');
        const acceptRanges = response.headers.get('accept-ranges');
        const cacheControl = response.headers.get('cache-control') || 'no-cache';
        const lastModified = response.headers.get('last-modified');

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', cacheControl);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Range');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

        if (contentLength) {
          res.setHeader('Content-Length', contentLength);
        }

        if (acceptRanges) {
          res.setHeader('Accept-Ranges', acceptRanges);
        }

        if (lastModified) {
          res.setHeader('Last-Modified', lastModified);
        }

        // Handle partial content (range requests)
        if (response.status === 206 && contentRange) {
          res.setHeader('Content-Range', contentRange);
          res.status(206);
          console.log(`📊 [WEB PROXY] Serving partial content:`, contentRange);
        } else {
          res.status(response.status);
        }

        console.log(`🌊 [WEB PROXY] Starting stream for:`, {
          contentType,
          contentLength: contentLength || 'unknown',
          isPartial: response.status === 206
        });

        // Stream the response body without buffering
        if (response.body) {
          // Handle both Node.js streams and Web Streams API
          if (typeof response.body.pipe === 'function') {
            // Node.js stream (older versions)
            console.log(`🔄 [WEB PROXY] Using Node.js stream piping`);
            
            // Handle client disconnect
            req.on('close', () => {
              console.log(`🔌 [WEB PROXY] Client disconnected, aborting stream for:`, targetUrl);
              response.body?.destroy?.();
            });

            response.body.pipe(res);

            response.body.on('error', (error) => {
              console.error(`❌ [WEB PROXY] Stream error:`, error);
              if (!res.headersSent) {
                res.status(500).end('Streaming error');
              }
            });

            response.body.on('end', () => {
              console.log(`✅ [WEB PROXY] Stream completed successfully for:`, targetUrl);
            });

          } else {
            // Web Streams API (Node 18+)
            console.log(`🔄 [WEB PROXY] Using Web Streams API`);
            
            const reader = response.body.getReader();
            let totalBytesSent = 0;

            // Handle client disconnect
            req.on('close', () => {
              console.log(`🔌 [WEB PROXY] Client disconnected, cancelling reader for:`, targetUrl);
              reader.cancel().catch(e => console.error('Error cancelling reader:', e));
            });

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  console.log(`✅ [WEB PROXY] Web stream completed:`, {
                    totalBytesSent,
                    url: targetUrl
                  });
                  break;
                }

                // Check if client is still connected
                if (res.destroyed) {
                  console.log(`🔌 [WEB PROXY] Response destroyed, stopping stream for:`, targetUrl);
                  await reader.cancel();
                  break;
                }

                // Write chunk to response
                const canWrite = res.write(value);
                totalBytesSent += value.length;

                if (!canWrite) {
                  // Backpressure: wait for drain
                  await new Promise(resolve => res.once('drain', resolve));
                }

                // Log progress for large files
                if (totalBytesSent % (1024 * 1024) === 0) { // Every MB
                  console.log(`📈 [WEB PROXY] Progress: ${Math.round(totalBytesSent / 1024 / 1024)}MB sent for:`, targetUrl);
                }
              }
            } catch (streamError) {
              console.error(`❌ [WEB PROXY] Web stream error:`, streamError);
              if (!res.headersSent) {
                res.status(500).end('Streaming error');
              }
            } finally {
              reader.releaseLock();
              if (!res.headersSent) {
                res.end();
              }
            }
          }
        } else {
          console.warn(`⚠️ [WEB PROXY] No response body for:`, targetUrl);
          res.end();
        }

      } catch (fetchError) {
        clearTimeout(timeoutId);
        
        console.error(`❌ [WEB PROXY] Fetch error:`, {
          error: fetchError.message,
          code: fetchError.code,
          url: targetUrl
        });

        if (fetchError.name === 'AbortError') {
          return res.status(408).json({
            error: 'Request timeout',
            message: 'The proxy request timed out'
          });
        }

        return res.status(502).json({
          error: 'Proxy error',
          message: 'Failed to fetch content from external server',
          details: fetchError.message
        });
      }

    } catch (error) {
      console.error(`❌ [WEB PROXY] Unexpected error:`, error);
      next(error);
    }
  });

  const httpServer = createServer(app);
  const isVercelRuntime = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
  
  // Create WebSocket manager
  const wsManager = {
    broadcast: (message: any) => {
      clients.forEach((client, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify(message));
          } catch (error) {
            console.warn('Failed to send WebSocket message:', error);
          }
        }
      });
    },
    
    broadcastToUser: (userId: string, message: any) => {
      clients.forEach((client, ws) => {
        if (client.userId === userId && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify(message));
          } catch (error) {
            console.warn('Failed to send WebSocket message to user:', error);
          }
        }
      });
    }
  };
  
  // Add WebSocket manager to app.locals
  app.locals.wsManager = wsManager;

  // Video thumbnail generation function
  async function generateVideoThumbnail(videoPath: string): Promise<Buffer | null> {
    return new Promise((resolve, reject) => {
      const tempThumbnailPath = `${videoPath}.thumb.jpg`;
      
      ffmpeg(videoPath)
        .screenshots({
          count: 1,
          folder: path.dirname(videoPath),
          filename: path.basename(tempThumbnailPath),
          timemarks: ['10%'], // Take thumbnail at 10% of video duration
          size: '300x300'
        })
        .on('end', async () => {
          try {
            // Read the generated thumbnail
            const fs = await import('fs/promises');
            const thumbnailBuffer = await fs.readFile(tempThumbnailPath);
            
            // Clean up temp file
            await fs.unlink(tempThumbnailPath);
            
            resolve(thumbnailBuffer);
          } catch (error) {
            console.warn('Failed to read/cleanup video thumbnail:', error);
            resolve(null);
          }
        })
        .on('error', (error) => {
          console.warn('FFmpeg thumbnail generation failed:', error);
          resolve(null);
        });
    });
  }

  if (!isVercelRuntime) {
    const wss = new WebSocketServer({
      server: httpServer,
      path: '/ws',
      verifyClient: async (info, callback) => {
        // Parse cookies to get session
        const cookies = parseCookies(info.req.headers.cookie || '');
        const sessionId = cookies['connect.sid'] || cookies['sessionId'];
        const userAgent = info.req.headers['user-agent'] || 'unknown';
        const clientIP = info.req.socket.remoteAddress || info.req.connection?.remoteAddress || 'unknown';
        const isPingService = userAgent.includes('Forum-Ping-Service');

        console.log(`🔐 WebSocket authentication attempt:`, {
          hasSessionId: !!sessionId,
          userAgent: userAgent,
          ip: clientIP,
          isPingService: isPingService,
          timestamp: new Date().toISOString()
        });

        if (sessionId) {
          try {
            // Get session store and check if session exists
            const sessionStore = sessionSettings.store;
            if (sessionStore && typeof sessionStore.get === 'function') {
              sessionStore.get(sessionId.replace('s:', '').split('.')[0], (err: any, session: any) => {
                if (!err && session && session.passport && session.passport.user) {
                  // User is authenticated
                  (info.req as any).userId = session.passport.user;
                  console.log(`✅ WebSocket authentication successful for user: ${session.passport.user}`);
                  callback(true);
                  return;
                }
                console.log(`❌ WebSocket authentication failed: Invalid session`);
                callback(false, 401, 'Unauthorized');
              });
              return;
            }
          } catch (error) {
            console.error('Session verification error:', error);
          }
        }

        if (isPingService) {
          console.log(`🚀 Ping service authentication bypassed (no session needed for ping)`);
          (info.req as any).userId = 'ping-service'; // Special user ID for ping service
          callback(true); // Allow ping service connections
          return;
        }

        console.log(`❌ WebSocket authentication failed: No session ID`);
        callback(false, 401, 'Unauthorized');
      }
    });

    wss.on('connection', (ws: WebSocket, req: any) => {
      const client: WSClient = { ws };
      // Get authenticated user ID from request
      client.userId = (req as any).userId;

      // Log connection details
      const clientIP = req.socket.remoteAddress || req.connection?.remoteAddress || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';
      const isPingService = userAgent.includes('Forum-Ping-Service');

      console.log(`🔌 WebSocket client connected:`, {
        userId: client.userId || 'unauthenticated',
        ip: clientIP,
        userAgent: userAgent,
        isPingService: isPingService,
        timestamp: new Date().toISOString()
      });

      if (isPingService) {
        console.log('🚀 Ping service connected - keeping server awake!');
      }

      clients.set(ws, client);

      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());

          console.log(`💬 WebSocket message received:`, {
            userId: client.userId || 'unauthenticated',
            type: message.type,
            forumId: message.forumId || 'none',
            hasContent: !!message.content,
            timestamp: new Date().toISOString()
          });

          if (message.type === 'join' && message.forumId) {
            client.forumId = message.forumId;
            console.log(`Client joined forum: ${message.forumId}`);
          }

          if (message.type === 'message' && message.forumId && message.content) {
            // Check if user has access to the forum and create message in a transaction-like manner
            const forum = await storage.getForumById(message.forumId);
            if (!forum) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Forum not found'
              }));
              return;
            }

            // Check access for private forums
            if (!forum.isPublic) {
              const isMember = await storage.isForumMember(forum.id, client.userId!);
              if (!isMember) {
                ws.send(JSON.stringify({
                  type: 'error',
                  message: 'Access denied'
                }));
                return;
              }
            }

            try {
              // Save message to database with authenticated user
              const savedMessage = await storage.createMessage(
                { forumId: message.forumId, content: message.content },
                client.userId!
              );

              // Broadcast to all clients in the same forum
              clients.forEach((c) => {
                if (c.forumId === message.forumId && c.ws.readyState === WebSocket.OPEN) {
                  c.ws.send(JSON.stringify({
                    type: 'message',
                    forumId: message.forumId,
                    message: savedMessage,
                  }));
                }
              });
            } catch (error: any) {
              console.error('Failed to create message:', error);

              // Permission or policy errors
              if (error?.status === 403) {
                ws.send(JSON.stringify({ type: 'error', message: error.message || 'Forbidden' }));
                return;
              }

              // Check if it's a foreign key constraint error
              if (error?.code === '23503' && error?.constraint === 'messages_forum_id_forums_id_fk') {
                ws.send(JSON.stringify({ type: 'error', message: 'Forum no longer exists' }));
                return;
              }

              // For other errors, send a generic error
              ws.send(JSON.stringify({ type: 'error', message: 'Failed to send message' }));
            }
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      });

      ws.on('close', () => {
        const wasPingService = req.headers['user-agent']?.includes('Forum-Ping-Service');
        console.log(`🔌 WebSocket client disconnected:`, {
          userId: client.userId || 'unauthenticated',
          wasPingService: wasPingService,
          timestamp: new Date().toISOString()
        });

        if (wasPingService) {
          console.log('🚀 Ping service disconnected - server stays awake for next ping!');
        }

        clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clients.delete(ws);
      });
    });
  } else {
    console.log('WebSocket server disabled for Vercel runtime. Client polling fallback should be used.');
  }

  return httpServer;
}
