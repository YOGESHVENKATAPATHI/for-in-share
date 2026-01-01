

import { Client } from 'pg';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import http from 'http';
import KeepAliveService from './keep-alive.mjs';


const connectionString = 'postgresql://neondb_owner:npg_rjmolz6Ecn9T@ep-autumn-hall-aho0evwl-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const PART = parseInt(process.env.PART || '1', 10); // 1, 2, or 3
const TOTAL_PARTS = parseInt(process.env.TOTAL_PARTS || '3', 10); // e.g., 3
const UPDATE_INTERVAL_MS = 60000;
const PORT = process.env.PORT || 3000;
const KEEP_ALIVE_INTERVAL_MS = parseInt(process.env.KEEP_ALIVE_INTERVAL_MS || '30000', 10);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10', 10);
const MAIN_SERVER_URLS = (process.env.MAIN_SERVER_URLS || 'http://localhost:3000').split(',').map(url => url.trim()); // Main server URLs for keep-alive pings, comma-separated
let updaterStarted = false;
let updaterError = null;
let lastUpdateCycle = null;
const logBuffer = [];
const MAX_LOGS = 100;

function logStatus(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  logBuffer.push(line);
  if (logBuffer.length > MAX_LOGS) logBuffer.shift();
  process.stdout.write(line + '\n');
}

// Use KeepAliveService helper for multi-server keep-alive
const keepAlive = new KeepAliveService({ intervalMs: KEEP_ALIVE_INTERVAL_MS, timeoutMs: parseInt(process.env.KEEP_ALIVE_TIMEOUT || '5000', 10) });
for (const s of MAIN_SERVER_URLS) {
  if (s) keepAlive.addServer(s);
}


function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}



async function updateM3u8UrlsPartitioned() {
  updaterStarted = true;
  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS video_mappings (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        video TEXT NOT NULL,
        image TEXT NOT NULL,
        url TEXT,
        uploaddate TEXT,
        tags TEXT,
        last_updated TIMESTAMP,
        UNIQUE (video)
      );
    `);
    // Ensure all columns exist (for migrations)
    const columns = [
      { name: 'url', type: 'TEXT' },
      { name: 'uploaddate', type: 'TEXT' },
      { name: 'tags', type: 'TEXT' },
      { name: 'uploadedby', type: 'TEXT' },
      { name: 'size', type: 'BIGINT' },
      { name: 'type', type: 'TEXT' }
    ];
    for (const col of columns) {
      await client.query(`ALTER TABLE video_mappings ADD COLUMN IF NOT EXISTS ${col.name} ${col.type};`);
    }
    while (true) {
      // Partition logic: get all IDs, split into parts
      const { rows: allRows } = await client.query('SELECT id FROM video_mappings ORDER BY id');
      if (allRows.length === 0) {
        logStatus('No mappings found. Sleeping...');
        await sleep(UPDATE_INTERVAL_MS);
        continue;
      }
      const partSize = Math.ceil(allRows.length / TOTAL_PARTS);
      const start = (PART - 1) * partSize;
      const end = Math.min(PART * partSize, allRows.length);
      const partitionRows = allRows.slice(start, end);
      logStatus('All records in this partition:');
      for (const r of partitionRows) {
        logStatus(`  id: ${r.id}`);
      }
      const ids = partitionRows.map(r => r.id);
      if (ids.length === 0) {
        await sleep(UPDATE_INTERVAL_MS);
        continue;
      }
      // Get up to BATCH_SIZE records in this partition needing update, ordered by last_updated (NULLS FIRST)
      let { rows } = await client.query(
        `SELECT * FROM video_mappings WHERE id = ANY($1) AND (last_updated IS NULL OR last_updated < NOW() - INTERVAL '2 hours') ORDER BY last_updated NULLS FIRST LIMIT $2`,
        [ids, BATCH_SIZE]
      );
      // If there are fewer than BATCH_SIZE records in this partition, top-up from other partitions
      if (rows.length < BATCH_SIZE) {
        const remaining = BATCH_SIZE - rows.length;
        logStatus(`Partition returned ${rows.length}/${BATCH_SIZE} rows. Topping up ${remaining} rows from other partitions...`);
        const { rows: extraRows } = await client.query(
          `SELECT * FROM video_mappings WHERE (last_updated IS NULL OR last_updated < NOW() - INTERVAL '2 hours') AND NOT (id = ANY($1)) ORDER BY last_updated NULLS FIRST LIMIT $2`,
          [ids, remaining]
        );
        if (extraRows && extraRows.length > 0) rows = rows.concat(extraRows);
      }
      // If still none, try to take over other partitions entirely (no partition restriction)
      if (rows.length === 0) {
        logStatus('No mappings in any partition need update. Sleeping...');
        await sleep(UPDATE_INTERVAL_MS);
        continue;
      }
      logStatus('Records filtered for update (null/oldest):');
      rows.forEach(r => {
        logStatus(`  id: ${r.id}, name: ${r.name}, last_updated: ${r.last_updated}`);
      });
      for (const entry of rows) {
        if (!entry || !entry.video) continue;
        let mp4Url = null;
        let m3u8Url = null;
        let finalUrl = null;
        try {
          // Fetch the video page and parse ld+json
          const proxyUrl = 'https://webproxier-ov6et6gpw-ogeshs-projects.vercel.app/api/proxy?url=';
          const videoPageRes = await fetch(proxyUrl + encodeURIComponent(entry.video), {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
          });
          const videoHtml = await videoPageRes.text();
          const $video = cheerio.load(videoHtml);
          const ldJson = $video('script[type="application/ld+json"]').html();
          if (ldJson) {
            const meta = JSON.parse(ldJson);
            if (meta.contentUrl) {
              if (meta.contentUrl.endsWith('.m3u8')) {
                m3u8Url = meta.contentUrl;
              } else {
                mp4Url = meta.contentUrl;
              }
            }
          }
          if (mp4Url) {
            finalUrl = mp4Url;
          } else if (m3u8Url) {
            finalUrl = m3u8Url;
          }
        } catch (err) {
          logStatus(`[ERROR] Failed to extract video meta for video: ${entry.video} - ${err}`);
        }
        if (finalUrl && entry.url !== finalUrl) {
          logStatus(`Updated url for: ${entry.name}`);
          await client.query(
            `UPDATE video_mappings SET url = $1, last_updated = NOW() WHERE id = $2`,
            [finalUrl, entry.id]
          );
          logStatus('NeonDB updated with new url.');
        } else {
          await client.query(
            `UPDATE video_mappings SET last_updated = NOW() WHERE id = $1`,
            [entry.id]
          );
          logStatus(`No url update for: ${entry.name}`);
        }
      }
      lastUpdateCycle = new Date();
      await sleep(UPDATE_INTERVAL_MS);
    }
  } catch (err) {
    updaterError = err;
    logStatus('Updater error: ' + err);
  }
}

// Start updater in background
updateM3u8UrlsPartitioned();

// Minimal HTTP server for Render web service compatibility with log buffer
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  if (updaterError) {
    res.end('Updater error: ' + updaterError.toString() + '\n' + logBuffer.join('\n'));
    return;
  }
  if (!updaterStarted) {
    res.end('Updater not started.');
    return;
  }
  const kaStatus = keepAlive.getStatus();
  res.end('Updater running. Last update cycle: ' + (lastUpdateCycle ? lastUpdateCycle.toISOString() : 'never') + '\n' + JSON.stringify(kaStatus, null, 2) + '\n' + logBuffer.join('\n'));
});

server.listen(PORT, () => {
  logStatus(`Status server listening on port ${PORT}`);
  keepAlive.start();
  logStatus(`🔄 Keep-alive pings started (every ${KEEP_ALIVE_INTERVAL_MS/1000}s to ${MAIN_SERVER_URLS.length} servers)`);
});

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
