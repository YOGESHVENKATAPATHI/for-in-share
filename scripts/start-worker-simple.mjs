#!/usr/bin/env node

// Production worker server launcher
// This file is designed to work in production without needing separate builds

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const workerType = process.argv[2] || process.env.WORKER_TYPE || 'general';
const customPort = process.argv[3] ? parseInt(process.argv[3]) : undefined;

if (!['upload', 'chat', 'general'].includes(workerType)) {
  console.error('❌ Invalid worker type. Use: upload, chat, or general');
  process.exit(1);
}

// Worker configurations
const workerConfigs = {
  upload: {
    maxConnections: 100,
    maxMemoryMB: 400,
    capabilities: ['file-upload', 'stream-processing'],
  },
  chat: {
    maxConnections: 2000,
    maxMemoryMB: 300,
    capabilities: ['websocket', 'real-time', 'messaging'],
  },
  general: {
    maxConnections: 1000,
    maxMemoryMB: 450,
    capabilities: ['api', 'websocket', 'file-upload', 'messaging'],
  },
};

class SimpleWorkerServer {
  constructor(type, config) {
    this.type = type;
    this.config = config;
    this.app = express();
    this.server = createServer(this.app);
    this.connections = 0;
    this.startTime = Date.now();
    
    this.setupRoutes();
    this.setupWebSocket();
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: 'healthy',
        type: this.type,
        timestamp: new Date().toISOString(),
        uptime: (Date.now() - this.startTime) / 1000,
        memory: process.memoryUsage(),
        connections: this.connections,
        capabilities: this.config.capabilities
      });
    });

    // Basic info endpoint
    this.app.get('/api/info', (req, res) => {
      res.json({
        type: this.type,
        maxConnections: this.config.maxConnections,
        maxMemoryMB: this.config.maxMemoryMB,
        capabilities: this.config.capabilities
      });
    });

    // Default route
    this.app.get('/', (req, res) => {
      res.json({
        message: `${this.type} worker server`,
        status: 'running',
        type: this.type
      });
    });
  }

  setupWebSocket() {
    if (this.config.capabilities.includes('websocket')) {
      this.wss = new WebSocketServer({ server: this.server });
      
      this.wss.on('connection', (ws) => {
        this.connections++;
        console.log(`🔌 WebSocket connection established (${this.connections} active)`);
        
        ws.on('close', () => {
          this.connections--;
          console.log(`🔌 WebSocket connection closed (${this.connections} active)`);
        });
        
        ws.on('message', (message) => {
          // Echo message back for testing
          ws.send(`Echo: ${message}`);
        });
      });
    }
  }

  async start() {
    const port = customPort || process.env.PORT || this.getDefaultPort();
    
    return new Promise((resolve) => {
      this.server.listen(port, () => {
        console.log(`🚀 ${this.type.toUpperCase()} worker server started on port ${port}`);
        console.log(`📊 Limits: ${this.config.maxConnections} connections, ${this.config.maxMemoryMB}MB memory`);
        console.log(`⚡ Capabilities: ${this.config.capabilities.join(', ')}`);
        resolve(true);
      });
    });
  }

  getDefaultPort() {
    const basePorts = {
      upload: 3001,
      chat: 3002,
      general: 3003
    };
    return basePorts[this.type] || 3000;
  }

  async shutdown() {
    console.log(`🔌 Shutting down ${this.type} worker server...`);
    
    if (this.wss) {
      this.wss.close();
    }
    
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log(`✅ ${this.type} worker server shutdown complete`);
        resolve(true);
      });
    });
  }

  getStats() {
    const memoryUsage = process.memoryUsage();
    return {
      type: this.type,
      connections: this.connections,
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024)
      },
      uptime: (Date.now() - this.startTime) / 1000,
      capabilities: this.config.capabilities
    };
  }
}

async function startWorker() {
  try {
    console.log(`🚀 Starting ${workerType} worker server...`);
    
    const config = workerConfigs[workerType];
    const worker = new SimpleWorkerServer(workerType, config);

    await worker.start();

    // Graceful shutdown handling
    process.on('SIGTERM', async () => {
      console.log('🔌 Received SIGTERM, shutting down worker...');
      await worker.shutdown();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('🔌 Received SIGINT, shutting down worker...');
      await worker.shutdown();
      process.exit(0);
    });

    // Log worker status periodically in development
    if (process.env.NODE_ENV === 'development') {
      setInterval(() => {
        const stats = worker.getStats();
        console.log(`📊 Worker Stats - Type: ${stats.type}, Memory: ${stats.memory.rss}MB, Connections: ${stats.connections}`);
      }, 60000); // Every minute
    }

  } catch (error) {
    console.error('❌ Failed to start worker server:', error);
    process.exit(1);
  }
}

startWorker();