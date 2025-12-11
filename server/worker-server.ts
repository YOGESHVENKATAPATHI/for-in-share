import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import multer from 'multer';
import { setupAuth } from './auth';
import { storage } from './storage';
import { dropboxManager } from './dropbox-manager';
import { memoryOptimizer, StreamingFileProcessor, connectionPool } from './memory-optimizer';
import { portManager } from './port-manager';
import crypto from 'crypto';
import path from 'path';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { path as ffmpegPath } from '@ffmpeg-installer/ffmpeg';
import { path as ffprobePath } from '@ffprobe-installer/ffprobe';

// Configure ffmpeg paths
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);
import sharp from 'sharp';

export type WorkerType = 'upload' | 'chat' | 'general';

export interface WorkerConfig {
  type: WorkerType;
  port?: number;
  maxConnections: number;
  maxMemoryMB: number;
  capabilities: string[];
}

export class WorkerServer {
  private app: express.Application;
  private server: any;
  private wss: WebSocketServer | null = null;
  private config: WorkerConfig;
  private isShuttingDown = false;
  private activeRequests = 0;
  private streamProcessor: StreamingFileProcessor;

  constructor(config: WorkerConfig) {
    this.config = config;
    this.app = express();
    this.streamProcessor = new StreamingFileProcessor();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware(): void {
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: false }));

    // Request tracking middleware
    this.app.use((req, res, next) => {
      this.activeRequests++;
      const connectionId = crypto.randomUUID();
      
      memoryOptimizer.trackConnection(connectionId, 'http', (req as any).user?.id);
      
      res.on('finish', () => {
        this.activeRequests--;
        memoryOptimizer.removeConnection(connectionId);
      });
      
      next();
    });

    // Health monitoring middleware
    this.app.use((req, res, next) => {
      if (this.isShuttingDown) {
        return res.status(503).json({ error: 'Server is shutting down' });
      }
      
      const memStats = memoryOptimizer.getMemoryStats();
      if (memStats.usageMB.rss > this.config.maxMemoryMB * 0.95) {
        return res.status(507).json({ error: 'Server memory limit exceeded' });
      }
      
      next();
    });
  }

  private setupRoutes(): void {
    // Setup authentication (shared session store)
    const sessionSettings = setupAuth(this.app as any);

    const requireAuth = (req: any, res: any, next: any) => {
      if (!req.isAuthenticated()) {
        return res.sendStatus(401);
      }
      next();
    };

    const optionalAuth = (req: any, res: any, next: any) => {
      next();
    };

    // Health check endpoint
    this.app.get('/api/health', (req, res) => {
      const memStats = memoryOptimizer.getMemoryStats();
      const connStats = connectionPool.getConnectionCount();
      
      res.json({
        status: 'healthy',
        type: this.config.type,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: memStats.usage,
        memoryMB: memStats.usageMB,
        connections: connStats,
        activeRequests: this.activeRequests,
        capabilities: this.config.capabilities,
        limits: {
          maxConnections: this.config.maxConnections,
          maxMemoryMB: this.config.maxMemoryMB,
        }
      });
    });

    // Worker-specific routes
    if (this.config.type === 'upload' || this.config.type === 'general') {
      this.setupUploadRoutes(requireAuth);
    }

    if (this.config.type === 'chat' || this.config.type === 'general') {
      this.setupChatRoutes(requireAuth);
    }

    if (this.config.type === 'general') {
      this.setupGeneralRoutes(requireAuth, optionalAuth);
    }
  }

  private setupUploadRoutes(requireAuth: any): void {
    // Use streaming multer for memory efficiency
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max file size
        files: 1
      }
    });

    this.app.post('/api/files/upload', requireAuth, upload.single('file'), async (req, res, next) => {
      const connectionId = crypto.randomUUID();
      
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }

        const { forumId, checksum, resumeUploadId } = req.body;
        if (!forumId) {
          return res.status(400).json({ error: 'Forum ID required' });
        }

        // Track upload connection
        memoryOptimizer.trackConnection(connectionId, 'upload', req.user!.id);

        // Check forum access
        const forum = await storage.getForumById(forumId);
        if (!forum) {
          return res.status(404).json({ error: 'Forum not found' });
        }

        if (!forum.isPublic) {
          const isMember = await storage.isForumMember(forum.id, req.user!.id);
          if (!isMember) {
            return res.status(403).json({ error: 'Access denied' });
          }
        }

        // Check file size limit (10MB maximum)
        const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
        if (req.file.size > MAX_FILE_SIZE) {
          return res.status(400).json({
            error: "File too large",
            message: `File size (${(req.file.size / (1024 * 1024)).toFixed(2)}MB) exceeds the maximum limit of 10MB`,
            maxSize: MAX_FILE_SIZE,
            actualSize: req.file.size
          });
        }

        // Process file with streaming to reduce memory usage
        const result = await this.processFileUpload(req.file, {
          forumId,
          userId: req.user!.id,
          checksum,
          resumeUploadId
        });

        res.status(201).json(result);

      } catch (error) {
        console.error('Upload error in worker:', error);
        next(error);
      } finally {
        memoryOptimizer.removeConnection(connectionId);
      }
    });

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

    // File download endpoint
    this.app.get('/api/files/:id/download', requireAuth, async (req, res, next) => {
      try {
        const file = await storage.getFileById(req.params.id);
        if (!file) {
          return res.status(404).json({ error: 'File not found' });
        }

        // Check forum access
        const forum = await storage.getForumById(file.forumId);
        if (!forum) {
          return res.status(404).json({ error: 'Forum not found' });
        }

        if (!forum.isPublic) {
          const isMember = await storage.isForumMember(forum.id, req.user!.id);
          if (!isMember) {
            return res.status(403).json({ error: 'Access denied' });
          }
        }

        // Stream file download
        await this.streamFileDownload(file, res);

      } catch (error) {
        console.error('Download error in worker:', error);
        next(error);
      }
    });
  }

  private async processFileUpload(file: Express.Multer.File, options: {
    forumId: string;
    userId: string;
    checksum?: string;
    resumeUploadId?: string;
  }): Promise<any> {
    const { forumId, userId, checksum, resumeUploadId } = options;
    
    // Calculate file checksum
    const actualChecksum = checksum || crypto.createHash('sha256').update(file.buffer).digest('hex');

    // Check for existing partial upload
    let partialUpload = await storage.getPartialUploadByChecksum(actualChecksum, userId);
    
    if (!partialUpload) {
      const chunkSize = dropboxManager.getChunkSize();
      const totalChunks = Math.ceil(file.size / chunkSize);
      
      partialUpload = await storage.createPartialUpload(
        forumId,
        userId,
        file.originalname,
        file.size,
        file.mimetype,
        actualChecksum,
        totalChunks
      );
    }

    // Generate thumbnail for images and videos
    let thumbnail: string | undefined;
    if (file.mimetype.startsWith('image/')) {
      try {
        const thumbnailBuffer = await sharp(file.buffer)
          .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
        thumbnail = `data:${file.mimetype};base64,${thumbnailBuffer.toString('base64')}`;
        console.log(`✅ Generated thumbnail for ${file.originalname}`);
      } catch (error) {
        console.warn(`Failed to generate thumbnail for ${file.originalname}:`, error);
      }
    } else if (file.mimetype.startsWith('video/')) {
      try {
        // Write video buffer to temp file for ffmpeg processing
        const fs = await import('fs/promises');
        const os = await import('os');
        const path = await import('path');
        const crypto = await import('crypto');
        
        const tempVideoPath = path.join(os.tmpdir(), `temp_video_${crypto.randomUUID()}${path.extname(file.originalname)}`);
        await fs.writeFile(tempVideoPath, file.buffer);
        
        // Generate video thumbnail
        const thumbnailBuffer = await generateVideoThumbnail(tempVideoPath);
        if (thumbnailBuffer) {
          thumbnail = `data:image/jpeg;base64,${thumbnailBuffer.toString('base64')}`;
          console.log(`✅ Generated video thumbnail for ${file.originalname}`);
        }
        
        // Clean up temp file
        await fs.unlink(tempVideoPath);
      } catch (error) {
        console.warn(`Failed to generate video thumbnail for ${file.originalname}:`, error);
      }
    }

    // Create file record
    const createdFile = await storage.createFile(forumId, userId, file.originalname, file.size, file.mimetype, thumbnail);
    // Convert to FileWithChunks format
    const existingFile = {
      ...createdFile,
      chunks: [],
      user: { id: userId } as any
    };

    // Process chunks with streaming
    const chunkSize = dropboxManager.getChunkSize();
    const totalChunks = Math.ceil(file.size / chunkSize);
    const uploadedChunks: number[] = (partialUpload.uploadedChunks as number[]) || [];

    for (let i = 0; i < totalChunks; i++) {
      if (uploadedChunks.includes(i)) continue;

      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunkData = file.buffer.slice(start, end);

      // Upload chunk to Dropbox
      const reservationResult = await dropboxManager.reserveStorage(chunkData.length);
      if (!reservationResult.success) {
        throw new Error(`Failed to reserve storage: ${reservationResult.message}`);
      }

      const { accountId, reservationId } = reservationResult;
      const dropboxPath = `/forums/${forumId}/${existingFile!.id}/chunk_${i}`;

      const { dropboxFileId, dropboxPath: actualPath, checksum: chunkChecksum } = 
        await dropboxManager.uploadChunkWithRetry(accountId!, chunkData, dropboxPath, reservationId!);

      // Save chunk metadata
      await storage.createFileChunk(
        existingFile!.id,
        i,
        chunkData.length,
        chunkChecksum,
        accountId!,
        actualPath,
        dropboxFileId
      );

      // Confirm reservation
      await dropboxManager.confirmReservation(reservationId!, chunkData.length);
      
      uploadedChunks.push(i);
      await storage.updatePartialUploadChunks(partialUpload.id, uploadedChunks);

      // Trigger garbage collection periodically during upload
      if (i % 10 === 0 && global.gc) {
        global.gc();
      }
    }

    // Clean up partial upload on completion
    await storage.deletePartialUpload(partialUpload.id);

    return {
      success: true,
      fileId: existingFile!.id,
      fileName: existingFile!.fileName,
      fileSize: existingFile!.fileSize,
      totalChunks
    };
  }

  private async streamFileDownload(file: any, res: express.Response): Promise<void> {
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', file.fileSize);

    // Stream chunks in order
    const sortedChunks = file.chunks.sort((a: any, b: any) => a.chunkIndex - b.chunkIndex);
    
    for (const chunk of sortedChunks) {
      try {
        const chunkBuffer = await dropboxManager.downloadChunk(chunk.dropboxAccountId, chunk.dropboxPath);
        res.write(chunkBuffer);
      } catch (error) {
        console.error(`Error downloading chunk ${chunk.chunkIndex}:`, error);
        throw error;
      }
    }

    res.end();
  }

  private setupChatRoutes(requireAuth: any): void {
    // Real-time messaging endpoints would go here
    // For now, just basic endpoints

    this.app.get('/api/messages/:forumId', requireAuth, async (req, res, next) => {
      try {
        const messages = await storage.getMessages(req.params.forumId);
        res.json(messages);
      } catch (error) {
        next(error);
      }
    });

    this.app.post('/api/messages', requireAuth, async (req, res, next) => {
      try {
        const message = await storage.createMessage(req.body, req.user!.id);
        res.status(201).json(message);
      } catch (error) {
        next(error);
      }
    });
  }

  private setupGeneralRoutes(requireAuth: any, optionalAuth: any): void {
    // General API routes
    this.app.get('/api/forums', optionalAuth, async (req: any, res, next) => {
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

    this.app.get('/api/forums/:id', requireAuth, async (req, res, next) => {
      try {
        const forum = await storage.getForumById(req.params.id);
        if (!forum) {
          return res.status(404).json({ error: 'Forum not found' });
        }
        res.json(forum);
      } catch (error) {
        next(error);
      }
    });
  }

  private setupWebSocket(): void {
    if (this.config.type === 'chat' || this.config.type === 'general') {
      // WebSocket will be initialized when server starts
    }
  }

  public async start(): Promise<void> {
    // Get port assignment
    const portType = `worker-${this.config.type}` as any;
    const port = this.config.port || await portManager.assignPort(portType);

    // Create server
    this.server = createServer(this.app);

    // Setup WebSocket if needed
    if (this.config.type === 'chat' || this.config.type === 'general') {
      this.wss = new WebSocketServer({ server: this.server });
      this.setupWebSocketHandlers();
    }

    // Error handling
    this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('Worker error:', err);
      const status = err.status || err.statusCode || 500;
      const message = err.message || 'Internal Server Error';
      res.status(status).json({ error: message });
    });

    // Start listening
    return new Promise((resolve) => {
      this.server.listen(port, '0.0.0.0', () => {
        console.log(`🚀 ${this.config.type.toUpperCase()} worker server started on port ${port}`);
        console.log(`📊 Limits: ${this.config.maxConnections} connections, ${this.config.maxMemoryMB}MB memory`);
        console.log(`⚡ Capabilities: ${this.config.capabilities.join(', ')}`);
        resolve();
      });
    });
  }

  private setupWebSocketHandlers(): void {
    if (!this.wss) return;

    this.wss.on('connection', (ws, req) => {
      const connectionId = crypto.randomUUID();
      
      // Check connection limits
      if (!connectionPool.addConnection(connectionId, { ws })) {
        ws.close(1008, 'Connection limit exceeded');
        return;
      }

      // Track connection for memory monitoring
      memoryOptimizer.trackConnection(connectionId, 'websocket');

      ws.on('message', (data) => {
        try {
          connectionPool.updateActivity(connectionId);
          memoryOptimizer.updateConnectionActivity(connectionId);
          
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(connectionId, ws, message);
        } catch (error) {
          console.error('WebSocket message error:', error);
          ws.close(1002, 'Invalid message format');
        }
      });

      ws.on('close', () => {
        connectionPool.removeConnection(connectionId);
        memoryOptimizer.removeConnection(connectionId);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        connectionPool.removeConnection(connectionId);
        memoryOptimizer.removeConnection(connectionId);
      });
    });
  }

  private handleWebSocketMessage(connectionId: string, ws: any, message: any): void {
    // Handle different message types
    switch (message.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;
      case 'join_forum':
        // Handle forum join logic
        break;
      case 'chat_message':
        // Handle chat message broadcasting
        break;
      default:
        ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
    }
  }

  public async shutdown(): Promise<void> {
    console.log(`🔌 Shutting down ${this.config.type} worker server...`);
    
    this.isShuttingDown = true;

    // Wait for active requests to complete (with timeout)
    const timeout = 10000; // 10 seconds
    const startTime = Date.now();
    
    while (this.activeRequests > 0 && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
    }

    // Close HTTP server
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log(`✅ ${this.config.type} worker server shutdown complete`);
          resolve();
        });
      });
    }
  }

  public getStats(): any {
    const memStats = memoryOptimizer.getMemoryStats();
    const connCount = connectionPool.getConnectionCount();
    
    return {
      type: this.config.type,
      port: this.config.port,
      status: this.isShuttingDown ? 'shutting-down' : 'running',
      activeRequests: this.activeRequests,
      connections: connCount,
      memory: memStats.usageMB,
      uptime: process.uptime(),
      capabilities: this.config.capabilities,
    };
  }
}

// Factory function to create different types of workers
export function createWorkerServer(type: WorkerType, customConfig: Partial<WorkerConfig> = {}): WorkerServer {
  const baseConfigs: Record<WorkerType, WorkerConfig> = {
    upload: {
      type: 'upload',
      maxConnections: 100,
      maxMemoryMB: 400,
      capabilities: ['file-upload', 'stream-processing'],
    },
    chat: {
      type: 'chat',
      maxConnections: 2000,
      maxMemoryMB: 300,
      capabilities: ['websocket', 'real-time', 'messaging'],
    },
    general: {
      type: 'general',
      maxConnections: 1000,
      maxMemoryMB: 450,
      capabilities: ['api', 'websocket', 'file-upload', 'messaging'],
    },
  };

  const config = { ...baseConfigs[type], ...customConfig };
  return new WorkerServer(config);
}