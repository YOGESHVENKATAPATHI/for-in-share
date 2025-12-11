#!/usr/bin/env node

/**
 * Render Deployment Helper
 * Generates environment-specific configurations for Render deployment
 */

import { writeFileSync } from 'fs';
import { join } from 'path';

const environments = {
  production: {
    maxMemoryMB: 450,
    maxConnections: 1000,
    uploadConnections: 100,
    chatConnections: 2000,
    healthCheckInterval: 30000,
    gcInterval: 30000,
    loadBalanceStrategy: 'least-load'
  },
  staging: {
    maxMemoryMB: 400,
    maxConnections: 500,
    uploadConnections: 50,
    chatConnections: 1000,
    healthCheckInterval: 60000,
    gcInterval: 60000,
    loadBalanceStrategy: 'round-robin'
  }
};

function generateRenderConfig(env = 'production') {
  const config = environments[env];
  
  const renderConfigs = {
    // Primary server configuration
    primary: {
      services: [{
        type: 'web',
        name: `forum-primary-${env}`,
        env: 'node',
        plan: 'free',
        buildCommand: 'npm install && npm run build',
        startCommand: 'npm start',
        envVars: [
          { key: 'NODE_ENV', value: env },
          { key: 'MAX_MEMORY_MB', value: config.maxMemoryMB.toString() },
          { key: 'MAX_CONNECTIONS', value: config.maxConnections.toString() },
          { key: 'LOAD_BALANCE_STRATEGY', value: config.loadBalanceStrategy },
          { key: 'HEALTH_CHECK_INTERVAL', value: config.healthCheckInterval.toString() },
          { key: 'FORCE_GC_INTERVAL', value: config.gcInterval.toString() },
          // Database configuration
          { key: 'DATABASE_URL', sync: false },
          // Dropbox configuration
          { key: 'DROPBOX_APP_KEY', sync: false },
          { key: 'DROPBOX_APP_SECRET', sync: false },
          { key: 'DROPBOX_REFRESH_TOKEN', sync: false },
          // Worker server URLs (to be updated after deployment)
          { key: 'WORKER_SERVERS', value: 'UPDATE_AFTER_WORKER_DEPLOYMENT' },
          { key: 'UPLOAD_WORKERS', value: 'UPDATE_AFTER_WORKER_DEPLOYMENT' },
          { key: 'CHAT_WORKERS', value: 'UPDATE_AFTER_WORKER_DEPLOYMENT' }
        ]
      }]
    },

    // Upload worker configuration
    upload: {
      services: [{
        type: 'web',
        name: `forum-upload-${env}`,
        env: 'node',
        plan: 'free',
        buildCommand: 'npm install && npm run build',
        startCommand: 'npm run start:worker upload',
        envVars: [
          { key: 'NODE_ENV', value: env },
          { key: 'WORKER_TYPE', value: 'upload' },
          { key: 'MAX_MEMORY_MB', value: (config.maxMemoryMB - 50).toString() },
          { key: 'MAX_CONNECTIONS', value: config.uploadConnections.toString() },
          { key: 'HEALTH_CHECK_INTERVAL', value: config.healthCheckInterval.toString() },
          { key: 'FORCE_GC_INTERVAL', value: config.gcInterval.toString() },
          // Database configuration
          { key: 'DATABASE_URL', sync: false },
          // Dropbox configuration
          { key: 'DROPBOX_APP_KEY', sync: false },
          { key: 'DROPBOX_APP_SECRET', sync: false },
          { key: 'DROPBOX_REFRESH_TOKEN', sync: false }
        ]
      }]
    },

    // Chat worker configuration
    chat: {
      services: [{
        type: 'web',
        name: `forum-chat-${env}`,
        env: 'node',
        plan: 'free',
        buildCommand: 'npm install && npm run build',
        startCommand: 'npm run start:worker chat',
        envVars: [
          { key: 'NODE_ENV', value: env },
          { key: 'WORKER_TYPE', value: 'chat' },
          { key: 'MAX_MEMORY_MB', value: (config.maxMemoryMB - 150).toString() },
          { key: 'MAX_CONNECTIONS', value: config.chatConnections.toString() },
          { key: 'HEALTH_CHECK_INTERVAL', value: config.healthCheckInterval.toString() },
          { key: 'FORCE_GC_INTERVAL', value: config.gcInterval.toString() },
          // Database configuration (chat workers need database access)
          { key: 'DATABASE_URL', sync: false }
        ]
      }]
    },

    // General worker configuration
    general: {
      services: [{
        type: 'web',
        name: `forum-worker-${env}`,
        env: 'node',
        plan: 'free',
        buildCommand: 'npm install && npm run build',
        startCommand: 'npm run start:worker general',
        envVars: [
          { key: 'NODE_ENV', value: env },
          { key: 'WORKER_TYPE', value: 'general' },
          { key: 'MAX_MEMORY_MB', value: config.maxMemoryMB.toString() },
          { key: 'MAX_CONNECTIONS', value: config.maxConnections.toString() },
          { key: 'HEALTH_CHECK_INTERVAL', value: config.healthCheckInterval.toString() },
          { key: 'FORCE_GC_INTERVAL', value: config.gcInterval.toString() },
          // Database configuration
          { key: 'DATABASE_URL', sync: false },
          // Dropbox configuration
          { key: 'DROPBOX_APP_KEY', sync: false },
          { key: 'DROPBOX_APP_SECRET', sync: false },
          { key: 'DROPBOX_REFRESH_TOKEN', sync: false }
        ]
      }]
    }
  };

  return renderConfigs;
}

function generateDeploymentScript(env = 'production') {
  return `#!/bin/bash

# Render Deployment Script for ${env} environment
# Generated by deployment helper

echo "🚀 Starting Render deployment for ${env} environment..."

# Deployment order is important:
# 1. Deploy workers first
# 2. Deploy primary server last (with worker URLs)

echo "📋 Deployment Order:"
echo "1. Upload workers"
echo "2. Chat workers" 
echo "3. General workers"
echo "4. Primary server (update worker URLs first)"
echo ""

echo "⚠️  IMPORTANT:"
echo "After deploying workers, update the primary server environment variables:"
echo "WORKER_SERVERS=https://forum-worker-${env}.onrender.com"
echo "UPLOAD_WORKERS=https://forum-upload-${env}.onrender.com"  
echo "CHAT_WORKERS=https://forum-chat-${env}.onrender.com"
echo ""

echo "📊 Monitoring endpoints after deployment:"
echo "Health: https://forum-primary-${env}.onrender.com/api/health"
echo "Status: https://forum-primary-${env}.onrender.com/api/cluster/status"
echo "Metrics: https://forum-primary-${env}.onrender.com/api/cluster/metrics"
echo ""

echo "✅ Deployment configurations generated in render-configs/ directory"
echo "Upload each YAML file to Render for the respective service"
`;
}

// Generate configurations
const env = process.argv[2] || 'production';
console.log(`🔧 Generating Render configurations for ${env} environment...`);

const configs = generateRenderConfig(env);

// Create output directory
import { mkdirSync } from 'fs';
try {
  mkdirSync('render-configs', { recursive: true });
} catch (e) {
  // Directory might already exist
}

// Write configuration files
Object.entries(configs).forEach(([type, config]) => {
  const filename = `render-configs/${type}-${env}.yaml`;
  const yamlContent = `# Render configuration for ${type} server (${env})\n` + 
                     JSON.stringify(config, null, 2)
                       .replace(/"/g, '')
                       .replace(/,\n/g, '\n')
                       .replace(/{\n/g, '\n')
                       .replace(/}\n/g, '\n')
                       .replace(/\[\n/g, '\n')
                       .replace(/\]\n/g, '\n');
  
  writeFileSync(filename, yamlContent);
  console.log(`✅ Generated ${filename}`);
});

// Generate deployment script
const deployScript = generateDeploymentScript(env);
writeFileSync(`render-configs/deploy-${env}.sh`, deployScript);
console.log(`✅ Generated render-configs/deploy-${env}.sh`);

// Generate environment variables template
const envTemplate = `# Environment Variables Template for ${env}
# Copy these to your Render service environment variables

# Required for all services
NODE_ENV=${env}
DATABASE_URL=postgresql://user:pass@host:port/db1,postgresql://user:pass@host:port/db2

# Required for upload/general workers (comma-separated for multiple accounts)
DROPBOX_APP_KEY=key1,key2,key3
DROPBOX_APP_SECRET=secret1,secret2,secret3
DROPBOX_REFRESH_TOKEN=token1,token2,token3

# Worker server URLs (update after worker deployment)
WORKER_SERVERS=https://forum-worker-${env}.onrender.com
UPLOAD_WORKERS=https://forum-upload-${env}.onrender.com
CHAT_WORKERS=https://forum-chat-${env}.onrender.com

# Optional performance tuning
MAX_MEMORY_MB=${environments[env].maxMemoryMB}
MAX_CONNECTIONS=${environments[env].maxConnections}
LOAD_BALANCE_STRATEGY=${environments[env].loadBalanceStrategy}
HEALTH_CHECK_INTERVAL=${environments[env].healthCheckInterval}
FORCE_GC_INTERVAL=${environments[env].gcInterval}
`;

writeFileSync(`render-configs/environment-${env}.env`, envTemplate);
console.log(`✅ Generated render-configs/environment-${env}.env`);

console.log(`
🎉 Render deployment configurations generated successfully!

📁 Files created:
- render-configs/primary-${env}.yaml
- render-configs/upload-${env}.yaml  
- render-configs/chat-${env}.yaml
- render-configs/general-${env}.yaml
- render-configs/deploy-${env}.sh
- render-configs/environment-${env}.env

🚀 Next steps:
1. Review the generated YAML files
2. Upload each YAML to Render for the respective service
3. Follow the deployment order in deploy-${env}.sh
4. Update worker URLs in primary server after deployment

📖 For detailed instructions, see RENDER_DEPLOYMENT.md
`);