#!/usr/bin/env node
import { createWorkerServer } from '../server/worker-server.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const workerType = process.argv[2] || 'general';
const customPort = process.argv[3] ? parseInt(process.argv[3]) : undefined;

if (!['upload', 'chat', 'general'].includes(workerType)) {
  console.error('❌ Invalid worker type. Use: upload, chat, or general');
  process.exit(1);
}

async function startWorker() {
  try {
    console.log(`🚀 Starting ${workerType} worker server...`);
    
    const worker = createWorkerServer(workerType, {
      port: customPort
    });

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