import type { Express } from "express";
import { streamingUpload, processStreamingUpload, tempFileManager, UploadProgressTracker } from "./streaming-upload";
// import { UploadLoadBalancer } from "./cluster-manager"; // Removed clustering for now
import { WebSocket } from "ws";
import crypto from "crypto";

// Initialize cluster and progress tracking
const progressTracker = new UploadProgressTracker();

export function registerStreamingUploadRoutes(
  app: Express, 
  requireAuth: any, 
  clients: Map<WebSocket, any>,
  storage: any,
  dropboxManager: any
) {

  // 🚀 New Memory-Efficient Streaming Upload Endpoint
  app.post("/api/files/upload-streaming", requireAuth, streamingUpload.single("file"), async (req, res, next) => {
    const uploadId = crypto.randomUUID();
    let filePath = '';
    
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { forumId, checksum } = req.body;
      if (!forumId) {
        return res.status(400).json({ error: "Forum ID required" });
      }

      // Check forum access
      const forum = await storage.getForumById(forumId);
      if (!forum) {
        return res.status(404).json({ error: "Forum not found" });
      }

      if (!forum.isPublic) {
        const isMember = await storage.isForumMember(forum.id, req.user!.id);
        if (!isMember) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      filePath = req.file.path;
      const fileName = req.file.originalname;
      const fileSize = req.file.size;

      console.log(`🚀 Starting streaming upload for ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB) - Upload ID: ${uploadId}`);
      console.log(`📊 Memory before upload: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);

      // Add temp file to cleanup manager
      tempFileManager.addTempFile(filePath);

      // Track upload progress
      progressTracker.setProgress(uploadId, {
        progress: 0,
        status: 'processing',
        startTime: new Date(),
        totalBytes: fileSize,
        bytesUploaded: 0
      });

      // If clustering is enabled, distribute the upload
      // if (loadBalancer && serverUrls.length > 1) {
      //   console.log(`🔄 Distributing upload to cluster (${serverUrls.length} servers)`);
      //   
      //   const result = await loadBalancer.distributeUpload({
      //     file: req.file as any,
      //     forumId,
      //     checksum,
      //     authToken: req.headers.authorization || '',
      //     userId: req.user!.id
      //   });
      //   
      //   return res.json({
      //     success: true,
      //     uploadId: result.uploadId,
      //     server: result.server,
      //     message: "Upload distributed to cluster",
      //     clustered: true
      //   });
      // }

      // Process file using streaming approach - MEMORY EFFICIENT!
      const result = await processStreamingUpload(
        filePath,
        fileName,
        forumId,
        req.user!.id,
        dropboxManager,
        storage,
        (progress) => {
          console.log(`[Server] Upload progress for ${fileName}: ${progress}% (${Math.round((progress / 100) * fileSize)}/${fileSize} bytes)`);
          // Update progress tracking
          progressTracker.setProgress(uploadId, {
            progress,
            bytesUploaded: Math.round((progress / 100) * fileSize)
          });

          // Broadcast progress to WebSocket clients
          clients.forEach((client) => {
            if (client.ws.readyState === WebSocket.OPEN && client.forumId === forumId) {
              console.log(`[Server] Broadcasting upload_progress to client in forum ${forumId}: ${progress}%`);
              client.ws.send(JSON.stringify({
                type: 'upload_progress',
                data: {
                  uploadId,
                  progress,
                  status: 'processing',
                  fileName,
                  bytesUploaded: Math.round((progress / 100) * fileSize),
                  totalBytes: fileSize
                }
              }));
            }
          });
        }
      );

      // Mark upload as completed
      progressTracker.setProgress(uploadId, {
        progress: 100,
        status: 'completed',
        bytesUploaded: result.totalSize
      });

      // Broadcast final progress update to WebSocket clients
      clients.forEach((client) => {
        if (client.ws.readyState === WebSocket.OPEN && client.forumId === forumId) {
          client.ws.send(JSON.stringify({
            type: 'upload_progress',
            data: {
              uploadId,
              progress: 100,
              status: 'completed',
              fileName,
              bytesUploaded: result.totalSize,
              totalBytes: result.totalSize
            }
          }));
        }
      });

      // Broadcast file upload completion to all clients in the forum
      // Include uploader details so clients immediately show correct name
      const uploader = await storage.getUser(req.user!.id);
      clients.forEach((client) => {
        if (client.ws.readyState === WebSocket.OPEN && client.forumId === forumId) {
          client.ws.send(JSON.stringify({
            type: 'file_uploaded',
            data: {
              id: result.fileId,
              filename: fileName,
              originalName: fileName,
              size: result.totalSize,
              uploadedBy: req.user!.id,
              uploadedByName: uploader?.displayName || uploader?.username || null,
              uploader,
              forumId: forumId,
              checksum: result.checksum
            }
          }));
        }
      });

      console.log(`✅ Streaming upload completed for ${fileName} in ${result.uploadTime}ms`);
      console.log(`📊 Memory after upload: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);

      res.json({
        success: true,
        fileId: result.fileId,
        uploadId,
        message: "File uploaded successfully using streaming",
        uploadTime: result.uploadTime,
        totalSize: result.totalSize,
        chunkCount: result.chunkCount,
        checksum: result.checksum,
        memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB"
      });

    } catch (error: any) {
      console.error("Streaming upload error:", error);
      
      // Mark upload as failed
      progressTracker.setProgress(uploadId, {
        status: 'error',
        error: error?.message || error
      });

      // Broadcast error to WebSocket clients
      clients.forEach((client) => {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({
            type: 'upload_error',
            data: {
              uploadId,
              error: error?.message || 'Upload failed'
            }
          }));
        }
      });

      res.status(500).json({
        error: "Upload failed",
        message: error?.message || error,
        uploadId
      });
    } finally {
      // Cleanup temp file
      if (filePath) {
        await tempFileManager.cleanupFile(filePath);
      }
      
      // Remove progress after some time
      setTimeout(() => {
        progressTracker.removeProgress(uploadId);
      }, 300000); // 5 minutes
    }
  });

  // 📊 Upload Progress Endpoint
  app.get("/api/files/upload-progress/:uploadId", requireAuth, async (req, res) => {
    const { uploadId } = req.params;
    
    const progress = progressTracker.getProgress(uploadId);
    if (!progress) {
      return res.status(404).json({ error: "Upload not found" });
    }

    res.json(progress);
  });

  // 🖥️ Cluster Status Endpoint
  app.get("/api/cluster/status", requireAuth, async (req, res) => {
    res.json({
      clustered: false,
      message: "Single server mode - clustering disabled"
    });
  });

  // 🧹 Manual Cleanup Endpoint (for admin)
  app.post("/api/admin/cleanup", requireAuth, async (req, res) => {
    try {
      await tempFileManager.cleanupAll();
      progressTracker.cleanup();
      
      // if (loadBalancer) {
      //   loadBalancer.cleanup();
      // }

      res.json({
        success: true,
        message: "Cleanup completed",
        memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB"
      });
    } catch (error: any) {
      res.status(500).json({
        error: "Cleanup failed",
        message: error?.message || error
      });
    }
  });

  // 📈 System Health Endpoint (Enhanced)
  app.get("/api/system/health", async (req, res) => {
    const memoryUsage = process.memoryUsage();
    
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: Math.round(memoryUsage.heapUsed / 1024 / 1024) + "MB",
        total: Math.round(memoryUsage.heapTotal / 1024 / 1024) + "MB",
        percentage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100) + "%"
      },
      cluster: { clustered: false, message: "Clustering disabled" },
      activeUploads: Array.from(progressTracker.getAllProgress().values()).filter(p => p.status === 'processing').length
    });
  });

  console.log("🚀 Streaming upload routes registered successfully!");
  console.log(`📊 Cluster mode: DISABLED`);
  console.log(`📊 Server mode: Single server`);
}