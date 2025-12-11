import net from 'net';
import fs from 'fs';
import path from 'path';

export interface PortInfo {
  port: number;
  processId: number;
  timestamp: Date;
  type: 'main' | 'worker-upload' | 'worker-chat' | 'worker-general';
}

export class PortManager {
  private readonly PORT_RANGE_START = 5000;
  private readonly PORT_RANGE_END = 6000;
  private readonly LOCK_FILE_DIR = path.join(process.cwd(), '.ports');
  private readonly LOCK_FILE_PREFIX = 'port-';
  private readonly CLEANUP_INTERVAL = 30000; // 30 seconds
  private readonly PORT_TIMEOUT = 300000; // 5 minutes
  
  private assignedPort: number | null = null;
  private lockFile: string | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.ensureLockDirectory();
    this.startCleanup();
  }

  private ensureLockDirectory(): void {
    if (!fs.existsSync(this.LOCK_FILE_DIR)) {
      fs.mkdirSync(this.LOCK_FILE_DIR, { recursive: true });
    }
  }

  private startCleanup(): void {
    // Clean up stale port locks
    this.cleanupStaleLocks();
    
    // Start periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleLocks();
    }, this.CLEANUP_INTERVAL);
  }

  private cleanupStaleLocks(): void {
    try {
      const files = fs.readdirSync(this.LOCK_FILE_DIR);
      const now = Date.now();

      for (const file of files) {
        if (!file.startsWith(this.LOCK_FILE_PREFIX)) continue;

        const filePath = path.join(this.LOCK_FILE_DIR, file);
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const portInfo: PortInfo = JSON.parse(content);
          
          // Check if lock is stale (older than timeout)
          const lockAge = now - new Date(portInfo.timestamp).getTime();
          if (lockAge > this.PORT_TIMEOUT) {
            fs.unlinkSync(filePath);
            console.log(`🧹 Cleaned up stale port lock: ${portInfo.port}`);
            continue;
          }

          // Check if process is still running
          if (!this.isProcessRunning(portInfo.processId)) {
            fs.unlinkSync(filePath);
            console.log(`🧹 Cleaned up orphaned port lock: ${portInfo.port} (PID ${portInfo.processId})`);
          }
        } catch (error) {
          // If we can't read the file or parse it, remove it
          fs.unlinkSync(filePath);
        }
      }
    } catch (error) {
      console.warn('Error during port cleanup:', error);
    }
  }

  private isProcessRunning(pid: number): boolean {
    try {
      // Send signal 0 to check if process exists
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return false;
    }
  }

  private isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          resolve(true);
        } else {
          resolve(false);
        }
      });

      server.once('listening', () => {
        server.close();
        resolve(false);
      });

      server.listen(port, '0.0.0.0');
    });
  }

  private isPortLocked(port: number): boolean {
    const lockFile = path.join(this.LOCK_FILE_DIR, `${this.LOCK_FILE_PREFIX}${port}`);
    return fs.existsSync(lockFile);
  }

  private lockPort(port: number, type: PortInfo['type']): void {
    const lockFile = path.join(this.LOCK_FILE_DIR, `${this.LOCK_FILE_PREFIX}${port}`);
    const portInfo: PortInfo = {
      port,
      processId: process.pid,
      timestamp: new Date(),
      type,
    };

    fs.writeFileSync(lockFile, JSON.stringify(portInfo, null, 2));
    this.assignedPort = port;
    this.lockFile = lockFile;
  }

  private unlockPort(): void {
    if (this.lockFile && fs.existsSync(this.lockFile)) {
      fs.unlinkSync(this.lockFile);
      this.lockFile = null;
    }
    this.assignedPort = null;
  }

  public async assignPort(type: PortInfo['type'] = 'main', preferredPort?: number): Promise<number> {
    // If we already have a port assigned, return it
    if (this.assignedPort) {
      return this.assignedPort;
    }

    // Try preferred port first if specified
    if (preferredPort && preferredPort >= this.PORT_RANGE_START && preferredPort <= this.PORT_RANGE_END) {
      const inUse = await this.isPortInUse(preferredPort);
      const locked = this.isPortLocked(preferredPort);
      
      if (!inUse && !locked) {
        this.lockPort(preferredPort, type);
        console.log(`🔌 Assigned preferred port ${preferredPort} (${type})`);
        return preferredPort;
      } else {
        console.log(`⚠️  Preferred port ${preferredPort} is ${inUse ? 'in use' : 'locked'}`);
      }
    }

    // Try production/environment port if available
    const envPort = parseInt(process.env.PORT || '5000');
    if (envPort !== 5000 || process.env.NODE_ENV === 'production') {
      // In production or with custom PORT, use the environment port
      const inUse = await this.isPortInUse(envPort);
      if (!inUse) {
        this.lockPort(envPort, type);
        console.log(`🔌 Assigned environment port ${envPort} (${type})`);
        return envPort;
      }
    }

    // Find an available port in the range
    for (let port = this.PORT_RANGE_START; port <= this.PORT_RANGE_END; port++) {
      const inUse = await this.isPortInUse(port);
      const locked = this.isPortLocked(port);
      
      if (!inUse && !locked) {
        this.lockPort(port, type);
        console.log(`🔌 Assigned dynamic port ${port} (${type})`);
        return port;
      }
    }

    throw new Error(`No available ports in range ${this.PORT_RANGE_START}-${this.PORT_RANGE_END}`);
  }

  public getAssignedPort(): number | null {
    return this.assignedPort;
  }

  public getActivePorts(): PortInfo[] {
    try {
      const files = fs.readdirSync(this.LOCK_FILE_DIR);
      const ports: PortInfo[] = [];

      for (const file of files) {
        if (!file.startsWith(this.LOCK_FILE_PREFIX)) continue;

        try {
          const content = fs.readFileSync(path.join(this.LOCK_FILE_DIR, file), 'utf8');
          const portInfo: PortInfo = JSON.parse(content);
          
          // Only include if process is still running
          if (this.isProcessRunning(portInfo.processId)) {
            ports.push(portInfo);
          }
        } catch (error) {
          // Skip invalid files
        }
      }

      return ports.sort((a, b) => a.port - b.port);
    } catch (error) {
      console.warn('Error reading active ports:', error);
      return [];
    }
  }

  public async findWorkerPorts(): Promise<{ upload: number[], chat: number[], general: number[] }> {
    const activePorts = this.getActivePorts();
    
    return {
      upload: activePorts.filter(p => p.type === 'worker-upload').map(p => p.port),
      chat: activePorts.filter(p => p.type === 'worker-chat').map(p => p.port),
      general: activePorts.filter(p => p.type === 'worker-general').map(p => p.port),
    };
  }

  public generateWorkerUrls(): { upload: string[], chat: string[], general: string[] } {
    const workerPorts = this.getActivePorts();
    const baseUrl = process.env.NODE_ENV === 'development' ? 'http://localhost' : process.env.BASE_URL || 'http://localhost';
    
    return {
      upload: workerPorts.filter(p => p.type === 'worker-upload').map(p => `${baseUrl}:${p.port}`),
      chat: workerPorts.filter(p => p.type === 'worker-chat').map(p => `${baseUrl}:${p.port}`),
      general: workerPorts.filter(p => p.type === 'worker-general').map(p => `${baseUrl}:${p.port}`),
    };
  }

  public shutdown(): void {
    // Clean up our port lock
    this.unlockPort();
    
    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    console.log('🔌 Port manager shutdown complete');
  }

  // Static method to get next available port quickly
  public static async getAvailablePort(start: number = 5000, end: number = 6000): Promise<number> {
    const isPortFree = (port: number): Promise<boolean> => {
      return new Promise((resolve) => {
        const server = net.createServer();
        
        server.once('error', () => resolve(false));
        server.once('listening', () => {
          server.close();
          resolve(true);
        });

        server.listen(port);
      });
    };

    for (let port = start; port <= end; port++) {
      if (await isPortFree(port)) {
        return port;
      }
    }

    throw new Error(`No available ports in range ${start}-${end}`);
  }

  // Helper method for development script usage
  public static async createDevelopmentCluster(serverCount: number = 3): Promise<{
    mainPort: number;
    uploadPorts: number[];
    chatPorts: number[];
    generalPorts: number[];
  }> {
    const portManager = new PortManager();
    
    try {
      const mainPort = await portManager.assignPort('main');
      const uploadPorts: number[] = [];
      const chatPorts: number[] = [];
      const generalPorts: number[] = [];

      // Assign ports for different worker types
      const uploadCount = Math.ceil(serverCount * 0.3); // 30% upload workers
      const chatCount = Math.ceil(serverCount * 0.3);   // 30% chat workers  
      const generalCount = serverCount - uploadCount - chatCount; // Rest are general

      for (let i = 0; i < uploadCount; i++) {
        uploadPorts.push(await PortManager.getAvailablePort(5100, 5200));
      }

      for (let i = 0; i < chatCount; i++) {
        chatPorts.push(await PortManager.getAvailablePort(5200, 5300));
      }

      for (let i = 0; i < generalCount; i++) {
        generalPorts.push(await PortManager.getAvailablePort(5300, 5400));
      }

      return {
        mainPort,
        uploadPorts,
        chatPorts,
        generalPorts,
      };
    } finally {
      portManager.shutdown();
    }
  }
}

// Singleton instance for the current process
export const portManager = new PortManager();