import express from 'express';
import { clusterManager, WorkerServer } from './cluster-manager';
import { memoryOptimizer } from './memory-optimizer';
import crypto from 'crypto';
import axios from 'axios';

export interface LoadBalancerConfig {
  strategy: 'round-robin' | 'least-connections' | 'least-load' | 'weighted';
  healthCheckInterval: number;
  maxRetries: number;
  retryDelay: number;
  circuitBreakerThreshold: number;
  circuitBreakerTimeout: number;
}

export interface RequestMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  requestsPerSecond: number;
}

export class LoadBalancer {
  private config: LoadBalancerConfig;
  private requestMetrics: Map<string, RequestMetrics> = new Map();
  private circuitBreakers: Map<string, { 
    state: 'closed' | 'open' | 'half-open';
    failures: number;
    lastFailure: Date;
    nextRetry: Date;
  }> = new Map();
  private requestQueue: Array<{
    req: express.Request;
    res: express.Response;
    retry: number;
    timestamp: Date;
  }> = [];
  private roundRobinCounters: Map<string, number> = new Map();

  constructor(config: Partial<LoadBalancerConfig> = {}) {
    this.config = {
      strategy: 'least-load',
      healthCheckInterval: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 60000,
      ...config
    };

    this.initializeMetrics();
    this.startMetricsCollection();
  }

  private initializeMetrics(): void {
    // Initialize metrics for all workers
    clusterManager.getAllWorkers().forEach(worker => {
      this.requestMetrics.set(worker.id, {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        requestsPerSecond: 0
      });
      
      this.circuitBreakers.set(worker.id, {
        state: 'closed',
        failures: 0,
        lastFailure: new Date(0),
        nextRetry: new Date(0)
      });
    });
  }

  private startMetricsCollection(): void {
    setInterval(() => {
      this.updateRequestsPerSecond();
      this.updateCircuitBreakers();
    }, 1000); // Update every second

    console.log('📊 Load balancer metrics collection started');
  }

  private updateRequestsPerSecond(): void {
    const now = Date.now();
    
    this.requestMetrics.forEach((metrics, workerId) => {
      // Calculate requests per second (simplified - in real implementation, use sliding window)
      metrics.requestsPerSecond = metrics.totalRequests / (process.uptime() || 1);
    });
  }

  private updateCircuitBreakers(): void {
    const now = new Date();
    
    this.circuitBreakers.forEach((breaker, workerId) => {
      if (breaker.state === 'open' && now >= breaker.nextRetry) {
        breaker.state = 'half-open';
        console.log(`🔄 Circuit breaker for worker ${workerId} moved to half-open`);
      }
      
      // Reset failure count after a period of no failures
      if (breaker.state === 'closed' && (now.getTime() - breaker.lastFailure.getTime()) > 300000) {
        breaker.failures = 0;
      }
    });
  }

  public getLoadBalanceMiddleware(): express.RequestHandler {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      this.handleRequest(req, res, next);
    };
  }

  private async handleRequest(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    try {
      // Determine request type based on path
      const requestType = this.determineRequestType(req.path);
      
      // Get best worker for this request type
      const worker = await this.selectWorker(requestType, req);
      
      if (!worker) {
        res.status(503).json({ 
          error: 'No available workers',
          requestId 
        });
        return;
      }

      // Check circuit breaker
      const breaker = this.circuitBreakers.get(worker.id);
      if (breaker?.state === 'open') {
        throw new Error(`Circuit breaker open for worker ${worker.id}`);
      }

      // Forward request to worker
      await this.forwardRequest(worker, req, res, requestId);
      
      // Record successful request
      this.recordRequestSuccess(worker.id, Date.now() - startTime);
      
      // Close circuit breaker if it was half-open
      if (breaker?.state === 'half-open') {
        breaker.state = 'closed';
        breaker.failures = 0;
        console.log(`✅ Circuit breaker for worker ${worker.id} closed`);
      }

    } catch (error: any) {
      console.error(`Request ${requestId} failed:`, error.message);
      
      // Try to find alternative worker and retry
      const retryResult = await this.retryRequest(req, res, requestId, 0);
      
      if (!retryResult) {
        this.recordRequestFailure(requestId, error);
        res.status(503).json({ 
          error: 'All workers unavailable', 
          requestId,
          details: error.message 
        });
      }
    }
  }

  private determineRequestType(path: string): 'upload' | 'chat' | 'general' {
    if (path.includes('/files/upload') || path.includes('/files/download')) {
      return 'upload';
    }
    
    if (path.includes('/messages') || path.includes('/websocket')) {
      return 'chat';
    }
    
    return 'general';
  }

  private async selectWorker(type: 'upload' | 'chat' | 'general', req: express.Request): Promise<WorkerServer | null> {
    const availableWorkers = clusterManager.getAllWorkers()
      .filter(w => 
        w.status === 'healthy' && 
        (w.type === type || w.type === 'general') &&
        this.circuitBreakers.get(w.id)?.state !== 'open'
      );

    if (availableWorkers.length === 0) {
      return null;
    }

    switch (this.config.strategy) {
      case 'round-robin':
        return this.selectRoundRobin(availableWorkers, type);
        
      case 'least-connections':
        return this.selectLeastConnections(availableWorkers);
        
      case 'least-load':
        return this.selectLeastLoad(availableWorkers);
        
      case 'weighted':
        return this.selectWeighted(availableWorkers, req);
        
      default:
        return availableWorkers[0];
    }
  }

  private selectRoundRobin(workers: WorkerServer[], type: string): WorkerServer {
    const counter = this.roundRobinCounters.get(type) || 0;
    const selectedWorker = workers[counter % workers.length];
    this.roundRobinCounters.set(type, counter + 1);
    return selectedWorker;
  }

  private selectLeastConnections(workers: WorkerServer[]): WorkerServer {
    return workers.reduce((best, current) => 
      current.connections < best.connections ? current : best
    );
  }

  private selectLeastLoad(workers: WorkerServer[]): WorkerServer {
    return workers.reduce((best, current) => 
      current.load < best.load ? current : best
    );
  }

  private selectWeighted(workers: WorkerServer[], req: express.Request): WorkerServer {
    // Implement weighted selection based on worker capabilities and current load
    const weightedWorkers = workers.map(worker => {
      let weight = 100; // Base weight
      
      // Adjust weight based on load
      weight = weight * (1 - (worker.load / 100));
      
      // Adjust weight based on response time
      weight = weight * (1 - Math.min(worker.responseTime / 5000, 0.8));
      
      // Adjust weight based on memory usage
      weight = weight * (1 - (worker.memoryUsage / worker.maxMemory));
      
      // Prefer workers with specific capabilities for the request type
      const requestType = this.determineRequestType(req.path);
      const hasOptimalCapability = worker.capabilities.some(cap => {
        if (requestType === 'upload' && cap === 'file-upload') return true;
        if (requestType === 'chat' && cap === 'real-time') return true;
        return false;
      });
      
      if (hasOptimalCapability) {
        weight = weight * 1.5; // 50% bonus for optimal capability
      }
      
      return { worker, weight: Math.max(weight, 1) };
    });

    // Select based on weighted random selection
    const totalWeight = weightedWorkers.reduce((sum, w) => sum + w.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const { worker, weight } of weightedWorkers) {
      random -= weight;
      if (random <= 0) {
        return worker;
      }
    }
    
    return weightedWorkers[0].worker; // Fallback
  }

  private async forwardRequest(
    worker: WorkerServer, 
    req: express.Request, 
    res: express.Response,
    requestId: string
  ): Promise<void> {
    try {
      // Prepare headers
      const headers = {
        ...req.headers,
        'x-forwarded-for': req.ip,
        'x-forwarded-proto': req.protocol,
        'x-request-id': requestId,
        'x-worker-id': worker.id,
      };

      // Remove hop-by-hop headers
      const cleanHeaders: any = { ...headers };
      delete cleanHeaders['connection'];
      delete cleanHeaders['keep-alive'];
      delete cleanHeaders['proxy-authenticate'];
      delete cleanHeaders['proxy-authorization'];
      delete cleanHeaders['te'];
      delete cleanHeaders['trailers'];
      delete cleanHeaders['transfer-encoding'];
      delete cleanHeaders['upgrade'];

      const config: any = {
        method: req.method,
        url: `${worker.url}${req.path}`,
        params: req.query,
        headers: cleanHeaders,
        timeout: 30000,
        validateStatus: () => true, // Don't throw on any status code
      };

      // Add body for POST/PUT/PATCH requests
      if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
        config.data = req.body;
      }

      const response = await axios(config);

      // Copy response headers
      Object.entries(response.headers).forEach(([key, value]) => {
        if (key.toLowerCase() !== 'transfer-encoding') {
          res.setHeader(key, value as string);
        }
      });

      // Send response
      res.status(response.status);
      
      if (response.data) {
        res.send(response.data);
      } else {
        res.end();
      }

    } catch (error: any) {
      console.error(`Error forwarding request to worker ${worker.id}:`, error.message);
      
      // Record failure for circuit breaker
      const breaker = this.circuitBreakers.get(worker.id);
      if (breaker) {
        breaker.failures++;
        breaker.lastFailure = new Date();
        
        if (breaker.failures >= this.config.circuitBreakerThreshold) {
          breaker.state = 'open';
          breaker.nextRetry = new Date(Date.now() + this.config.circuitBreakerTimeout);
          console.warn(`⚠️  Circuit breaker opened for worker ${worker.id} (${breaker.failures} failures)`);
        }
      }
      
      throw error;
    }
  }

  private async retryRequest(
    req: express.Request, 
    res: express.Response,
    requestId: string,
    retryCount: number
  ): Promise<boolean> {
    if (retryCount >= this.config.maxRetries) {
      return false;
    }

    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * Math.pow(2, retryCount)));

    try {
      const requestType = this.determineRequestType(req.path);
      const worker = await this.selectWorker(requestType, req);
      
      if (!worker) {
        return false;
      }

      await this.forwardRequest(worker, req, res, requestId);
      
      console.log(`✅ Request ${requestId} succeeded on retry ${retryCount + 1}`);
      return true;

    } catch (error) {
      console.warn(`Retry ${retryCount + 1} failed for request ${requestId}`);
      return this.retryRequest(req, res, requestId, retryCount + 1);
    }
  }

  private recordRequestSuccess(workerId: string, responseTime: number): void {
    const metrics = this.requestMetrics.get(workerId);
    if (metrics) {
      metrics.totalRequests++;
      metrics.successfulRequests++;
      
      // Update average response time (simple moving average)
      metrics.averageResponseTime = (
        (metrics.averageResponseTime * (metrics.successfulRequests - 1) + responseTime) / 
        metrics.successfulRequests
      );
    }
  }

  private recordRequestFailure(requestId: string, error: any): void {
    // Find which worker this was intended for and record failure
    // This is a simplified implementation
    console.error(`Request ${requestId} failed completely:`, error.message);
  }

  public getMetrics(): {
    strategy: string;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    workerMetrics: Record<string, RequestMetrics>;
    circuitBreakers: Record<string, any>;
  } {
    let totalRequests = 0;
    let totalSuccessful = 0;
    let totalFailed = 0;
    let totalResponseTime = 0;
    let activeWorkers = 0;

    const workerMetrics: Record<string, RequestMetrics> = {};
    const circuitBreakerStatus: Record<string, any> = {};

    this.requestMetrics.forEach((metrics, workerId) => {
      workerMetrics[workerId] = { ...metrics };
      totalRequests += metrics.totalRequests;
      totalSuccessful += metrics.successfulRequests;
      totalFailed += metrics.failedRequests;
      
      if (metrics.totalRequests > 0) {
        totalResponseTime += metrics.averageResponseTime;
        activeWorkers++;
      }
    });

    this.circuitBreakers.forEach((breaker, workerId) => {
      circuitBreakerStatus[workerId] = {
        state: breaker.state,
        failures: breaker.failures,
        lastFailure: breaker.lastFailure,
      };
    });

    return {
      strategy: this.config.strategy,
      totalRequests,
      successfulRequests: totalSuccessful,
      failedRequests: totalFailed,
      averageResponseTime: activeWorkers > 0 ? totalResponseTime / activeWorkers : 0,
      workerMetrics,
      circuitBreakers: circuitBreakerStatus,
    };
  }

  public updateStrategy(strategy: LoadBalancerConfig['strategy']): void {
    this.config.strategy = strategy;
    console.log(`🔄 Load balancing strategy changed to: ${strategy}`);
  }

  public getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    totalWorkers: number;
    healthyWorkers: number;
    openCircuitBreakers: number;
  } {
    const workers = clusterManager.getAllWorkers();
    const healthyWorkers = workers.filter(w => w.status === 'healthy').length;
    const openCircuitBreakers = Array.from(this.circuitBreakers.values())
      .filter(b => b.state === 'open').length;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (healthyWorkers === 0) {
      status = 'unhealthy';
    } else if (healthyWorkers < workers.length * 0.7 || openCircuitBreakers > 0) {
      status = 'degraded';
    }

    return {
      status,
      totalWorkers: workers.length,
      healthyWorkers,
      openCircuitBreakers,
    };
  }

  public shutdown(): void {
    // Clean up resources
    this.requestMetrics.clear();
    this.circuitBreakers.clear();
    this.requestQueue.length = 0;
    this.roundRobinCounters.clear();
    
    console.log('🔌 Load balancer shutdown complete');
  }
}

// Singleton instance
export const loadBalancer = new LoadBalancer();