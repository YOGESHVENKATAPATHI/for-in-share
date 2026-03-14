import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();
import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { portManager } from "./port-manager";
import { memoryOptimizer } from "./memory-optimizer";
import { clusterManager } from "./cluster-manager";
import { loadBalancer } from "./load-balancer";
import { keepAliveService } from "./keep-alive";

const app = express();
const isVercelRuntime = process.env.VERCEL === '1' || process.env.VERCEL === 'true';

// Initialize memory optimization with keep-alive integration
if (!isVercelRuntime) {
  memoryOptimizer.on('memoryExhaustion', (data) => {
    console.error('🚨 Memory exhaustion detected:', data);
    // Emergency pause keep-alive service to reduce memory pressure
    keepAliveService.emergencyPause(120000); // 2 minutes pause
  });

  memoryOptimizer.on('memoryWarning', (data) => {
    console.warn('⚠️ Memory warning:', data);
    // Temporary pause keep-alive during memory warnings
    keepAliveService.emergencyPause(60000); // 1 minute pause
  });
}

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

// Add CORS headers for all requests
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
    'https://for-in-share.onrender.com'
  ];

  // Allow the request origin if it's in our allowed list, otherwise default to localhost for development
  const corsOrigin = (origin && allowedOrigins.includes(origin)) ? origin :
                     (process.env.NODE_ENV === 'production' ? 'https://for-in-share.onrender.com' : 'http://localhost:5173');

  res.header('Access-Control-Allow-Origin', corsOrigin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

export { app };
let isInitialized = false;
let initPromise: Promise<void> | null = null;

export const initApp = async () => {
  if (isInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const server = await registerRoutes(app);

    app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error('🔴 Detailed API Error:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
      errno: err.errno,
      syscall: err.syscall,
      hostname: err.hostname,
      url: req.url,
      method: req.method,
      user: req.user?.id,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      timestamp: new Date().toISOString(),
      process: {
        pid: process.pid,
        memory: process.memoryUsage(),
        uptime: process.uptime()
      },
      errorType: err.constructor.name
    });

      res.status(status).json({ message });
    });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

  // Use dynamic port assignment for development or environment port for production
    let port: number;
  
    if (process.env.NODE_ENV === 'production' && process.env.PORT) {
      port = parseInt(process.env.PORT, 10);
    } else {
      // Dynamic port assignment for development
      const preferredPort = parseInt(process.env.PORT || '5000', 10);
      port = await portManager.assignPort('main', preferredPort);
    }

  // Add cluster management middleware if workers are configured.
  // Skip this in Vercel serverless runtime.
    const hasWorkers = process.env.WORKER_SERVERS || process.env.UPLOAD_WORKERS || process.env.CHAT_WORKERS;
    if (hasWorkers && !isVercelRuntime) {
      app.use('/api', loadBalancer.getLoadBalanceMiddleware());
      log('🌐 Load balancer enabled for worker servers');
    }

  // Serve HLS files with CORS headers
    app.use('/hls', (req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET');
      next();
    }, express.static(path.join(__dirname, 'storage/hls')));

    if (!isVercelRuntime) {
      server.listen({
        port,
        host: "0.0.0.0", // Changed from "localhost" to "0.0.0.0" for Render
      }, () => {
        log(`🚀 Server running on port ${port}`);
      
      // Start keep-alive service for Render-like persistent deployments.
      // Vercel serverless does not support long-running keep-alive loops.
        const keepAliveEnabled = process.env.KEEP_ALIVE_ENABLED === 'true' || 
                   (process.env.KEEP_ALIVE_ENABLED !== 'false' && 
              (process.env.NODE_ENV === 'production' || process.env.RENDER_EXTERNAL_URL));
      
        if (keepAliveEnabled && !isVercelRuntime) {
          // Start keep-alive service after longer delay to ensure server is stable
          setTimeout(() => {
            keepAliveService.start(port);
          }, 15000); // Start after 15 seconds to let server fully stabilize
          log(`🔄 Keep-alive service will start with self-ping on port ${port}`);
        } else if (isVercelRuntime) {
          log('🔄 Keep-alive service disabled for Vercel runtime');
        } else {
          log('🔄 Keep-alive service disabled');
        }
      
        if (process.env.NODE_ENV === 'development') {
          log(`📊 Memory monitoring active (limit: ${memoryOptimizer.getMemoryStats().limit}MB)`);
        
        // Log cluster information in development
          const clusterMetrics = clusterManager.getClusterMetrics();
          if (clusterMetrics.totalServers > 0) {
            log(`🌐 Cluster: ${clusterMetrics.healthyServers}/${clusterMetrics.totalServers} workers healthy`);
          }
        }
      });

      // Graceful shutdown handling
      process.on('SIGTERM', async () => {
        console.log('🔌 Received SIGTERM, shutting down gracefully...');
        await gracefulShutdown();
      });

      process.on('SIGINT', async () => {
        console.log('🔌 Received SIGINT, shutting down gracefully...');
        await gracefulShutdown();
      });
    }

    async function gracefulShutdown() {
      try {
        // Close server
        server.close(() => {
          console.log('✅ HTTP server closed');
        });

        // Shutdown components
        if (!isVercelRuntime) {
          keepAliveService.stop();
          loadBalancer.shutdown();
          clusterManager.shutdown();
          memoryOptimizer.shutdown();
          portManager.shutdown();
        }

        console.log('✅ Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    }

    isInitialized = true;
  })();

  try {
    await initPromise;
  } catch (error) {
    // Allow retries on later invocations if startup fails once.
    isInitialized = false;
    initPromise = null;
    throw error;
  }
};

if (!isVercelRuntime) {
  initApp().catch(console.error);
}
