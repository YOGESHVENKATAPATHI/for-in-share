#!/usr/bin/env node
/**
 * Automated Metadata Update Web Service
 *
 * This service continuously updates existing video records in the Neon DB
 * with missing metadata (uploadedby, size, type) by fetching from video URLs.
 *
 * For Render deployment:
 * - Set PORT environment variable (defaults to 3002)
 * - Set MAIN_SERVER_URLS to comma-separated list of servers to ping for keep-alive
 * - Set KEEP_ALIVE_INTERVAL_MS for ping interval (default 30000ms)
 * - The service will run continuously and provide status at the root endpoint
 *
 * Usage: npm run update-metadata
 */

import fetch from 'node-fetch';
import { Client } from 'pg';
import http from 'http';
import KeepAliveService from './keep-alive.mjs';

// Neon DB connection string
const connectionString = 'postgresql://neondb_owner:npg_rjmolz6Ecn9T@ep-autumn-hall-aho0evwl-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const proxyUrl = 'https://webproxier-ov6et6gpw-ogeshs-projects.vercel.app/api/proxy?url=';

// Keep-alive configuration
const KEEP_ALIVE_INTERVAL_MS = parseInt(process.env.KEEP_ALIVE_INTERVAL_MS || '30000', 10); // Ping every 30 seconds to prevent shutdown
const MAIN_SERVER_URLS = (process.env.MAIN_SERVER_URLS || 'http://localhost:3000').split(',').map(url => url.trim()); // Main server URLs for keep-alive pings, comma-separated

// Utility function to fetch metadata (adapted from admin routes)
const fetchMetadataUtil = async (url, useProxy = false) => {
  const targetUrl = useProxy ? `${proxyUrl}${encodeURIComponent(url)}` : url;
  const method = 'HEAD';

  console.log(`🌐 [METADATA] Attempting ${useProxy ? 'proxy' : 'direct'} fetch:`, {
    originalUrl: url,
    targetUrl: useProxy ? targetUrl : url,
    method,
    useProxy
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.warn(`⏰ [METADATA] Timeout for ${useProxy ? 'proxy' : 'direct'} request:`, url);
      controller.abort();
    }, 15000); // 15 second timeout

    const response = await fetch(targetUrl, {
      method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'video/webm,video/mp4,video/*,application/vnd.apple.mpegurl,application/x-mpegURL,*/*;q=0.9'
      },
      signal: controller.signal,
      redirect: 'follow'
    });

    clearTimeout(timeoutId);

    console.log(`📥 [METADATA] Response received:`, {
      status: response.status,
      statusText: response.statusText,
      useProxy,
      url,
      headers: {
        'content-type': response.headers.get('content-type'),
        'content-length': response.headers.get('content-length'),
        'content-range': response.headers.get('content-range')
      }
    });

    if (response.ok || response.status === 206) {
      const contentLength = response.headers.get('content-length');
      const contentType = response.headers.get('content-type');

      // Close the response to avoid downloading content
      if (response.body) {
        response.body.cancel?.().catch(() => {});
      }

      const metadata = {
        fileSize: contentLength ? parseInt(contentLength) : 0,
        mimeType: contentType || ''
      };

      console.log(`✅ [METADATA] Successfully fetched metadata ${useProxy ? 'via proxy' : 'directly'}:`, {
        ...metadata,
        url
      });

      return metadata;
    } else {
      console.warn(`⚠️ [METADATA] Bad response status ${useProxy ? 'via proxy' : 'directly'}:`, {
        status: response.status,
        statusText: response.statusText,
        url
      });
    }
  } catch (fetchError) {
    console.warn(`❌ [METADATA] Failed to fetch ${useProxy ? 'via proxy' : 'directly'}:`, {
      error: fetchError.message,
      code: fetchError.code,
      url,
      useProxy
    });
  }

  return null;
};

async function ensureTableColumns(client) {
  // Ensure columns exist
  const columns = [
    { name: 'uploadedby', type: 'TEXT' },
    { name: 'size', type: 'BIGINT' },
    { name: 'type', type: 'TEXT' }
  ];
  for (const col of columns) {
    await client.query(`ALTER TABLE video_mappings ADD COLUMN IF NOT EXISTS ${col.name} ${col.type};`);
  }
}

async function updateExistingRecords() {
  const client = new Client({ connectionString });
  await client.connect();
  await ensureTableColumns(client);

  logStatus('[UPDATE] Starting to update existing records with metadata...');

  // Get records that need updating (missing uploadedby, size, or type)
  const { rows } = await client.query(`
    SELECT id, url, name, uploadedby, size, type
    FROM video_mappings
    WHERE url IS NOT NULL
      AND url != ''
      AND (uploadedby IS NULL OR size IS NULL OR type IS NULL)
    LIMIT 50
  `);

  logStatus(`[UPDATE] Found ${rows.length} records that need updating`);

  let updatedCount = 0;
  let errorCount = 0;

  for (const row of rows) {
    try {
      logStatus(`[UPDATE] Processing record ${row.id}: ${row.name}`);

      // Fetch metadata
      let metadata = await fetchMetadataUtil(row.url, false);
      if (!metadata) {
        metadata = await fetchMetadataUtil(row.url, true);
      }

      if (metadata) {
        // Build dynamic update query based on which fields are null
        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (row.uploadedby === null) {
          updates.push(`uploadedby = $${paramIndex++}`);
          values.push('XMaster');
        }
        if (row.size === null) {
          updates.push(`size = $${paramIndex++}`);
          values.push(metadata.fileSize);
        }
        if (row.type === null) {
          updates.push(`type = $${paramIndex++}`);
          values.push(metadata.mimeType);
        }

        // Always update last_updated
        updates.push(`last_updated = $${paramIndex++}`);
        values.push(new Date().toISOString());

        // Add the id at the end
        values.push(row.id);

        const updateQuery = `
          UPDATE video_mappings
          SET ${updates.join(', ')}
          WHERE id = $${paramIndex - 1}
        `;

        await client.query(updateQuery, values);

        const updatedFields = [];
        if (row.uploadedby === null) updatedFields.push('uploadedby');
        if (row.size === null) updatedFields.push(`size: ${metadata.fileSize} bytes`);
        if (row.type === null) updatedFields.push(`type: ${metadata.mimeType}`);

        updatedCount++;
        logStatus(`[UPDATE] Updated record ${row.id}: ${updatedFields.join(', ')}`);
      } else {
        logStatus(`[UPDATE] Failed to fetch metadata for record ${row.id}: ${row.url}`);
        errorCount++;
      }

      // Small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (err) {
      logStatus(`[UPDATE] Error updating record ${row.id}:`, err.message);
      errorCount++;
    }
  }

  await client.end();

  logStatus(`[UPDATE] Completed: ${updatedCount} updated, ${errorCount} errors`);
  return { updatedCount, errorCount };
}

// Global state for web service
let updateStarted = false;
let updateError = null;
const logBuffer = [];
const MAX_LOGS = 100;
let totalUpdated = 0;
let totalErrors = 0;
let cycles = 0;

// Minimal HTTP server for Render web service compatibility with log buffer
const PORT = process.env.PORT || 3002;

function logStatus(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  logBuffer.push(line);
  if (logBuffer.length > MAX_LOGS) logBuffer.shift();
  // Always print to console for Render logs
  console.log(line);
}

// KeepAliveService handles pinging multiple servers
const keepAlive = new KeepAliveService({ intervalMs: KEEP_ALIVE_INTERVAL_MS, timeoutMs: parseInt(process.env.KEEP_ALIVE_TIMEOUT || '5000', 10) });
for (const s of MAIN_SERVER_URLS) {
  if (s) keepAlive.addServer(s);
}

// Run continuous metadata updates
async function runContinuousUpdates() {
  if (updateStarted) return;
  updateStarted = true;

  logStatus('Starting continuous metadata update service...');

  while (true) {
    cycles++;
    logStatus(`\n=== Cycle ${cycles} ===`);

    try {
      const result = await updateExistingRecords();
      totalUpdated += result.updatedCount;
      totalErrors += result.errorCount;

      logStatus(`[CYCLE] Cycle ${cycles} completed. Total so far: ${totalUpdated} updated, ${totalErrors} errors`);

      if (result.updatedCount === 0) {
        logStatus('[CYCLE] No more records to update. Waiting 5 minutes before next check...');
        await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000)); // Wait 5 minutes
      } else {
        logStatus('[CYCLE] Records updated. Waiting 1 minute before next cycle...');
        await new Promise(resolve => setTimeout(resolve, 60 * 1000)); // Wait 1 minute
      }

    } catch (err) {
      updateError = err;
      logStatus('[CYCLE] Error in update cycle:', err.message);
      totalErrors++;
      // Wait 2 minutes before retrying on error
      await new Promise(resolve => setTimeout(resolve, 2 * 60 * 1000));
    }
  }
}

// Start continuous updates in background
runContinuousUpdates().catch(err => {
  updateError = err;
  logStatus('Continuous update error:', err.message);
});

// Periodically print service status
setInterval(() => {
  logStatus(
    `Status: started=${updateStarted}, error=${!!updateError}, cycles=${cycles}, totalUpdated=${totalUpdated}, totalErrors=${totalErrors}`
  );
}, 30000);

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });

  if (updateError) {
    res.end('Update service error: ' + updateError.toString() + '\n' + logBuffer.join('\n'));
    return;
  }

  const kaStatus = keepAlive.getStatus();
  const status = {
    service: 'automate-metadata-update',
    started: updateStarted,
    error: !!updateError,
    cycles: cycles,
    totalUpdated: totalUpdated,
    totalErrors: totalErrors,
    uptime: process.uptime(),
    keepAlive: kaStatus
  };

  res.end('Metadata Update Service Status:\n' + JSON.stringify(status, null, 2) + '\n\nRecent Logs:\n' + logBuffer.join('\n'));
});

server.listen(PORT, () => {
  console.log(`Metadata update service listening on port ${PORT}`);
  // Start keep-alive pings to prevent shutdown
  keepAlive.start();
  logStatus(`🔄 Keep-alive pings started (every ${KEEP_ALIVE_INTERVAL_MS/1000}s to ${MAIN_SERVER_URLS.length} servers)`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logStatus('Process SIGINT received, stopping keep-alive');
  keepAlive.stop();
  process.exit();
});
process.on('SIGTERM', () => {
  logStatus('Process SIGTERM received, stopping keep-alive');
  keepAlive.stop();
  process.exit();
});