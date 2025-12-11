import axios from 'axios';
import crypto from 'crypto';
import { workerURLDiscovery } from './worker-url-discovery';

export interface WorkerServer {
  id: string;
  url: string;
  type: 'upload' | 'chat' | 'general' | 'primary';
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastHealthCheck: Date;
  load: number; // 0-100 percentage
  connections: number;
  memoryUsage: number; // in MB
  responseTime: number; // in ms
  capabilities: string[];
  region?: string;
  maxConnections: number;
  maxMemory: number; // in MB
}

export interface ClusterMetrics {
  totalServers: number;
  healthyServers: number;
  totalLoad: number;
  averageResponseTime: number;
  totalConnections: number;
  totalMemoryUsage: number;
}

export class ClusterManager {
  private workers: Map<string, WorkerServer> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly HEALTH_TIMEOUT = 10000; // 10 seconds
  private readonly MAX_RESPONSE_TIME = 5000; // 5 seconds
  private roundRobinIndex = 0;

  constructor() {
    this.initializeWorkers();
    this.startHealthChecks();
  }

  private initializeWorkers() {
    // Parse worker server URLs from environment variables directly
    const workerUrls = (process.env.WORKER_SERVERS || '').split(',')
      .map(url => url.trim())
      .filter(Boolean);

    const uploadWorkers = (process.env.UPLOAD_WORKERS || '').split(',')
      .map(url => url.trim())
      .filter(Boolean);

    const chatWorkers = (process.env.CHAT_WORKERS || '').split(',')
      .map(url => url.trim())
      .filter(Boolean);
      
    console.log(`🔍 Direct environment parsing:`);
    console.log(`   Worker Servers: ${workerUrls.length} (${workerUrls.join(', ')})`);
    console.log(`   Upload Workers: ${uploadWorkers.length} (${uploadWorkers.join(', ')})`);
    console.log(`   Chat Workers: ${chatWorkers.length} (${chatWorkers.join(', ')})`);

    // Add general workers
    workerUrls.forEach((url, index) => {
      const worker: WorkerServer = {
        id: `general-${index}`,
        url,
        type: 'general',
        status: 'unknown',
        lastHealthCheck: new Date(),
        load: 0,
        connections: 0,
        memoryUsage: 0,
        responseTime: 0,
        capabilities: ['api', 'websocket'],
        maxConnections: 1000,
        maxMemory: 450, // 450MB limit for Render free tier
      };
      this.workers.set(worker.id, worker);
    });

    // Add dedicated upload workers
    uploadWorkers.forEach((url, index) => {
      const worker: WorkerServer = {
        id: `upload-${index}`,
        url,
        type: 'upload',
        status: 'unknown',
        lastHealthCheck: new Date(),
        load: 0,
        connections: 0,
        memoryUsage: 0,
        responseTime: 0,
        capabilities: ['file-upload', 'stream-processing'],
        maxConnections: 100, // Lower for upload workers due to memory usage
        maxMemory: 400, // More conservative for file processing
      };
      this.workers.set(worker.id, worker);
    });

    // Add dedicated chat workers
    chatWorkers.forEach((url, index) => {
      const worker: WorkerServer = {
        id: `chat-${index}`,
        url,
        type: 'chat',
        status: 'unknown',
        lastHealthCheck: new Date(),
        load: 0,
        connections: 0,
        memoryUsage: 0,
        responseTime: 0,
        capabilities: ['websocket', 'real-time'],
        maxConnections: 2000, // Higher for chat workers
        maxMemory: 300, // Lower memory footprint for chat
      };
      this.workers.set(worker.id, worker);
    });

    console.log(`🌐 Initialized cluster with ${this.workers.size} worker servers:`);
    this.workers.forEach(worker => {
      console.log(`  📍 ${worker.id} (${worker.type}): ${worker.url}`);
    });
  }

  private startHealthChecks() {
    // Initial health check
    this.performHealthChecks();

    // Periodic health checks
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.HEALTH_CHECK_INTERVAL);

    console.log('🔍 Started health monitoring for cluster workers');
  }

  private async performHealthChecks() {
    const healthPromises = Array.from(this.workers.values()).map(async (worker) => {
      try {
        const startTime = Date.now();
        const response = await axios.get(`${worker.url}/api/health`, {
          timeout: this.HEALTH_TIMEOUT,
          headers: {
            'User-Agent': 'ClusterManager/1.0'
          }
        });

        const responseTime = Date.now() - startTime;
        const healthData = response.data;

        // Update worker status
        worker.status = response.status === 200 ? 'healthy' : 'unhealthy';
        worker.lastHealthCheck = new Date();
        worker.responseTime = responseTime;
        worker.memoryUsage = healthData.memory?.rss ? Math.round(healthData.memory.rss / 1024 / 1024) : 0;
        worker.connections = healthData.connections || 0;
        worker.load = this.calculateLoad(worker);

        // Log if worker becomes unhealthy
        if (worker.status === 'unhealthy') {
          console.warn(`⚠️  Worker ${worker.id} is unhealthy (${response.status})`);
        }

      } catch (error: any) {
        worker.status = 'unhealthy';
        worker.lastHealthCheck = new Date();
        worker.responseTime = this.HEALTH_TIMEOUT;
        
        // Log health check errors for debugging
        console.error(`❌ Health check failed for ${worker.id} (${worker.url}):`, {
          message: error.message,
          code: error.code,
          status: error.response?.status,
          timeout: error.timeout || false
        });
        
        // Don't spam logs for known unhealthy workers
        if (Date.now() - worker.lastHealthCheck.getTime() > 300000) { // 5 minutes
          console.warn(`❌ Worker ${worker.id} health check failed:`, error.message);
        }
      }
    });

    await Promise.allSettled(healthPromises);
    this.logClusterStatus();
  }

  private calculateLoad(worker: WorkerServer): number {
    // Calculate load based on connections, memory usage, and response time
    const connectionLoad = (worker.connections / worker.maxConnections) * 100;
    const memoryLoad = (worker.memoryUsage / worker.maxMemory) * 100;
    const responseLoad = Math.min((worker.responseTime / this.MAX_RESPONSE_TIME) * 100, 100);

    // Weighted average
    return Math.round((connectionLoad * 0.4) + (memoryLoad * 0.4) + (responseLoad * 0.2));
  }

  private logClusterStatus() {
    const metrics = this.getClusterMetrics();
    
    // Only log critical cluster issues if there are actually workers configured
    if (metrics.totalServers > 0) {
      if (metrics.healthyServers === 0) {
        console.error('🚨 CRITICAL: No healthy workers in cluster!');
      } else if (metrics.healthyServers < metrics.totalServers) {
        console.warn(`⚠️  Cluster degraded: ${metrics.healthyServers}/${metrics.totalServers} workers healthy`);
      }
    }

    // Log detailed status every 5 minutes
    if (Date.now() % 300000 < this.HEALTH_CHECK_INTERVAL) {
      console.log('📊 Cluster Status:');
      console.log(`  💚 Healthy: ${metrics.healthyServers}/${metrics.totalServers} workers`);
      console.log(`  📈 Average Load: ${metrics.totalLoad.toFixed(1)}%`);
      console.log(`  ⚡ Average Response: ${metrics.averageResponseTime.toFixed(0)}ms`);
      console.log(`  🔗 Total Connections: ${metrics.totalConnections}`);
      console.log(`  💾 Total Memory: ${metrics.totalMemoryUsage.toFixed(0)}MB`);
    }
  }

  public getClusterMetrics(): ClusterMetrics {
    const workers = Array.from(this.workers.values());
    const healthyWorkers = workers.filter(w => w.status === 'healthy');

    return {
      totalServers: workers.length,
      healthyServers: healthyWorkers.length,
      totalLoad: healthyWorkers.reduce((sum, w) => sum + w.load, 0) / Math.max(healthyWorkers.length, 1),
      averageResponseTime: healthyWorkers.reduce((sum, w) => sum + w.responseTime, 0) / Math.max(healthyWorkers.length, 1),
      totalConnections: healthyWorkers.reduce((sum, w) => sum + w.connections, 0),
      totalMemoryUsage: healthyWorkers.reduce((sum, w) => sum + w.memoryUsage, 0),
    };
  }

  public getBestWorker(type: 'upload' | 'chat' | 'general' = 'general', capabilities: string[] = []): WorkerServer | null {
    const workers = Array.from(this.workers.values())
      .filter(w => 
        w.status === 'healthy' && 
        (w.type === type || w.type === 'general') &&
        capabilities.every(cap => w.capabilities.includes(cap))
      )
      .sort((a, b) => a.load - b.load);

    if (workers.length === 0) {
      console.warn(`No healthy workers available for type: ${type}`);
      return null;
    }

    // Return the least loaded worker
    return workers[0];
  }

  public getRoundRobinWorker(type: 'upload' | 'chat' | 'general' = 'general'): WorkerServer | null {
    const workers = Array.from(this.workers.values())
      .filter(w => w.status === 'healthy' && (w.type === type || w.type === 'general'));

    if (workers.length === 0) {
      return null;
    }

    const worker = workers[this.roundRobinIndex % workers.length];
    this.roundRobinIndex++;
    
    return worker;
  }

  public getAllWorkers(): WorkerServer[] {
    return Array.from(this.workers.values());
  }

  public getWorkerById(id: string): WorkerServer | null {
    return this.workers.get(id) || null;
  }

  public async forwardRequest(worker: WorkerServer, path: string, method: string = 'GET', data?: any, headers?: Record<string, string>): Promise<any> {
    try {
      const url = `${worker.url}${path}`;
      const config: any = {
        method,
        url,
        timeout: 30000, // 30 second timeout
        headers: {
          ...headers,
          'X-Forwarded-By': 'ClusterManager',
          'X-Worker-Id': worker.id,
        }
      };

      if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;

    } catch (error: any) {
      console.error(`Request forwarding failed to worker ${worker.id}:`, error.message);
      
      // Mark worker as unhealthy if it's a server error
      if (error.response?.status >= 500 || error.code === 'ECONNREFUSED') {
        worker.status = 'unhealthy';
      }
      
      throw error;
    }
  }

  public async broadcastToWorkers(path: string, data: any, workerType?: 'upload' | 'chat' | 'general'): Promise<void> {
    const workers = Array.from(this.workers.values())
      .filter(w => 
        w.status === 'healthy' && 
        (!workerType || w.type === workerType || w.type === 'general')
      );

    const promises = workers.map(worker => 
      this.forwardRequest(worker, path, 'POST', data)
        .catch(error => console.warn(`Broadcast failed to ${worker.id}:`, error.message))
    );

    await Promise.allSettled(promises);
  }

  public addWorker(worker: WorkerServer): void {
    this.workers.set(worker.id, worker);
    console.log(`➕ Added worker ${worker.id} to cluster`);
  }

  public removeWorker(workerId: string): boolean {
    const removed = this.workers.delete(workerId);
    if (removed) {
      console.log(`➖ Removed worker ${workerId} from cluster`);
    }
    return removed;
  }

  public shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    console.log('🔌 Cluster manager shutdown complete');
  }

  // Helper method to get worker statistics for monitoring
  public getWorkerStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    this.workers.forEach((worker, id) => {
      stats[id] = {
        url: worker.url,
        type: worker.type,
        status: worker.status,
        load: worker.load,
        connections: worker.connections,
        memoryUsage: worker.memoryUsage,
        responseTime: worker.responseTime,
        lastHealthCheck: worker.lastHealthCheck,
      };
    });

    return stats;
  }

  // Load balancing strategies
  public getWorkerByStrategy(strategy: 'least-load' | 'round-robin' | 'random', type: 'upload' | 'chat' | 'general' = 'general'): WorkerServer | null {
    switch (strategy) {
      case 'least-load':
        return this.getBestWorker(type);
      case 'round-robin':
        return this.getRoundRobinWorker(type);
      case 'random':
        const workers = Array.from(this.workers.values())
          .filter(w => w.status === 'healthy' && (w.type === type || w.type === 'general'));
        return workers.length > 0 ? workers[Math.floor(Math.random() * workers.length)] : null;
      default:
        return this.getBestWorker(type);
    }
  }
}

// Singleton instance
export const clusterManager = new ClusterManager();
