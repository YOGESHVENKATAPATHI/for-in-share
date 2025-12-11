import { config } from 'dotenv';

// Load environment variables
config();

export interface WorkerURLConfig {
  workerServers: string[];
  uploadWorkers: string[];
  chatWorkers: string[];
  discoveryMode: 'local' | 'static' | 'registry' | 'auto';
}

export class WorkerURLDiscovery {
  private config: WorkerURLConfig;
  private configPromise: Promise<WorkerURLConfig> | null = null;

  constructor() {
    // Initialize with default config, then load async
    this.config = this.getDefaultConfig();
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      this.config = await this.initializeConfig();
    } catch (error) {
      console.warn('Failed to initialize worker URL discovery:', error);
      this.config = this.getDefaultConfig();
    }
  }

  private async initializeConfig(): Promise<WorkerURLConfig> {
    const mode = this.getDiscoveryMode();
    
    switch (mode) {
      case 'local':
        return this.getLocalConfig();
      case 'static':
        return this.getStaticConfig();
      case 'registry':
        return await this.getRegistryConfig();
      case 'auto':
        return await this.getAutoConfig();
      default:
        return this.getDefaultConfig();
    }
  }

  private getDiscoveryMode(): string {
    // Priority: explicit mode > environment detection > default
    if (process.env.WORKER_DISCOVERY_MODE) {
      return process.env.WORKER_DISCOVERY_MODE;
    }

    // Auto-detect based on environment
    if (process.env.NODE_ENV === 'development') return 'local';
    if (process.env.RENDER_EXTERNAL_URL) return 'static'; // Render deployment
    if (process.env.VERCEL_URL) return 'static'; // Vercel deployment
    if (process.env.RAILWAY_STATIC_URL) return 'static'; // Railway deployment
    
    return 'auto';
  }

  private getLocalConfig(): WorkerURLConfig {
    const basePort = parseInt(process.env.LOCAL_BASE_PORT || '5000');
    
    return {
      workerServers: [
        `http://127.0.0.1:${basePort + 3}`,
        `http://127.0.0.1:${basePort + 4}`
      ],
      uploadWorkers: [`http://127.0.0.1:${basePort + 1}`],
      chatWorkers: [`http://127.0.0.1:${basePort + 2}`],
      discoveryMode: 'local'
    };
  }

  private getStaticConfig(): WorkerURLConfig {
    return {
      workerServers: this.parseURLList(process.env.WORKER_SERVERS || ''),
      uploadWorkers: this.parseURLList(process.env.UPLOAD_WORKERS || ''),
      chatWorkers: this.parseURLList(process.env.CHAT_WORKERS || ''),
      discoveryMode: 'static'
    };
  }

  private async getRegistryConfig(): Promise<WorkerURLConfig> {
    const registryUrl = process.env.REGISTRY_URL;
    const apiKey = process.env.REGISTRY_API_KEY;

    if (!registryUrl) {
      console.warn('Registry URL not configured, falling back to static config');
      return this.getStaticConfig();
    }

    try {
      const response = await fetch(`${registryUrl}/workers`, {
        headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}
      });

      if (!response.ok) {
        throw new Error(`Registry request failed: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        workerServers: data.workers?.general || [],
        uploadWorkers: data.workers?.upload || [],
        chatWorkers: data.workers?.chat || [],
        discoveryMode: 'registry'
      };
    } catch (error) {
      console.error('Registry discovery failed:', error);
      return this.getStaticConfig();
    }
  }

  private async getAutoConfig(): Promise<WorkerURLConfig> {
    // Try different detection methods
    
    // Method 1: Environment variables (highest priority)
    const staticConfig = this.getStaticConfig();
    if (this.hasValidURLs(staticConfig)) {
      return staticConfig;
    }

    // Method 2: Platform-specific detection
    const platformConfig = this.detectPlatformConfig();
    if (this.hasValidURLs(platformConfig)) {
      return platformConfig;
    }

    // Method 3: Fallback to local development
    console.warn('No worker URLs configured, falling back to local development mode');
    return this.getLocalConfig();
  }

  private detectPlatformConfig(): WorkerURLConfig {
    // Render detection
    if (process.env.RENDER_EXTERNAL_URL) {
      return this.generateRenderURLs();
    }

    // Vercel detection  
    if (process.env.VERCEL_URL) {
      return this.generateVercelURLs();
    }

    // Railway detection
    if (process.env.RAILWAY_STATIC_URL) {
      return this.generateRailwayURLs();
    }

    return this.getDefaultConfig();
  }

  private generateRenderURLs(): WorkerURLConfig {
    // Generate Render URLs based on service naming pattern
    const baseName = process.env.RENDER_SERVICE_NAME || 'forum';
    
    return {
      workerServers: [
        `https://${baseName}-worker-1.onrender.com`,
        `https://${baseName}-worker-2.onrender.com`
      ],
      uploadWorkers: [`https://${baseName}-upload.onrender.com`],
      chatWorkers: [`https://${baseName}-chat.onrender.com`],
      discoveryMode: 'auto'
    };
  }

  private generateVercelURLs(): WorkerURLConfig {
    const baseName = process.env.VERCEL_PROJECT_NAME || 'forum';
    
    return {
      workerServers: [
        `https://${baseName}-worker-1.vercel.app`,
        `https://${baseName}-worker-2.vercel.app`
      ],
      uploadWorkers: [`https://${baseName}-upload.vercel.app`],
      chatWorkers: [`https://${baseName}-chat.vercel.app`],
      discoveryMode: 'auto'
    };
  }

  private generateRailwayURLs(): WorkerURLConfig {
    const baseName = process.env.RAILWAY_PROJECT_NAME || 'forum';
    
    return {
      workerServers: [
        `https://${baseName}-worker-1.railway.app`,
        `https://${baseName}-worker-2.railway.app`
      ],
      uploadWorkers: [`https://${baseName}-upload.railway.app`],
      chatWorkers: [`https://${baseName}-chat.railway.app`],
      discoveryMode: 'auto'
    };
  }

  private getDefaultConfig(): WorkerURLConfig {
    return {
      workerServers: [],
      uploadWorkers: [],
      chatWorkers: [],
      discoveryMode: 'static'
    };
  }

  private parseURLList(urlString: string): string[] {
    return urlString
      .split(',')
      .map(url => url.trim())
      .filter(url => url.length > 0);
  }

  private hasValidURLs(config: WorkerURLConfig): boolean {
    return config.workerServers.length > 0 || 
           config.uploadWorkers.length > 0 || 
           config.chatWorkers.length > 0;
  }

  // Public methods
  public getConfig(): WorkerURLConfig {
    return this.config;
  }

  public getAllWorkerURLs(): string[] {
    return [
      ...this.config.workerServers,
      ...this.config.uploadWorkers,
      ...this.config.chatWorkers
    ];
  }

  public async refreshConfig(): Promise<void> {
    this.config = await this.initializeConfig();
  }

  public async validateWorkers(): Promise<{ [url: string]: boolean }> {
    const allURLs = this.getAllWorkerURLs();
    const results: { [url: string]: boolean } = {};

    const checks = allURLs.map(async (url) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`${url}/api/health`, {
          method: 'GET',
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        results[url] = response.ok;
      } catch (error) {
        results[url] = false;
      }
    });

    await Promise.all(checks);
    return results;
  }

  public getConfigSummary(): object {
    const totalWorkers = this.getAllWorkerURLs().length;
    
    return {
      discoveryMode: this.config.discoveryMode,
      totalWorkers,
      workerTypes: {
        general: this.config.workerServers.length,
        upload: this.config.uploadWorkers.length,
        chat: this.config.chatWorkers.length
      },
      urls: this.config
    };
  }

  // Static utility methods
  public static createForEnvironment(env: string): WorkerURLDiscovery {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = env;
    
    const discovery = new WorkerURLDiscovery();
    
    process.env.NODE_ENV = originalEnv;
    return discovery;
  }

  public static async testConfiguration(config?: WorkerURLConfig): Promise<boolean> {
    const discovery = new WorkerURLDiscovery();
    const testConfig = config || discovery.getConfig();
    
    if (!discovery.hasValidURLs(testConfig)) {
      console.log('❌ No worker URLs configured');
      return false;
    }

    console.log('🔍 Testing worker connectivity...');
    const results = await discovery.validateWorkers();
    
    const healthyWorkers = Object.values(results).filter(Boolean).length;
    const totalWorkers = Object.keys(results).length;
    
    console.log(`📊 Results: ${healthyWorkers}/${totalWorkers} workers healthy`);
    
    Object.entries(results).forEach(([url, healthy]) => {
      console.log(`  ${healthy ? '✅' : '❌'} ${url}`);
    });

    return healthyWorkers > 0;
  }
}

// Export singleton instance
export const workerURLDiscovery = new WorkerURLDiscovery();