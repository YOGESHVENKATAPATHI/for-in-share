import type { Express } from "express";
import { storage } from "./storage";

// Store active sessions and their metadata
interface ActiveSession {
  sessionId: string;
  userId?: string;
  lastHeartbeat: Date;
  createdAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

class SessionManager {
  private activeSessions = new Map<string, ActiveSession>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes timeout

  constructor() {
    this.startCleanupTimer();
  }

  private startCleanupTimer() {
    // Clean up stale sessions every 2 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleSessions();
    }, 2 * 60 * 1000);
    
    // Log session statistics every 15 minutes
    setInterval(() => {
      this.logSessionStatistics();
    }, 15 * 60 * 1000);
    
    console.log('[SessionManager] Cleanup timers started');
  }

  private logSessionStatistics() {
    const now = Date.now();
    const totalSessions = this.activeSessions.size;
    const staleSessions = Array.from(this.activeSessions.values())
      .filter(session => now - session.lastHeartbeat.getTime() > this.SESSION_TIMEOUT).length;
    
    console.log(`[SessionManager] Session Stats - Total: ${totalSessions}, Stale: ${staleSessions}, Active: ${totalSessions - staleSessions}`);
    
    // Log memory usage
    const memUsage = process.memoryUsage();
    console.log(`[SessionManager] Memory Usage - Heap: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB, RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB`);
  }

  // Public method to get session statistics
  getSessionStatistics() {
    const now = Date.now();
    const sessions = Array.from(this.activeSessions.values());
    
    return {
      totalSessions: sessions.length,
      activeSessions: sessions.filter(s => now - s.lastHeartbeat.getTime() <= this.SESSION_TIMEOUT).length,
      staleSessions: sessions.filter(s => now - s.lastHeartbeat.getTime() > this.SESSION_TIMEOUT).length,
      sessionsWithUsers: sessions.filter(s => s.userId).length,
      oldestSession: sessions.length > 0 ? 
        Math.max(...sessions.map(s => now - s.createdAt.getTime())) : 0
    };
  }

  private cleanupStaleSessions() {
    const now = new Date();
    const staleSessionIds: string[] = [];

    this.activeSessions.forEach((session, sessionId) => {
      const timeSinceLastHeartbeat = now.getTime() - session.lastHeartbeat.getTime();
      
      if (timeSinceLastHeartbeat > this.SESSION_TIMEOUT) {
        staleSessionIds.push(sessionId);
      }
    });

    if (staleSessionIds.length > 0) {
      console.log(`[SessionManager] Cleaning up ${staleSessionIds.length} stale sessions`);
      
      for (const sessionId of staleSessionIds) {
        this.cleanupSession(sessionId, 'timeout');
      }
    }
  }

  initializeSession(sessionId: string, userId?: string, userAgent?: string, ipAddress?: string) {
    const session: ActiveSession = {
      sessionId,
      userId,
      lastHeartbeat: new Date(),
      createdAt: new Date(),
      userAgent,
      ipAddress
    };

    this.activeSessions.set(sessionId, session);
    console.log(`[SessionManager] Session initialized: ${sessionId} (user: ${userId || 'anonymous'})`);

    return session;
  }

  updateHeartbeat(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.lastHeartbeat = new Date();
      return true;
    }
    return false;
  }

  async cleanupSession(sessionId: string, reason: string) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      console.log(`[SessionManager] Session not found for cleanup: ${sessionId}`);
      return;
    }

    console.log(`[SessionManager] Cleaning up session ${sessionId} - reason: ${reason}`);

    try {
      // Perform storage cleanup operations
      await this.performStorageCleanup(session);

      // Remove from active sessions
      this.activeSessions.delete(sessionId);

      console.log(`[SessionManager] Session cleanup completed: ${sessionId}`);
    } catch (error) {
      console.error(`[SessionManager] Error during session cleanup: ${sessionId}`, error);
    }
  }

  private async performStorageCleanup(session: ActiveSession) {
    try {
      // Clean up temporary files and uploads for this user/session
      if (session.userId) {
        console.log(`[SessionManager] Cleaning up storage for user: ${session.userId}`);
        
        // 1. Clean up partial uploads
        const partialUploads = await storage.getPartialUploadsByUser(session.userId);
        let cleanedPartialUploads = 0;
        
        for (const upload of partialUploads) {
          // Clean up partial uploads older than 2 hours or with 0 progress
          const uploadAge = Date.now() - upload.createdAt.getTime();
          const hasNoProgress = !upload.uploadedChunks || upload.uploadedChunks.length === 0;
          
          if (uploadAge > 2 * 60 * 60 * 1000 || hasNoProgress) {
            try {
              await storage.deletePartialUpload(upload.id);
              cleanedPartialUploads++;
              console.log(`[SessionManager] Deleted partial upload: ${upload.id} (age: ${Math.round(uploadAge / 60000)}min)`);
            } catch (error) {
              console.error(`[SessionManager] Error deleting partial upload ${upload.id}:`, error);
            }
          }
        }
        
        if (cleanedPartialUploads > 0) {
          console.log(`[SessionManager] Cleaned up ${cleanedPartialUploads} partial uploads for user ${session.userId}`);
        }
      }

      // 2. Clean up session-specific temporary data
      await this.cleanupTemporaryFiles(session);
      
      // 3. Clean up expired access requests
      await this.cleanupExpiredAccessRequests();
      
      // 4. Trigger memory cleanup if available
      this.triggerMemoryCleanup();
      
    } catch (error) {
      console.error('[SessionManager] Error during storage cleanup:', error);
    }
  }

  private async cleanupTemporaryFiles(session: ActiveSession) {
    try {
      // Import fs module dynamically to handle temp files
      const fs = await import('fs').then(m => m.promises);
      const path = await import('path');
      
      // Clean up temporary files in uploads directory
      const tempDirs = [
        './uploads/temp',
        './storage/temp',
        './temp'
      ];

      for (const tempDir of tempDirs) {
        try {
          const dirExists = await fs.access(tempDir).then(() => true).catch(() => false);
          if (!dirExists) continue;

          const files = await fs.readdir(tempDir);
          let cleanedFiles = 0;

          for (const file of files) {
            try {
              const filePath = path.join(tempDir, file);
              const stats = await fs.stat(filePath);
              const fileAge = Date.now() - stats.mtime.getTime();

              // Clean up files older than 1 hour
              if (fileAge > 60 * 60 * 1000) {
                await fs.unlink(filePath);
                cleanedFiles++;
              }
            } catch (error) {
              console.warn(`[SessionManager] Error processing temp file ${file}:`, error);
            }
          }

          if (cleanedFiles > 0) {
            console.log(`[SessionManager] Cleaned up ${cleanedFiles} temporary files from ${tempDir}`);
          }
        } catch (error) {
          console.warn(`[SessionManager] Error cleaning temp directory ${tempDir}:`, error);
        }
      }
    } catch (error) {
      console.error('[SessionManager] Error during temporary file cleanup:', error);
    }
  }

  private async cleanupExpiredAccessRequests() {
    try {
      // Clean up access requests older than 24 hours
      // This would require adding a method to storage interface
      console.log('[SessionManager] Access request cleanup would happen here');
      // TODO: Implement access request cleanup if needed
    } catch (error) {
      console.error('[SessionManager] Error during access request cleanup:', error);
    }
  }

  private triggerMemoryCleanup() {
    try {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        console.log('[SessionManager] Triggered garbage collection');
      }

      // Log memory usage after cleanup
      const memUsage = process.memoryUsage();
      console.log(`[SessionManager] Memory usage after cleanup: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
    } catch (error) {
      console.warn('[SessionManager] Error during memory cleanup:', error);
    }
  }

  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  getSessionInfo(sessionId: string): ActiveSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  getAllSessions(): Map<string, ActiveSession> {
    return new Map(this.activeSessions);
  }

  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Cleanup all active sessions
    console.log(`[SessionManager] Shutting down, cleaning up ${this.activeSessions.size} active sessions`);
    const cleanupPromises = Array.from(this.activeSessions.keys()).map(sessionId => 
      this.cleanupSession(sessionId, 'server_shutdown')
    );
    
    return Promise.allSettled(cleanupPromises);
  }
}

const sessionManager = new SessionManager();

export function setupSessionRoutes(app: Express) {
  // Initialize a new tab session
  app.post('/api/session/initialize', (req, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      const userId = (req as any).session?.user?.id;
      const userAgent = req.get('User-Agent');
      const ipAddress = req.ip || req.connection.remoteAddress;

      const session = sessionManager.initializeSession(sessionId, userId, userAgent, ipAddress);
      
      res.json({ 
        success: true, 
        sessionId: session.sessionId,
        message: 'Session initialized successfully'
      });
    } catch (error) {
      console.error('[SessionRoutes] Error initializing session:', error);
      res.status(500).json({ error: 'Failed to initialize session' });
    }
  });

  // Update session heartbeat
  app.post('/api/session/heartbeat', (req, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      const updated = sessionManager.updateHeartbeat(sessionId);
      
      if (updated) {
        res.json({ success: true, message: 'Heartbeat updated' });
      } else {
        res.status(404).json({ error: 'Session not found' });
      }
    } catch (error) {
      console.error('[SessionRoutes] Error updating heartbeat:', error);
      res.status(500).json({ error: 'Failed to update heartbeat' });
    }
  });

  // Clean up session on tab close
  app.post('/api/session/cleanup', async (req, res) => {
    try {
      const { sessionId, reason } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
      }

      await sessionManager.cleanupSession(sessionId, reason || 'client_request');
      
      res.json({ success: true, message: 'Session cleaned up successfully' });
    } catch (error) {
      console.error('[SessionRoutes] Error cleaning up session:', error);
      res.status(500).json({ error: 'Failed to cleanup session' });
    }
  });

  // Get session statistics (for admin/monitoring)
  app.get('/api/session/stats', (req, res) => {
    try {
      const sessions = sessionManager.getAllSessions();
      const stats = {
        totalActiveSessions: sessions.size,
        sessions: Array.from(sessions.values()).map(session => ({
          sessionId: session.sessionId,
          userId: session.userId,
          lastHeartbeat: session.lastHeartbeat,
          createdAt: session.createdAt,
          userAgent: session.userAgent,
          ipAddress: session.ipAddress
        }))
      };

      res.json(stats);
    } catch (error) {
      console.error('[SessionRoutes] Error getting session stats:', error);
      res.status(500).json({ error: 'Failed to get session stats' });
    }
  });
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SessionManager] Received SIGTERM, cleaning up sessions...');
  sessionManager.shutdown().then(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[SessionManager] Received SIGINT, cleaning up sessions...');
  sessionManager.shutdown().then(() => {
    process.exit(0);
  });
});

export { sessionManager };