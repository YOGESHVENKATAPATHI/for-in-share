#!/usr/bin/env node

/**
 * Worker URL Configuration Helper
 * Generates environment configurations for different deployment scenarios
 */

const scenarios = {
  'render-free': {
    description: 'Render Free Tier (5 services max)',
    template: {
      WORKER_SERVERS: 'https://forum-worker-1.onrender.com,https://forum-worker-2.onrender.com',
      UPLOAD_WORKERS: 'https://forum-upload.onrender.com',
      CHAT_WORKERS: 'https://forum-chat.onrender.com'
    }
  },
  'render-paid': {
    description: 'Render Paid Tier (scalable)',
    template: {
      WORKER_SERVERS: 'https://forum-worker-1.onrender.com,https://forum-worker-2.onrender.com,https://forum-worker-3.onrender.com',
      UPLOAD_WORKERS: 'https://forum-upload-1.onrender.com,https://forum-upload-2.onrender.com',
      CHAT_WORKERS: 'https://forum-chat-1.onrender.com,https://forum-chat-2.onrender.com'
    }
  },
  'vercel': {
    description: 'Vercel Deployment',
    template: {
      WORKER_SERVERS: 'https://forum-worker-1.vercel.app,https://forum-worker-2.vercel.app',
      UPLOAD_WORKERS: 'https://forum-upload.vercel.app',
      CHAT_WORKERS: 'https://forum-chat.vercel.app'
    }
  },
  'railway': {
    description: 'Railway Deployment',
    template: {
      WORKER_SERVERS: 'https://forum-worker-1.railway.app,https://forum-worker-2.railway.app',
      UPLOAD_WORKERS: 'https://forum-upload.railway.app',
      CHAT_WORKERS: 'https://forum-chat.railway.app'
    }
  },
  'mixed-cloud': {
    description: 'Multi-Cloud Setup',
    template: {
      WORKER_SERVERS: 'https://worker1.render.com,https://worker2.vercel.app,https://worker3.railway.app',
      UPLOAD_WORKERS: 'https://upload1.render.com,https://upload2.fly.io',
      CHAT_WORKERS: 'https://chat1.render.com'
    }
  },
  'local': {
    description: 'Local Development',
    template: {
      WORKER_DISCOVERY_MODE: 'local',
      LOCAL_BASE_PORT: '5000'
    }
  }
};

function generateConfiguration(scenario) {
  console.log(`\n🔧 Configuration for: ${scenarios[scenario]?.description || scenario}`);
  console.log('=' .repeat(50));
  
  const template = scenarios[scenario]?.template;
  if (!template) {
    console.log('❌ Unknown scenario. Available scenarios:');
    Object.keys(scenarios).forEach(s => {
      console.log(`  - ${s}: ${scenarios[s].description}`);
    });
    return;
  }

  console.log('\n📋 Environment Variables:');
  console.log('```bash');
  Object.entries(template).forEach(([key, value]) => {
    console.log(`${key}=${value}`);
  });
  console.log('```');

  console.log('\n📝 Instructions:');
  if (scenario === 'local') {
    console.log('1. Use these variables for local development');
    console.log('2. Run: npm run dev:cluster');
  } else {
    console.log('1. Deploy worker services first');
    console.log('2. Update URLs in the template above with actual service URLs');
    console.log('3. Set these environment variables in your primary server');
    console.log('4. Deploy primary server');
  }
}

function generateRenderYAML(serviceName, workerType) {
  const configs = {
    upload: {
      name: `${serviceName}-upload`,
      startCommand: 'npm run start:worker upload',
      maxMemory: 400,
      maxConnections: 100,
      envVars: ['DATABASE_URL', 'DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET', 'DROPBOX_REFRESH_TOKEN']
    },
    chat: {
      name: `${serviceName}-chat`,
      startCommand: 'npm run start:worker chat',
      maxMemory: 300,
      maxConnections: 2000,
      envVars: ['DATABASE_URL']
    },
    general: {
      name: `${serviceName}-worker`,
      startCommand: 'npm run start:worker general',
      maxMemory: 450,
      maxConnections: 1000,
      envVars: ['DATABASE_URL', 'DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET', 'DROPBOX_REFRESH_TOKEN']
    },
    primary: {
      name: `${serviceName}-primary`,
      startCommand: 'npm start',
      maxMemory: 450,
      maxConnections: 1000,
      envVars: ['DATABASE_URL', 'DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET', 'DROPBOX_REFRESH_TOKEN', 'WORKER_SERVERS', 'UPLOAD_WORKERS', 'CHAT_WORKERS']
    }
  };

  const config = configs[workerType];
  if (!config) {
    console.log('❌ Unknown worker type. Use: upload, chat, general, or primary');
    return;
  }

  console.log(`\n🔧 Render YAML Configuration for ${workerType} worker:`);
  console.log('```yaml');
  console.log(`services:`);
  console.log(`  - type: web`);
  console.log(`    name: ${config.name}`);
  console.log(`    env: node`);
  console.log(`    plan: free`);
  console.log(`    buildCommand: npm install && npm run build`);
  console.log(`    startCommand: ${config.startCommand}`);
  console.log(`    envVars:`);
  console.log(`      - key: NODE_ENV`);
  console.log(`        value: production`);
  console.log(`      - key: WORKER_TYPE`);
  console.log(`        value: ${workerType}`);
  console.log(`      - key: MAX_MEMORY_MB`);
  console.log(`        value: ${config.maxMemory}`);
  console.log(`      - key: MAX_CONNECTIONS`);
  console.log(`        value: ${config.maxConnections}`);
  
  config.envVars.forEach(envVar => {
    console.log(`      - key: ${envVar}`);
    console.log(`        sync: false`);
  });
  
  console.log('```');
}

async function testCurrentConfig() {
  console.log('\n🔍 Testing Current Configuration');
  console.log('=' .repeat(30));
  
  // Parse environment variables directly
  const workerServers = (process.env.WORKER_SERVERS || '').split(',').filter(Boolean);
  const uploadWorkers = (process.env.UPLOAD_WORKERS || '').split(',').filter(Boolean);
  const chatWorkers = (process.env.CHAT_WORKERS || '').split(',').filter(Boolean);
  
  const allWorkers = [...workerServers, ...uploadWorkers, ...chatWorkers];
  
  console.log('📊 Current Configuration:');
  console.log({
    workerServers: workerServers.length,
    uploadWorkers: uploadWorkers.length, 
    chatWorkers: chatWorkers.length,
    totalWorkers: allWorkers.length,
    discoveryMode: process.env.WORKER_DISCOVERY_MODE || 'auto'
  });
  
  if (allWorkers.length === 0) {
    console.log('⚠️ No worker URLs configured. Using local development mode.');
    return true;
  }
  
  console.log('\n🏥 Health Check Results:');
  const results = await testWorkerConnectivity(allWorkers);
  
  const healthy = Object.values(results).filter(Boolean).length;
  console.log(`📊 Results: ${healthy}/${allWorkers.length} workers healthy`);
  
  Object.entries(results).forEach(([url, isHealthy]) => {
    console.log(`  ${isHealthy ? '✅' : '❌'} ${url}`);
  });
  
  return healthy > 0;
}

async function testWorkerConnectivity(urls) {
  const results = {};
  
  const tests = urls.map(async (url) => {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${url}/api/health`, {
        signal: controller.signal
      });
      
      results[url] = response.ok;
    } catch (error) {
      results[url] = false;
    }
  });
  
  await Promise.all(tests);
  return results;
}

// Command line interface
const command = process.argv[2];
const argument = process.argv[3];

async function main() {
  console.log('🌐 Worker URL Configuration Helper');
  
  switch (command) {
    case 'generate':
      generateConfiguration(argument || 'render-free');
      break;
      
    case 'yaml':
      generateRenderYAML(process.argv[3] || 'forum', process.argv[4] || 'general');
      break;
      
    case 'test':
      await testCurrentConfig();
      break;
      
    case 'scenarios':
      console.log('\n📋 Available Scenarios:');
      Object.entries(scenarios).forEach(([key, config]) => {
        console.log(`  ${key}: ${config.description}`);
      });
      break;
      
    default:
      console.log('\n📖 Usage:');
      console.log('  node scripts/worker-url-helper.mjs generate [scenario]');
      console.log('  node scripts/worker-url-helper.mjs yaml [service-name] [worker-type]');
      console.log('  node scripts/worker-url-helper.mjs test');
      console.log('  node scripts/worker-url-helper.mjs scenarios');
      console.log('\nExamples:');
      console.log('  node scripts/worker-url-helper.mjs generate render-free');
      console.log('  node scripts/worker-url-helper.mjs yaml forum upload');
      console.log('  node scripts/worker-url-helper.mjs test');
      break;
  }
}

main().catch(console.error);