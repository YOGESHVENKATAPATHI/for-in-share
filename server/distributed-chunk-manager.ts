/**
 * Distributed Chunk Processing Manager
 * 
 * Handles the coordination of file chunk uploads across thousands of upload servers.
 * Main server acts as coordinator, upload servers do the actual work.
 */

import axios from 'axios';
import crypto from 'crypto';

interface ChunkJob {
  id: string;
  fileId: string;
  chunkIndex: number;
  chunkSize: number;
  uploadServerId: string;
  status: 'pending' | 'assigned' | 'uploading' | 'completed' | 'failed';
  assignedAt?: number;
  completedAt?: number;
  attempts: number;
  maxAttempts: number;
  errorMessage?: string;
  dropboxAccountId?: number;
  dropboxFileId?: string;
}

interface UploadServer {
  id: string;
  url: string;
  isActive: boolean;
  currentJobs: number;
  maxConcurrentJobs: number;
  lastSeen: number;
  lastHealthCheck: Date;
  consecutiveFailures: number;
  totalJobsCompleted: number;
  averageUploadTime: number;
  region?: string;
}

interface ChunkData {
  buffer: Buffer;
  metadata: {
    fileId: string;
    chunkIndex: number;
    fileName: string;
    mimeType: string;
    totalChunks: number;
  };
}

class DistributedChunkManager {
  private uploadServers: Map<string, UploadServer> = new Map();
  private pendingJobs: Map<string, ChunkJob> = new Map();
  private activeJobs: Map<string, ChunkJob> = new Map();
  private completedJobs: Map<string, ChunkJob> = new Map();
  
  private readonly MAX_CONCURRENT_JOBS_PER_SERVER = parseInt(process.env.MAX_JOBS_PER_SERVER || '5');
  private readonly JOB_TIMEOUT_MS = parseInt(process.env.JOB_TIMEOUT_MS || '300000'); // 5 minutes
  private readonly SERVER_HEALTH_CHECK_INTERVAL = parseInt(process.env.SERVER_HEALTH_INTERVAL || '60000'); // 1 minute
  private readonly MAX_UPLOAD_SERVERS = parseInt(process.env.MAX_UPLOAD_SERVERS || '50000'); // Support up to 50k servers
  
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private jobMonitorInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startHealthMonitoring();
    this.startJobMonitoring();
    this.loadUploadServers();
    // Perform an immediate health check on startup so servers are discovered quickly
    this.performHealthChecks().catch(err => {
      console.warn('Initial health check failed:', err?.message || err);
    });
  }

  /**
   * Load upload servers from environment variables and external sources
   */
  private loadUploadServers(): void {
    console.log('🔄 Loading upload servers...');
    
    // Load from environment variables
    const envServers = [
      ...(process.env.UPLOAD_WORKERS || '').split(',').filter(Boolean),
      ...(process.env.ADDITIONAL_UPLOAD_SERVERS || '').split(',').filter(Boolean),
      ...(process.env.MEGA_UPLOAD_FLEET || '').split(',').filter(Boolean)
    ];

    // Load from external configuration if available
    this.loadExternalServerList();
    
    let loadedCount = 0;
    envServers.forEach((url, index) => {
      if (loadedCount >= this.MAX_UPLOAD_SERVERS) {
        console.warn(`⚠️ Maximum server limit reached (${this.MAX_UPLOAD_SERVERS}), skipping remaining servers`);
        return;
      }
      
      const trimmedUrl = url.trim();
      if (trimmedUrl && this.isValidServerUrl(trimmedUrl)) {
        const serverId = this.generateServerId(trimmedUrl);
        this.uploadServers.set(serverId, {
          id: serverId,
          url: trimmedUrl,
          isActive: false, // Will be verified by health check
          currentJobs: 0,
          maxConcurrentJobs: this.MAX_CONCURRENT_JOBS_PER_SERVER,
          lastSeen: 0,
          lastHealthCheck: new Date(),
          consecutiveFailures: 0,
          totalJobsCompleted: 0,
          averageUploadTime: 0,
          region: this.extractRegionFromUrl(trimmedUrl)
        });
        loadedCount++;
      }
    });
    
    console.log(`📡 Loaded ${this.uploadServers.size} upload servers for distributed processing`);
    if (this.uploadServers.size === 0) {
      console.warn('⚠️ No upload servers configured! Falling back to local processing.');
    }
  }

  /**
   * Load servers from external configuration file or API
   */
  private async loadExternalServerList(): Promise<void> {
    try {
      // Check if there's an external server list URL
      const externalListUrl = process.env.EXTERNAL_SERVER_LIST_URL;
      if (externalListUrl) {
        console.log('🌐 Loading servers from external list...');
        const response = await axios.get(externalListUrl, { timeout: 10000 });
        
        if (Array.isArray(response.data)) {
          response.data.forEach((serverConfig: any) => {
            if (typeof serverConfig === 'string') {
              // Simple URL list
              this.addServer(serverConfig);
            } else if (serverConfig.url) {
              // Detailed server configuration
              this.addServer(serverConfig.url, {
                maxJobs: serverConfig.maxJobs,
                region: serverConfig.region
              });
            }
          });
        }
      }
    } catch (error: any) {
      console.warn('⚠️ Failed to load external server list:', error.message);
    }
  }

  /**
   * Add a single server to the pool
   */
  public addServer(url: string, options: { maxJobs?: number; region?: string } = {}): boolean {
    if (this.uploadServers.size >= this.MAX_UPLOAD_SERVERS) {
      console.warn(`⚠️ Cannot add server ${url}: Maximum limit (${this.MAX_UPLOAD_SERVERS}) reached`);
      return false;
    }

    if (!this.isValidServerUrl(url)) {
      console.warn(`⚠️ Invalid server URL: ${url}`);
      return false;
    }

    const serverId = this.generateServerId(url);
    if (this.uploadServers.has(serverId)) {
      console.warn(`⚠️ Server already exists: ${url}`);
      return false;
    }

    this.uploadServers.set(serverId, {
      id: serverId,
      url: url.trim(),
      isActive: false,
      currentJobs: 0,
      maxConcurrentJobs: options.maxJobs || this.MAX_CONCURRENT_JOBS_PER_SERVER,
      lastSeen: 0,
      lastHealthCheck: new Date(),
      consecutiveFailures: 0,
      totalJobsCompleted: 0,
      averageUploadTime: 0,
      region: options.region || this.extractRegionFromUrl(url)
    });

    console.log(`➕ Added upload server: ${url} (${serverId})`);
    return true;
  }

  /**
   * Remove an upload server by ID
   */
  public removeUploadServer(serverId: string): boolean {
    const server = Array.from(this.uploadServers.values()).find(s => s.id === serverId);
    
    if (!server) {
      console.warn(`⚠️ Upload server not found: ${serverId}`);
      return false;
    }

    // Remove from servers map
    this.uploadServers.delete(serverId);
    
    // Clean up any pending jobs for this server
    const jobsToReassign = Array.from(this.activeJobs.entries())
      .filter(([_, job]) => job.uploadServerId === serverId);
    
    for (const [jobId, job] of jobsToReassign) {
      console.log(`🔄 Reassigning job ${jobId} from removed server ${serverId}`);
      job.uploadServerId = '';
      job.status = 'pending';
      job.attempts++;
    }

    console.log(`➖ Removed upload server: ${serverId} (${server.url})`);
    return true;
  }

  /**
   * Add multiple servers in batch
   */
  public addServersBatch(urls: string[]): { added: number; skipped: number; errors: string[] } {
    console.log(`🔄 Adding ${urls.length} servers in batch...`);
    
    let added = 0;
    let skipped = 0;
    const errors: string[] = [];
    
    for (const url of urls) {
      try {
        if (this.addServer(url)) {
          added++;
        } else {
          skipped++;
        }
      } catch (error: any) {
        errors.push(`${url}: ${error.message}`);
        skipped++;
      }
    }
    
    console.log(`📊 Batch add complete: ${added} added, ${skipped} skipped, ${errors.length} errors`);
    return { added, skipped, errors };
  }

  /**
   * Process a file chunk by assigning it to an optimal upload server
   */
  public async processChunk(chunkData: ChunkData): Promise<{
    success: boolean;
    jobId?: string;
    assignedServer?: string;
    message: string;
  }> {
    try {
      // Find optimal server for this chunk
      const optimalServer = this.findOptimalServer(chunkData);
      if (!optimalServer) {
        return {
          success: false,
          message: 'No available upload servers'
        };
      }

      // Create job
      const job: ChunkJob = {
        id: this.generateJobId(),
        fileId: chunkData.metadata.fileId,
        chunkIndex: chunkData.metadata.chunkIndex,
        chunkSize: chunkData.buffer.length,
        uploadServerId: optimalServer.id,
        status: 'pending',
        attempts: 0,
        maxAttempts: 3
      };

  // Store job (do NOT store the chunk buffer in memory until after assignment)
  this.pendingJobs.set(job.id, job);

  // Assign job to server (pass chunkData directly to avoid persisting large buffers in memory)
  const assignment = await this.assignJobToServer(job, optimalServer, chunkData);
      if (assignment.success) {
        // Move job from pending to active
        this.pendingJobs.delete(job.id);
        this.activeJobs.set(job.id, { ...job, status: 'assigned', assignedAt: Date.now() });
        
        // Update server stats
        optimalServer.currentJobs++;

        return {
          success: true,
          jobId: job.id,
          assignedServer: optimalServer.url,
          message: `Chunk assigned to ${optimalServer.url}`
        };
      } else {
        this.pendingJobs.delete(job.id);
        return {
          success: false,
          message: assignment.message
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: `Chunk processing failed: ${error.message}`
      };
    }
  }

  // Round-robin counter for distributing chunks evenly across servers
  private roundRobinIndex: number = 0;

  /**
   * Find the optimal server for uploading a chunk using round-robin distribution for parallel processing
   */
  private findOptimalServer(chunkData: ChunkData): UploadServer | null {
    const availableServers = Array.from(this.uploadServers.values())
      .filter(server => 
        server.isActive && 
        server.currentJobs < server.maxConcurrentJobs &&
        server.consecutiveFailures < 5
      );

    if (availableServers.length === 0) {
      // No active servers available — if we at least have configured servers, fall back to the least-bad candidate
      const totalServers = Array.from(this.uploadServers.values());
      if (totalServers.length === 0) return null;

      // Choose server with lowest consecutive failures and lowest currentJobs
      totalServers.sort((a, b) => {
        const failureDiff = a.consecutiveFailures - b.consecutiveFailures;
        if (failureDiff !== 0) return failureDiff;
        return a.currentJobs - b.currentJobs;
      });

      const fallback = totalServers[0];
      console.warn(`⚠️ Falling back to upload server ${fallback.url} despite it not being healthy`);
      return fallback;
    }

    // PARALLEL DISTRIBUTION: Use round-robin to distribute chunks evenly across all available servers
    // This ensures maximum parallel processing and load distribution
    
    // Sort servers by reliability first, then distribute round-robin among reliable servers
    const reliableServers = availableServers
      .filter(server => server.consecutiveFailures === 0)
      .sort((a, b) => a.currentJobs - b.currentJobs);
    
    // If we have reliable servers, use round-robin among them
    if (reliableServers.length > 0) {
      const selectedServer = reliableServers[this.roundRobinIndex % reliableServers.length];
      this.roundRobinIndex = (this.roundRobinIndex + 1) % reliableServers.length;
      
      console.log(`🔄 Round-robin selected server ${selectedServer.id} (${selectedServer.url}) - ${this.roundRobinIndex}/${reliableServers.length} servers`);
      return selectedServer;
    }
    
    // If no fully reliable servers, use round-robin among all available servers
    const selectedServer = availableServers[this.roundRobinIndex % availableServers.length];
    this.roundRobinIndex = (this.roundRobinIndex + 1) % availableServers.length;
    
    console.log(`🔄 Round-robin selected server ${selectedServer.id} (${selectedServer.url}) with ${selectedServer.consecutiveFailures} failures - ${this.roundRobinIndex}/${availableServers.length} servers`);
    return selectedServer;
  }

  /**
   * Assign a job to a specific upload server
   */
  private async assignJobToServer(job: ChunkJob, server: UploadServer, chunkData?: ChunkData): Promise<{
    success: boolean;
    message: string;
  }> {
    const maxRetries = 3;
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📤 Assigning chunk ${job.chunkIndex} (job ${job.id}) to ${server.url} (attempt ${attempt}/${maxRetries})`);
        
        // Get chunk data
        const effectiveChunk = chunkData || this.getStoredChunk(job.id);
        if (!effectiveChunk) {
          return { success: false, message: 'Chunk data not found' };
        }

        // Send job assignment to upload server - NO TIMEOUT for 100% reliability
        const response = await axios.post(`${server.url}/api/upload/chunk`, {
          jobId: job.id,
          fileId: job.fileId,
          chunkIndex: job.chunkIndex,
          fileName: effectiveChunk.metadata.fileName,
          mimeType: effectiveChunk.metadata.mimeType,
          totalChunks: effectiveChunk.metadata.totalChunks,
          chunkData: effectiveChunk.buffer.toString('base64'),
          callbackUrl: `${this.getMainServerUrl()}/api/upload/callback`
        }, {
          // No timeout - let uploads complete naturally for 100% reliability
          timeout: 0,
          headers: {
            'Content-Type': 'application/json',
            'X-Job-Assignment': 'true',
            'X-Retry-Attempt': attempt.toString()
          }
        });

        if (response.status === 200) {
          console.log(`✅ Job ${job.id} assigned to ${server.url} on attempt ${attempt}`);
          // Reset consecutive failures on success
          server.consecutiveFailures = Math.max(0, server.consecutiveFailures - 1);
          return { success: true, message: 'Job assigned successfully' };
        } else {
          lastError = new Error(`Server responded with ${response.status}`);
          console.warn(`⚠️ Job ${job.id} got status ${response.status} from ${server.url}, attempt ${attempt}/${maxRetries}`);
        }
      } catch (error: any) {
        lastError = error;
        console.warn(`⚠️ Failed to assign job ${job.id} to ${server.url} on attempt ${attempt}/${maxRetries}:`, error.message);
        
        if (attempt < maxRetries) {
          // Wait before retry with exponential backoff (but short delays)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Max 5 second delay
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // All retries failed
    server.consecutiveFailures++;
    console.error(`❌ Failed to assign job ${job.id} to ${server.url} after ${maxRetries} attempts:`, lastError?.message);
    return { success: false, message: `All ${maxRetries} attempts failed: ${lastError?.message}` };
  }

  /**
   * Handle job completion callback from upload server
   */
  public async handleJobCompletion(jobId: string, result: {
    success: boolean;
    dropboxAccountId?: number;
    dropboxFileId?: string;
    uploadTime?: number;
    errorMessage?: string;
  }): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (!job) {
      console.warn(`⚠️ Received callback for unknown job: ${jobId}`);
      return;
    }

    const server = this.uploadServers.get(job.uploadServerId);
    if (server) {
      server.currentJobs = Math.max(0, server.currentJobs - 1);
      
      if (result.success) {
        server.consecutiveFailures = 0;
        server.totalJobsCompleted++;
        if (result.uploadTime) {
          server.averageUploadTime = (server.averageUploadTime + result.uploadTime) / 2;
        }
      } else {
        server.consecutiveFailures++;
      }
    }

    // Update job status
    job.status = result.success ? 'completed' : 'failed';
    job.completedAt = Date.now();
    job.dropboxAccountId = result.dropboxAccountId;
    job.dropboxFileId = result.dropboxFileId;
    job.errorMessage = result.errorMessage;

    // Move job to completed
    this.activeJobs.delete(jobId);
    this.completedJobs.set(jobId, job);
    
    // Clean up temporary chunk storage
    this.cleanupChunkStorage(jobId);

    // Update database with chunk information
    await this.updateDatabaseWithChunk(job, result);

    console.log(`📝 Job ${jobId} completed: ${result.success ? 'SUCCESS' : 'FAILED'}`);
  }

  /**
   * Update database with chunk completion information
   */
  private async updateDatabaseWithChunk(job: ChunkJob, result: any): Promise<void> {
    try {
      // Import database manager
      const { dbManager } = await import('./db');
      
      if (result.success) {
        // Update file chunk record in database
        await dbManager.updateFileChunk({
          fileId: job.fileId,
          chunkIndex: job.chunkIndex,
          dropboxAccountId: result.dropboxAccountId,
          dropboxFileId: result.dropboxFileId,
          status: 'completed',
          uploadedAt: new Date(),
          processingServerId: job.uploadServerId
        });
        
        console.log(`💾 Database updated for chunk ${job.chunkIndex} of file ${job.fileId}`);
      } else {
        // Mark chunk as failed in database
        await dbManager.markChunkFailed({
          fileId: job.fileId,
          chunkIndex: job.chunkIndex,
          errorMessage: result.errorMessage,
          attempts: job.attempts + 1
        });
      }
    } catch (error: any) {
      console.error('❌ Failed to update database:', error.message);
    }
  }

  // Utility methods
  private generateServerId(url: string): string {
    return crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
  }

  private generateJobId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private isValidServerUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  private extractRegionFromUrl(url: string): string {
    // Extract region from common hosting patterns
    const patterns = [
      /\.(\w+)-\w+\.\w+\.com/, // AWS-style regions
      /(\w+)\d*\./, // Generic region patterns
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    
    return 'unknown';
  }

  private getMainServerUrl(): string {
    return process.env.MAIN_SERVER_URL || 
           process.env.RENDER_EXTERNAL_URL || 
           'http://localhost:5000';
  }

  // Temporary storage methods (implement with Redis in production)
  private chunkStorage: Map<string, ChunkData> = new Map();
  private chunkTTL: Map<string, number> = new Map();

  private storeChunkTemporarily(jobId: string, chunkData: ChunkData): void {
    this.chunkStorage.set(jobId, chunkData);
    this.chunkTTL.set(jobId, Date.now() + 600000); // 10 minutes TTL
  }

  private getStoredChunk(jobId: string): ChunkData | null {
    return this.chunkStorage.get(jobId) || null;
  }

  private cleanupChunkStorage(jobId: string): void {
    this.chunkStorage.delete(jobId);
    this.chunkTTL.delete(jobId);
  }

  // Health monitoring methods
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.SERVER_HEALTH_CHECK_INTERVAL);
  }

  private startJobMonitoring(): void {
    this.jobMonitorInterval = setInterval(() => {
      this.monitorJobs();
      this.cleanupExpiredChunks();
    }, 30000); // Check every 30 seconds
  }

  private async performHealthChecks(): Promise<void> {
    // Implementation for health checking upload servers
    const healthPromises = Array.from(this.uploadServers.values()).map(async (server) => {
      try {
        const response = await axios.get(`${server.url}/health`, {
          timeout: 15000, // Increased timeout for health checks, but not unlimited
          headers: {
            'User-Agent': 'DistributedChunkManager/1.0'
          }
        });
        
        if (response.status === 200) {
          const healthData = response.data;
          
          // Update server status and capabilities
          server.isActive = true;
          server.lastHealthCheck = new Date();
          server.consecutiveFailures = 0;
          
          // Update server metrics if provided
          if (healthData.currentLoad !== undefined) {
            server.currentJobs = healthData.currentLoad;
          }
          
          if (healthData.capabilities) {
            server.maxConcurrentJobs = healthData.maxLoad || server.maxConcurrentJobs;
          }
          
          console.log(`✅ Upload server ${server.id} is healthy (load: ${server.currentJobs}/${server.maxConcurrentJobs})`);
        } else {
          this.markServerUnhealthy(server, `HTTP ${response.status}`);
        }
      } catch (error: any) {
        this.markServerUnhealthy(server, error.message);
      }
    });

    await Promise.allSettled(healthPromises);
    
    const activeCount = Array.from(this.uploadServers.values()).filter(s => s.isActive).length;
    const totalCount = this.uploadServers.size;
    
    if (activeCount === 0 && totalCount > 0) {
      console.warn(`⚠️ No upload servers are healthy (0/${totalCount})`);
    } else if (activeCount < totalCount) {
      console.log(`📊 Upload servers health: ${activeCount}/${totalCount} healthy`);
    }
  }

  private markServerUnhealthy(server: UploadServer, reason: string): void {
    server.isActive = false;
    server.consecutiveFailures++;
    server.lastHealthCheck = new Date();
    
    if (server.consecutiveFailures === 1) {
      console.warn(`⚠️ Upload server ${server.id} unhealthy: ${reason}`);
    } else if (server.consecutiveFailures >= 5) {
      console.error(`❌ Upload server ${server.id} marked as failed (${server.consecutiveFailures} consecutive failures)`);
    }
  }

  private monitorJobs(): void {
    // Monitor job timeouts and reassign failed jobs
    const now = Date.now();
    
    Array.from(this.activeJobs.entries()).forEach(([jobId, job]) => {
      if (job.assignedAt && now - job.assignedAt > this.JOB_TIMEOUT_MS) {
        console.warn(`⚠️ Job ${jobId} timed out, reassigning...`);
        this.reassignTimedOutJob(job);
      }
    });
  }

  private cleanupExpiredChunks(): void {
    const now = Date.now();
    Array.from(this.chunkTTL.entries()).forEach(([jobId, expiry]) => {
      if (now > expiry) {
        this.cleanupChunkStorage(jobId);
      }
    });
  }

  private async reassignTimedOutJob(job: ChunkJob): Promise<void> {
    // Move job back to pending and increment attempts
    job.attempts++;
    if (job.attempts < job.maxAttempts) {
      job.status = 'pending';
      this.activeJobs.delete(job.id);
      this.pendingJobs.set(job.id, job);
      
      // Mark server as having issues
      const server = this.uploadServers.get(job.uploadServerId);
      if (server) {
        server.currentJobs = Math.max(0, server.currentJobs - 1);
        server.consecutiveFailures++;
      }
    } else {
      // Job failed permanently
      job.status = 'failed';
      job.errorMessage = 'Maximum retry attempts exceeded';
      this.activeJobs.delete(job.id);
      this.completedJobs.set(job.id, job);
      this.cleanupChunkStorage(job.id);
    }
  }

  // Callback handling methods for progress updates
  public updateJobStatus(jobId: string, update: {
    status?: string;
    progress?: number;
    phase?: string;
    message?: string;
    serverId?: string;
    chunkId?: string;
    checksum?: string;
    downloadUrl?: string;
    lastUpdate?: number;
  }): void {
    // Update active job
    const activeJob = this.activeJobs.get(jobId);
    if (activeJob) {
      if (update.status) {
        activeJob.status = update.status as any;
      }
      if (update.message) {
        activeJob.errorMessage = update.message;
      }
      if (update.status === 'completed') {
        activeJob.completedAt = Date.now();
        // Move to completed jobs
        this.completedJobs.set(jobId, activeJob);
        this.activeJobs.delete(jobId);
        console.log(`✅ Job ${jobId} marked as completed via callback`);
      } else if (update.status === 'failed') {
        activeJob.status = 'failed';
        console.log(`❌ Job ${jobId} marked as failed via callback: ${update.message}`);
      }
      return;
    }

    // Update pending job if found
    const pendingJob = this.pendingJobs.get(jobId);
    if (pendingJob && update.status) {
      pendingJob.status = update.status as any;
      if (update.message) {
        pendingJob.errorMessage = update.message;
      }
    }
  }

  public getFileProgress(fileId: string): number {
    const allJobs = [
      ...Array.from(this.pendingJobs.values()),
      ...Array.from(this.activeJobs.values()),
      ...Array.from(this.completedJobs.values())
    ];
    
    const fileJobs = allJobs.filter(job => job.fileId === fileId);
    if (fileJobs.length === 0) {
      return 0;
    }
    
    const completedJobs = fileJobs.filter(job => job.status === 'completed');
    return Math.round((completedJobs.length / fileJobs.length) * 100);
  }

  public getJobStatus(jobId: string): ChunkJob | null {
    return this.activeJobs.get(jobId) || 
           this.pendingJobs.get(jobId) || 
           this.completedJobs.get(jobId) || 
           null;
  }

  public getJobsByFile(fileId: string): ChunkJob[] {
    const allJobs = [
      ...Array.from(this.pendingJobs.values()),
      ...Array.from(this.activeJobs.values()),
      ...Array.from(this.completedJobs.values())
    ];
    
    return allJobs.filter(job => job.fileId === fileId);
  }

  // Public API methods
  public getStats() {
    const activeServers = Array.from(this.uploadServers.values()).filter(s => s.isActive).length;
    const totalJobs = this.pendingJobs.size + this.activeJobs.size + this.completedJobs.size;
    
    return {
      totalServers: this.uploadServers.size,
      activeServers,
      pendingJobs: this.pendingJobs.size,
      activeJobs: this.activeJobs.size,
      completedJobs: this.completedJobs.size,
      totalJobs,
      memoryUsage: process.memoryUsage(),
      temporaryChunksStored: this.chunkStorage.size
    };
  }

  public getUploadServers() {
    return this.uploadServers;
  }

  public shutdown(): void {
    console.log('🛑 Shutting down distributed chunk manager...');
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    if (this.jobMonitorInterval) {
      clearInterval(this.jobMonitorInterval);
    }
    
    // Clean up temporary storage
    this.chunkStorage.clear();
    this.chunkTTL.clear();
    
    console.log('✅ Distributed chunk manager shutdown complete');
  }
}

// Export singleton instance
export const distributedChunkManager = new DistributedChunkManager();
export default distributedChunkManager;