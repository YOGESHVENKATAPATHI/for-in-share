/**
 * Keep-Alive Service for Render.com Deployments
 * 
 * Prevents Render free tier services from going to sleep by sending periodic ping requests.
 * This ensures your main server and cluster workers remain active and responsive.
 */

import axios from 'axios';
import { dbManager } from './db';

interface ServerEndpoint {
  name: string;
  url: string;
  type: 'main' | 'worker' | 'upload' | 'chat';
  lastPing?: number;
  consecutiveFailures: number;
  isActive: boolean;
}

class KeepAliveService {
  private servers: ServerEndpoint[] = [];
  private pingInterval: NodeJS.Timeout | null = null;
  private selfPingInterval: NodeJS.Timeout | null = null;
  private backgroundTaskInterval: NodeJS.Timeout | null = null;
  private externalPingInterval: NodeJS.Timeout | null = null;
  private readonly PING_INTERVAL_MS = parseInt(process.env.KEEP_ALIVE_INTERVAL || '40000'); // 40 seconds - prevents Render shutdown
  private readonly SELF_PING_INTERVAL_MS = 35000; // Self-ping every 35 seconds - more aggressive
  private readonly BACKGROUND_TASK_INTERVAL_MS = 30000; // Background task every 30 seconds
  private readonly EXTERNAL_PING_INTERVAL_MS = 45000; // External ping every 45 seconds
  private readonly PING_TIMEOUT_MS = parseInt(process.env.KEEP_ALIVE_TIMEOUT || '5000'); // 5 seconds default (reduced timeout)
  private readonly MAX_FAILURES = 5; // Max consecutive failures before marking inactive
  private isRunning = false;
  private currentPort?: number;
  private lastActivity = Date.now();
  private activityCounter = 0;
  private readonly EXTERNAL_PING_URLS = [
    'https://httpbin.org/status/200',
    'https://jsonplaceholder.typicode.com/posts/1',
    'https://api.github.com/zen'
  ];

  constructor() {
    this.initializeServers();
  }

  private initializeServers() {
    // Self-ping to prevent Render shutdown - critical for free tier
    console.log('🔄 Self-ping enabled to prevent Render shutdown');

    // Add worker servers from environment
    const workerServers = (process.env.WORKER_SERVERS || '').split(',')
      .map(url => url.trim())
      .filter(Boolean);

    workerServers.forEach((url, index) => {
      this.servers.push({
        name: `Worker Server ${index + 1}`,
        url,
        type: 'worker',
        consecutiveFailures: 0,
        isActive: true
      });
    });

    // Add upload workers from environment
    const uploadWorkers = (process.env.UPLOAD_WORKERS || '').split(',')
      .map(url => url.trim())
      .filter(Boolean);

    uploadWorkers.forEach((url, index) => {
      this.servers.push({
        name: `Upload Worker ${index + 1}`,
        url,
        type: 'upload',
        consecutiveFailures: 0,
        isActive: true
      });
    });

    // Add chat workers from environment
    const chatWorkers = (process.env.CHAT_WORKERS || '').split(',')
      .map(url => url.trim())
      .filter(Boolean);

    chatWorkers.forEach((url, index) => {
      this.servers.push({
        name: `Chat Worker ${index + 1}`,
        url,
        type: 'chat',
        consecutiveFailures: 0,
        isActive: true
      });
    });

    console.log(`🔄 Keep-alive service initialized with ${this.servers.length} servers:`);
    this.servers.forEach(server => {
      console.log(`   📡 ${server.name} (${server.type}): ${server.url}`);
    });
  }

  private getCurrentServerUrl(): string | null {
    // Check for manual override first
    if (process.env.MAIN_SERVER_URL) {
      return process.env.MAIN_SERVER_URL;
    }

    // Try to determine current server URL based on environment
    if (process.env.RENDER_EXTERNAL_URL) {
      return process.env.RENDER_EXTERNAL_URL;
    }
    
    if (process.env.VERCEL_URL) {
      return `https://${process.env.VERCEL_URL}`;
    }
    
    if (process.env.RAILWAY_STATIC_URL) {
      return process.env.RAILWAY_STATIC_URL;
    }

    // For local development, don't ping self
    if (process.env.NODE_ENV === 'development') {
      return null;
    }

    // Try to construct from common Render patterns
    const serviceName = process.env.RENDER_SERVICE_NAME;
    if (serviceName) {
      return `https://${serviceName}.onrender.com`;
    }

    return null;
  }

  async pingServer(server: ServerEndpoint): Promise<boolean> {
    const startTime = Date.now();
    
    // Try multiple endpoints in order of preference
    const endpoints = [
      '/api/ping',     // Primary API endpoint
      '/health',       // Health check endpoint
      '/api/health',   // Alternative health endpoint
      '/'              // Root endpoint as last resort
    ];

    for (let i = 0; i < endpoints.length; i++) {
      const endpoint = endpoints[i];
      try {
        const pingUrl = `${server.url}${endpoint}`;
        
        const response = await axios.get(pingUrl, {
          timeout: this.PING_TIMEOUT_MS,
          headers: {
            'User-Agent': 'KeepAlive-Bot/1.0',
            'X-Keep-Alive': 'true'
          },
          validateStatus: (status) => {
            // Accept 200, 404 (still means server is alive), and other success codes
            return status >= 200 && status < 500;
          }
        });

        const responseTime = Date.now() - startTime;
        server.lastPing = Date.now();
        server.consecutiveFailures = 0;
        
        if (!server.isActive) {
          console.log(`✅ ${server.name} is back online! (${responseTime}ms) - endpoint: ${endpoint}`);
          server.isActive = true;
        }

        // Log successful ping only on first success or after failures
        if (server.consecutiveFailures > 0 || i > 0) {
          console.log(`🔄 ${server.name} responded (${response.status}) via ${endpoint} (${responseTime}ms)`);
        }

        return true;
      } catch (error: any) {
        // If this isn't the last endpoint, continue to next one
        if (i < endpoints.length - 1) {
          continue;
        }
        
        // If all endpoints failed
        server.consecutiveFailures++;
        
        if (server.consecutiveFailures >= this.MAX_FAILURES && server.isActive) {
          console.error(`❌ ${server.name} marked as inactive after ${this.MAX_FAILURES} failures`);
          server.isActive = false;
        }

        // Only log first few failures to avoid spam
        if (server.consecutiveFailures <= 3) {
          console.warn(`⚠️ ${server.name} ping failed (attempt ${server.consecutiveFailures}): All endpoints failed - ${error.message}`);
        }

        return false;
      }
    }

    return false;
  }

  async pingAllServers(): Promise<void> {
    if (this.servers.length === 0) {
      return;
    }

    // Check memory usage before pinging - skip if memory is high
    const memoryUsage = process.memoryUsage();
    const memoryUsageMB = memoryUsage.rss / 1024 / 1024;
    
    if (memoryUsageMB > 400) { // Skip pinging if memory is above 400MB
      console.warn(`⚠️ Skipping keep-alive ping due to high memory usage: ${memoryUsageMB.toFixed(1)}MB`);
      return;
    }

    const startTime = Date.now();
    
    // Ping servers sequentially instead of parallel to reduce memory pressure
    let successful = 0;
    for (const server of this.servers) {
      try {
        const result = await this.pingServer(server);
        if (result) successful++;
        
        // Small delay between pings to reduce load
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        // Continue with next server
      }
    }
    
    const total = this.servers.length;
    const duration = Date.now() - startTime;
    
    // Only log summary every 3rd ping (every 1.5 minutes) to reduce noise
    const pingCount = Math.floor(Date.now() / this.PING_INTERVAL_MS) % 3;
    if (pingCount === 0 || successful !== total) {
      const statusIcon = successful === total ? '✅' : successful > 0 ? '⚠️' : '❌';
      console.log(`${statusIcon} Keep-alive: ${successful}/${total} servers active (${duration}ms, mem: ${memoryUsageMB.toFixed(1)}MB)`);
      
      // Log status of inactive servers
      const inactiveServers = this.servers.filter(s => !s.isActive);
      if (inactiveServers.length > 0) {
        console.warn(`   Inactive: ${inactiveServers.map(s => s.name).join(', ')}`);
      }
    }
  }

  start(port?: number): void {
    if (this.isRunning) {
      console.warn('⚠️ Keep-alive service is already running');
      return;
    }

    if (port) {
      this.currentPort = port;
    }

    console.log(`🚀 Starting enhanced keep-alive service (multiple strategies to prevent Render shutdown)`);
    console.log(`   🔄 Self-ping: every ${this.SELF_PING_INTERVAL_MS/1000}s`);
    console.log(`   📊 Background tasks: every ${this.BACKGROUND_TASK_INTERVAL_MS/1000}s`);
    console.log(`   🌐 External pings: every ${this.EXTERNAL_PING_INTERVAL_MS/1000}s`);
    if (this.servers.length > 0) {
      console.log(`   📡 Worker pings: every ${this.PING_INTERVAL_MS/1000}s (${this.servers.length} workers)`);
    }
    console.log(`   🎯 Target: prevent 50s Render auto-shutdown with 35s max intervals`);
    
    // Start worker pings if any workers configured
    if (this.servers.length > 0) {
      setTimeout(() => {
        this.pingAllServers();
      }, 5000);
      
      this.pingInterval = setInterval(() => {
        this.pingAllServers();
      }, this.PING_INTERVAL_MS);
    }
    
    // Start self-ping service
    this.startSelfPing();
    
    // Start background tasks
    this.startBackgroundTasks();
    
    // Start external pings
    this.startExternalPings();

    this.isRunning = true;
    this.lastActivity = Date.now();
    this.activityCounter = 0;
  }

  private startSelfPing(): void {
    if (!this.currentPort) {
      console.warn('⚠️ No port specified, self-ping disabled');
      return;
    }
    
    const productionUrl = process.env.PRODUCTION_SERVER_URL || process.env.RENDER_EXTERNAL_URL;
    const targetUrl = productionUrl ? `${productionUrl}/api/ping` : `http://127.0.0.1:${this.currentPort}/api/ping`;
    const urlType = productionUrl ? 'production' : 'local';
    
    console.log(`🔄 Starting self-ping to ${urlType} server (${this.SELF_PING_INTERVAL_MS/1000}s intervals)`);
    console.log(`   📡 Target URL: ${targetUrl}`);
    
    // Initial self-ping after short delay
    setTimeout(() => {
      this.performSelfPing();
    }, 2000);
    
    // Set up self-ping interval
    this.selfPingInterval = setInterval(() => {
      this.performSelfPing();
    }, this.SELF_PING_INTERVAL_MS);
  }

  private startBackgroundTasks(): void {
    console.log(`📊 Starting background tasks (${this.BACKGROUND_TASK_INTERVAL_MS/1000}s intervals)`);
    
    // Initial background task
    setTimeout(() => {
      this.performBackgroundTask();
    }, 10000);
    
    // Set up background task interval
    this.backgroundTaskInterval = setInterval(() => {
      this.performBackgroundTask();
    }, this.BACKGROUND_TASK_INTERVAL_MS);
  }

  private startExternalPings(): void {
    // Only start external pings in production to avoid unnecessary network calls in dev
    if (process.env.NODE_ENV === 'development') {
      console.log('🌐 External pings disabled in development mode');
      return;
    }
    
    console.log(`🌐 Starting external pings (${this.EXTERNAL_PING_INTERVAL_MS/1000}s intervals)`);
    
    // Initial external ping
    setTimeout(() => {
      this.performExternalPing();
    }, 15000);
    
    // Set up external ping interval
    this.externalPingInterval = setInterval(() => {
      this.performExternalPing();
    }, this.EXTERNAL_PING_INTERVAL_MS);
  }

  private async performSelfPing(): Promise<void> {
    if (!this.currentPort) return;
    
    // Try production URL first if available, then fallback to local
    const productionUrl = process.env.PRODUCTION_SERVER_URL || process.env.RENDER_EXTERNAL_URL;
    const selfUrl = productionUrl ? `${productionUrl}/api/ping` : `http://127.0.0.1:${this.currentPort}/api/ping`;
    
    this.activityCounter++;
    this.lastActivity = Date.now();
    
    try {
      const response = await axios.get(selfUrl, {
        timeout: this.PING_TIMEOUT_MS,
        headers: {
          'User-Agent': 'KeepAlive-SelfPing/1.0',
          'X-Keep-Alive': 'true',
          'X-Activity-Counter': this.activityCounter.toString()
        }
      });
      
      if (response.status === 200) {
        const urlType = productionUrl ? 'production' : 'local';
        console.log(`🔄 Self-ping #${this.activityCounter} successful (${response.status}) - ${urlType} server staying alive`);
      }
    } catch (error: any) {
      console.warn(`⚠️ Self-ping #${this.activityCounter} failed:`, error.message);
      // Try alternative endpoint
      await this.performAlternativeSelfPing();
    }
  }

  private async performAlternativeSelfPing(): Promise<void> {
    if (!this.currentPort) return;
    
    const alternativeEndpoints = ['/health', '/api/health', '/'];
    const productionUrl = process.env.PRODUCTION_SERVER_URL || process.env.RENDER_EXTERNAL_URL;
    const baseUrl = productionUrl || `http://127.0.0.1:${this.currentPort}`;
    
    for (const endpoint of alternativeEndpoints) {
      try {
        const selfUrl = `${baseUrl}${endpoint}`;
        const response = await axios.get(selfUrl, {
          timeout: this.PING_TIMEOUT_MS,
          headers: {
            'User-Agent': 'KeepAlive-Alternative/1.0',
            'X-Keep-Alive': 'true'
          }
        });
        
        const urlType = productionUrl ? 'production' : 'local';
        console.log(`🔄 Alternative ${urlType} self-ping via ${endpoint} successful (${response.status})`);
        return;
      } catch (error) {
        continue;
      }
    }
    
    console.warn('⚠️ All alternative self-ping endpoints failed');
  }

  private async performBackgroundTask(): Promise<void> {
    // Perform lightweight background tasks to maintain activity
    this.activityCounter++;
    this.lastActivity = Date.now();
    
    try {
      // Simulate CPU activity without heavy computation
      const start = Date.now();
      let sum = 0;
      for (let i = 0; i < 10000; i++) {
        sum += Math.random();
      }
      const duration = Date.now() - start;
      
      // Log memory usage periodically
      const memoryUsage = process.memoryUsage();
      const memoryUsageMB = memoryUsage.rss / 1024 / 1024;
      
      console.log(`🔄 Background task #${this.activityCounter} completed (${duration}ms, mem: ${memoryUsageMB.toFixed(1)}MB)`);
      
      // Clean up if memory usage is getting high
      if (memoryUsageMB > 400) {
        if (global.gc) {
          global.gc();
          console.log('🗑️ Garbage collection triggered due to high memory usage');
        }
      }
    } catch (error: any) {
      console.warn('⚠️ Background task failed:', error.message);
    }
  }

  private async performExternalPing(): Promise<void> {
    // Ping external services to maintain network activity
    this.activityCounter++;
    
    const randomUrl = this.EXTERNAL_PING_URLS[Math.floor(Math.random() * this.EXTERNAL_PING_URLS.length)];
    
    try {
      const response = await axios.get(randomUrl, {
        timeout: this.PING_TIMEOUT_MS,
        headers: {
          'User-Agent': 'KeepAlive-External/1.0',
          'X-Activity-Counter': this.activityCounter.toString()
        }
      });
      
      console.log(`🌐 External ping #${this.activityCounter} to ${new URL(randomUrl).hostname} successful (${response.status})`);
    } catch (error: any) {
      console.warn(`⚠️ External ping #${this.activityCounter} failed:`, error.message);
    }
  }

  getStatus() {
    const now = Date.now();
    const uptime = this.isRunning ? now - (this.lastActivity - (this.activityCounter * 35000)) : 0;
    const timeSinceLastActivity = now - this.lastActivity;
    
    return {
      isRunning: this.isRunning,
      serverCount: this.servers.length,
      activeServers: this.servers.filter(s => s.isActive).length,
      activityCounter: this.activityCounter,
      lastActivity: new Date(this.lastActivity).toISOString(),
      timeSinceLastActivity: Math.floor(timeSinceLastActivity / 1000),
      uptime: Math.floor(uptime / 1000),
      strategies: {
        selfPing: {
          enabled: !!this.selfPingInterval,
          interval: this.SELF_PING_INTERVAL_MS / 1000,
          port: this.currentPort
        },
        backgroundTasks: {
          enabled: !!this.backgroundTaskInterval,
          interval: this.BACKGROUND_TASK_INTERVAL_MS / 1000
        },
        externalPings: {
          enabled: !!this.externalPingInterval,
          interval: this.EXTERNAL_PING_INTERVAL_MS / 1000
        },
        workerPings: {
          enabled: !!this.pingInterval,
          interval: this.PING_INTERVAL_MS / 1000
        }
      },
      servers: this.servers.map(s => ({
        name: s.name,
        url: s.url,
        type: s.type,
        isActive: s.isActive,
        consecutiveFailures: s.consecutiveFailures,
        lastPing: s.lastPing ? new Date(s.lastPing).toISOString() : null
      }))
    };
  }

  // Method to add additional servers dynamically
  addServer(name: string, url: string, type: 'main' | 'worker' | 'upload' | 'chat'): void {
    const existingServer = this.servers.find(s => s.url === url);
    if (existingServer) {
      console.warn(`⚠️ Server ${url} already exists in keep-alive list`);
      return;
    }

    this.servers.push({
      name,
      url,
      type,
      consecutiveFailures: 0,
      isActive: true
    });

    console.log(`➕ Added ${name} to keep-alive list: ${url}`);
  }

  // Method to remove servers dynamically
  removeServer(url: string): void {
    const index = this.servers.findIndex(s => s.url === url);
    if (index === -1) {
      console.warn(`⚠️ Server ${url} not found in keep-alive list`);
      return;
    }

    const server = this.servers[index];
    this.servers.splice(index, 1);
    console.log(`➖ Removed ${server.name} from keep-alive list`);
  }

  // Emergency pause method for memory pressure
  emergencyPause(durationMs: number): void {
    console.log(`🚨 Emergency pause: Keep-alive service paused for ${durationMs/1000}s due to memory pressure`);

    // Clear all intervals
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.selfPingInterval) {
      clearInterval(this.selfPingInterval);
      this.selfPingInterval = null;
      console.log('🚨 Critical memory - pausing self-ping too');
    }
    if (this.backgroundTaskInterval) {
      clearInterval(this.backgroundTaskInterval);
      this.backgroundTaskInterval = null;
    }
    if (this.externalPingInterval) {
      clearInterval(this.externalPingInterval);
      this.externalPingInterval = null;
    }

    // Schedule restart after the pause duration
    setTimeout(() => {
      if (this.isRunning) {
        console.log('🔄 Restarting keep-alive service after emergency pause');
        this.start(this.currentPort);
      }
    }, durationMs);
  }

  // Stop method for graceful shutdown
  stop(): void {
    console.log('🛑 Stopping keep-alive service');

    // Clear all intervals
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.selfPingInterval) {
      clearInterval(this.selfPingInterval);
      this.selfPingInterval = null;
    }
    if (this.backgroundTaskInterval) {
      clearInterval(this.backgroundTaskInterval);
      this.backgroundTaskInterval = null;
    }
    if (this.externalPingInterval) {
      clearInterval(this.externalPingInterval);
      this.externalPingInterval = null;
    }

    this.isRunning = false;
  }
}

// Create singleton instance
export const keepAliveService = new KeepAliveService();

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('\n🔌 Received SIGINT, stopping keep-alive service...');
  keepAliveService.stop();
});

process.on('SIGTERM', () => {
  console.log('\n🔌 Received SIGTERM, stopping keep-alive service...');
  keepAliveService.stop();
});

// Periodic ping to all database shards every 30 seconds to keep Neon DBs awake
function pingAllDatabases() {
  const instances = dbManager.getAllInstances();
  instances.forEach(async (instance) => {
    try {
      // Simple query to keep the connection alive
      await instance.db.executeRaw?.('SELECT 1');
      // If executeRaw is not available, use a basic select
      // await instance.db.select().from(schema.users).limit(1);
      console.log(`[KeepAlive] Pinged DB shard ${instance.id}`);
    } catch (err) {
      console.warn(`[KeepAlive] Failed to ping DB shard ${instance.id}:`, err?.message || err);
    }
  });
}

setInterval(pingAllDatabases, 30000); // 30 seconds

export default keepAliveService;
