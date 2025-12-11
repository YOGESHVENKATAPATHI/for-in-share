import { Readable, Transform } from 'stream';
import { EventEmitter } from 'events';
import crypto from 'crypto';

interface MemoryMonitoringConfig {
  maxMemoryMB: number;
  warningThresholdMB: number;
  checkInterval: number;
  gcThreshold: number;
}

interface ConnectionInfo {
  id: string;
  userId?: string;
  type: 'http' | 'websocket' | 'upload';
  memoryUsage: number;
  startTime: Date;
  lastActivity: Date;
}

export class MemoryOptimizer extends EventEmitter {
  private connections: Map<string, ConnectionInfo> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private gcInterval: NodeJS.Timeout | null = null;
  private readonly config: MemoryMonitoringConfig;
  private memoryStats: { timestamp: Date; usage: NodeJS.MemoryUsage }[] = [];
  private readonly MAX_MEMORY_STATS = 100;

  constructor(config: Partial<MemoryMonitoringConfig> = {}) {
    super();
    
    this.config = {
      maxMemoryMB: 450, // Render free tier limit
      warningThresholdMB: 350, // 80% of max
      checkInterval: 10000, // 10 seconds
      gcThreshold: 0.8, // Trigger GC at 80% memory usage
      ...config
    };

    this.startMemoryMonitoring();
    this.setupGarbageCollection();
    this.setupProcessHandlers();
  }

  private startMemoryMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, this.config.checkInterval);

    console.log('🔍 Memory monitoring started');
  }

  private setupGarbageCollection(): void {
    // Force garbage collection periodically
    this.gcInterval = setInterval(() => {
      const memUsage = process.memoryUsage();
      const memUsageMB = memUsage.rss / 1024 / 1024;
      
      if (memUsageMB > this.config.maxMemoryMB * this.config.gcThreshold) {
        if (global.gc) {
          console.log(`🗑️  Forcing garbage collection (${memUsageMB.toFixed(1)}MB used)`);
          global.gc();
        }
      }
    }, 30000); // Every 30 seconds
  }

  private setupProcessHandlers(): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('💥 Uncaught Exception:', error);
      this.emit('criticalError', error);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      this.emit('criticalError', reason);
    });

    // Handle memory warnings
    process.on('warning', (warning) => {
      if (warning.name === 'MaxListenersExceededWarning') {
        console.warn('⚠️  Memory Warning:', warning.message);
        this.emit('memoryWarning', warning);
      }
    });
  }

  private checkMemoryUsage(): void {
    const memUsage = process.memoryUsage();
    const memUsageMB = memUsage.rss / 1024 / 1024;
    
    // Store memory stats
    this.memoryStats.push({ timestamp: new Date(), usage: memUsage });
    if (this.memoryStats.length > this.MAX_MEMORY_STATS) {
      this.memoryStats.shift();
    }

    // Check thresholds
    if (memUsageMB > this.config.maxMemoryMB) {
      console.error(`🚨 CRITICAL: Memory usage ${memUsageMB.toFixed(1)}MB exceeds limit ${this.config.maxMemoryMB}MB`);
      this.emit('memoryExhaustion', { usage: memUsageMB, limit: this.config.maxMemoryMB });
      this.emergencyCleanup();
    } else if (memUsageMB > this.config.warningThresholdMB) {
      console.warn(`⚠️  Memory usage ${memUsageMB.toFixed(1)}MB approaching limit ${this.config.maxMemoryMB}MB`);
      this.emit('memoryWarning', { usage: memUsageMB, threshold: this.config.warningThresholdMB });
      this.performCleanup();
    }

    // Log detailed stats every minute
    if (Date.now() % 60000 < this.config.checkInterval) {
      this.logMemoryStats();
    }
  }

  private performCleanup(): void {
    console.log('🧹 Performing memory cleanup...');
    
    // Clean up old connections
    const now = Date.now();
    const staleConnections: string[] = [];
    
    this.connections.forEach((conn, id) => {
      const idleTime = now - conn.lastActivity.getTime();
      if (idleTime > 300000) { // 5 minutes idle
        staleConnections.push(id);
      }
    });

    staleConnections.forEach(id => {
      this.removeConnection(id);
    });

    // Clear old memory stats
    if (this.memoryStats.length > 50) {
      this.memoryStats = this.memoryStats.slice(-50);
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    console.log(`✅ Cleaned up ${staleConnections.length} stale connections`);
  }

  private emergencyCleanup(): void {
    console.log('🚨 Performing emergency memory cleanup...');
    
    // Aggressive cleanup - remove all non-critical connections
    const connectionsToRemove: string[] = [];
    
    this.connections.forEach((conn, id) => {
      if (conn.type !== 'websocket') { // Keep WebSocket connections for real-time features
        connectionsToRemove.push(id);
      }
    });

    connectionsToRemove.forEach(id => {
      this.removeConnection(id);
    });

    // Clear most memory stats
    this.memoryStats = this.memoryStats.slice(-10);

    // Force multiple garbage collections
    if (global.gc) {
      for (let i = 0; i < 3; i++) {
        global.gc();
      }
    }

    // Check and reconnect database connections
    this.checkDatabaseConnections();

    console.log(`🚨 Emergency cleanup: removed ${connectionsToRemove.length} connections`);
  }

  private async checkDatabaseConnections(): Promise<void> {
    try {
      // Import dbManager dynamically to avoid circular imports
      const { dbManager } = await import('./db.js');
      
      // Check database health
      const healthCheck = await dbManager.checkHealth();
      
      if (healthCheck.healthy) {
        console.log('✅ All database connections are healthy');
      } else {
        console.warn('⚠️ Some database connections are unhealthy:', healthCheck.details);
      }
    } catch (error) {
      console.error('❌ Failed to check database connections:', error);
    }
  }

  private logMemoryStats(): void {
    const memUsage = process.memoryUsage();
    const memUsageMB = {
      rss: (memUsage.rss / 1024 / 1024).toFixed(1),
      heapUsed: (memUsage.heapUsed / 1024 / 1024).toFixed(1),
      heapTotal: (memUsage.heapTotal / 1024 / 1024).toFixed(1),
      external: (memUsage.external / 1024 / 1024).toFixed(1),
    };

    console.log('💾 Memory Stats:');
    console.log(`  RSS: ${memUsageMB.rss}MB | Heap Used: ${memUsageMB.heapUsed}MB | Heap Total: ${memUsageMB.heapTotal}MB | External: ${memUsageMB.external}MB`);
    console.log(`  Active Connections: ${this.connections.size} | Uptime: ${(process.uptime() / 60).toFixed(1)} min`);
  }

  public trackConnection(id: string, type: 'http' | 'websocket' | 'upload', userId?: string): void {
    const connection: ConnectionInfo = {
      id,
      userId,
      type,
      memoryUsage: 0,
      startTime: new Date(),
      lastActivity: new Date(),
    };

    this.connections.set(id, connection);
    
    // Update memory usage for this connection
    this.updateConnectionMemory(id);
  }

  public updateConnectionActivity(id: string): void {
    const connection = this.connections.get(id);
    if (connection) {
      connection.lastActivity = new Date();
      this.updateConnectionMemory(id);
    }
  }

  public removeConnection(id: string): void {
    this.connections.delete(id);
  }

  private updateConnectionMemory(id: string): void {
    const connection = this.connections.get(id);
    if (connection) {
      // Estimate memory usage based on connection type
      switch (connection.type) {
        case 'upload':
          connection.memoryUsage = 8; // MB - for file processing
          break;
        case 'websocket':
          connection.memoryUsage = 0.5; // MB - lightweight
          break;
        case 'http':
          connection.memoryUsage = 0.1; // MB - minimal
          break;
      }
    }
  }

  public getMemoryStats(): {
    usage: NodeJS.MemoryUsage;
    usageMB: Record<string, number>;
    connections: number;
    limit: number;
    warningThreshold: number;
  } {
    const usage = process.memoryUsage();
    const usageMB = {
      rss: Math.round(usage.rss / 1024 / 1024),
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
      external: Math.round(usage.external / 1024 / 1024),
    };

    return {
      usage,
      usageMB,
      connections: this.connections.size,
      limit: this.config.maxMemoryMB,
      warningThreshold: this.config.warningThresholdMB,
    };
  }

  public getConnectionStats(): Record<string, any> {
    const stats = {
      total: this.connections.size,
      byType: { http: 0, websocket: 0, upload: 0 },
      totalMemoryUsage: 0,
    };

    this.connections.forEach(conn => {
      stats.byType[conn.type]++;
      stats.totalMemoryUsage += conn.memoryUsage;
    });

    return stats;
  }

  public shutdown(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
    }

    this.connections.clear();
    this.memoryStats = [];
    
    console.log('🔌 Memory optimizer shutdown complete');
  }
}

// Streaming file processor to handle large files without loading them entirely into memory
export class StreamingFileProcessor extends EventEmitter {
  private readonly chunkSize: number;
  private readonly maxConcurrentChunks: number;
  private priorityChunks: Set<number> = new Set(); // Track priority chunks
  private activeRequests: Map<number, Promise<void>> = new Map(); // Track active chunk processing

  constructor(chunkSize: number = 4 * 1024 * 1024, maxConcurrentChunks: number = 3) {
    super();
    this.chunkSize = chunkSize;
    this.maxConcurrentChunks = maxConcurrentChunks;
  }

  /**
   * Mark specific chunk indices as priority - these will bypass the normal processing queue
   * and be processed immediately when encountered
   */
  public setPriorityChunks(chunkIndices: number[]): void {
    console.log(`[StreamingProcessor] Setting priority chunks: ${chunkIndices.join(', ')}`);
    this.priorityChunks.clear();
    chunkIndices.forEach(index => this.priorityChunks.add(index));
  }

  /**
   * Clear all priority chunks
   */
  public clearPriorityChunks(): void {
    console.log(`[StreamingProcessor] Clearing priority chunks`);
    this.priorityChunks.clear();
  }

  /**
   * Check if a chunk is marked as priority
   */
  public isPriorityChunk(chunkIndex: number): boolean {
    return this.priorityChunks.has(chunkIndex);
  }

  public createChunkingStream(): Transform {
    let chunkIndex = 0;
    let buffer = Buffer.alloc(0);
    const chunkSize = this.chunkSize; // Capture in closure

    return new Transform({
      objectMode: false,
      transform(chunk: Buffer, encoding, callback) {
        buffer = Buffer.concat([buffer, chunk]);

        while (buffer.length >= chunkSize) {
          const chunkData = buffer.slice(0, chunkSize);
          buffer = buffer.slice(chunkSize);

          this.push({
            index: chunkIndex++,
            data: chunkData,
            size: chunkData.length,
            checksum: crypto.createHash('sha256').update(chunkData).digest('hex'),
          });
        }

        callback();
      },
      
      flush(callback) {
        if (buffer.length > 0) {
          this.push({
            index: chunkIndex,
            data: buffer,
            size: buffer.length,
            checksum: crypto.createHash('sha256').update(buffer).digest('hex'),
          });
        }
        callback();
      }
    });
  }

  public async processFileStream(
    fileStream: Readable,
    processor: (chunk: { index: number; data: Buffer; size: number; checksum: string }) => Promise<void>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const chunkingStream = this.createChunkingStream();
      const processingQueue: Promise<void>[] = [];
      let totalChunks = 0;

      chunkingStream.on('data', (chunk) => {
        totalChunks++;
        
        // Check if this is a priority chunk that should bypass the queue
        const isPriority = this.isPriorityChunk(chunk.index);
        
        if (isPriority) {
          console.log(`[StreamingProcessor] Processing priority chunk ${chunk.index} immediately, interrupting queue`);
          
          // For priority chunks, process immediately and interrupt ongoing tasks if needed
          const priorityPromise = processor(chunk);
          this.activeRequests.set(chunk.index, priorityPromise);
          
          priorityPromise.finally(() => {
            this.activeRequests.delete(chunk.index);
            console.log(`[StreamingProcessor] Priority chunk ${chunk.index} processing completed`);
          });
          
          // Don't add to regular queue, process immediately
          return;
        }
        
        // Regular chunks: Limit concurrent processing to prevent memory buildup
        if (processingQueue.length >= this.maxConcurrentChunks) {
          Promise.race(processingQueue).then(() => {
            const promise = processor(chunk);
            processingQueue.push(promise);
            
            promise.finally(() => {
              const index = processingQueue.indexOf(promise);
              if (index > -1) {
                processingQueue.splice(index, 1);
              }
            });
          });
        } else {
          const promise = processor(chunk);
          processingQueue.push(promise);
          
          promise.finally(() => {
            const index = processingQueue.indexOf(promise);
            if (index > -1) {
              processingQueue.splice(index, 1);
            }
          });
        }
      });

      chunkingStream.on('end', async () => {
        // Wait for all remaining chunks to be processed (both regular queue and priority chunks)
        await Promise.all([
          ...processingQueue,
          ...Array.from(this.activeRequests.values())
        ]);
        console.log(`[StreamingProcessor] All chunks processed: ${totalChunks} total, ${this.priorityChunks.size} priority`);
        this.emit('processingComplete', { totalChunks });
        resolve();
      });

      chunkingStream.on('error', (error) => {
        reject(error);
      });

      // Pipe the file stream through the chunking stream
      fileStream.pipe(chunkingStream);
    });
  }
}

// Connection pool for WebSocket connections
export class ConnectionPool {
  private connections: Map<string, any> = new Map();
  private readonly maxConnections: number;
  private readonly connectionTimeout: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(maxConnections: number = 1000, connectionTimeout: number = 300000) {
    this.maxConnections = maxConnections;
    this.connectionTimeout = connectionTimeout;
    this.startCleanup();
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleConnections();
    }, 60000); // Every minute
  }

  private cleanupStaleConnections(): void {
    const now = Date.now();
    const staleConnections: string[] = [];

    this.connections.forEach((conn, id) => {
      const lastActivity = conn.lastActivity || conn.startTime || 0;
      if (now - lastActivity > this.connectionTimeout) {
        staleConnections.push(id);
      }
    });

    staleConnections.forEach(id => {
      const conn = this.connections.get(id);
      if (conn && conn.ws && conn.ws.readyState === 1) { // OPEN
        conn.ws.close();
      }
      this.connections.delete(id);
    });

    if (staleConnections.length > 0) {
      console.log(`🧹 Cleaned up ${staleConnections.length} stale WebSocket connections`);
    }
  }

  public addConnection(id: string, connection: any): boolean {
    if (this.connections.size >= this.maxConnections) {
      console.warn(`⚠️  Connection pool full (${this.maxConnections}), rejecting connection`);
      return false;
    }

    connection.startTime = Date.now();
    connection.lastActivity = Date.now();
    this.connections.set(id, connection);
    return true;
  }

  public updateActivity(id: string): void {
    const connection = this.connections.get(id);
    if (connection) {
      connection.lastActivity = Date.now();
    }
  }

  public removeConnection(id: string): void {
    this.connections.delete(id);
  }

  public getConnection(id: string): any {
    return this.connections.get(id);
  }

  public getAllConnections(): Map<string, any> {
    return this.connections;
  }

  public getConnectionCount(): number {
    return this.connections.size;
  }

  public shutdown(): void {
    // Close all connections
    this.connections.forEach(conn => {
      if (conn.ws && conn.ws.readyState === 1) {
        conn.ws.close();
      }
    });

    this.connections.clear();

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    console.log('🔌 Connection pool shutdown complete');
  }
}

// Singleton instances
export const memoryOptimizer = new MemoryOptimizer();
export const connectionPool = new ConnectionPool();
export const globalStreamingProcessor = new StreamingFileProcessor();