

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { spawnSync } from 'child_process';
import { Client } from 'pg';
import http from 'http';

const proxyUrl = 'https://webproxier-ov6et6gpw-ogeshs-projects.vercel.app/api/proxy?url=';
const PORT = process.env.PORT || 3002; // Different port from updater
const KEEP_ALIVE_INTERVAL_MS = 30000; // Ping every 30 seconds to prevent shutdown
const MAIN_SERVER_URLS = (process.env.MAIN_SERVER_URLS || 'http://localhost:3000').split(',').map(url => url.trim()); // Main server URLs for keep-alive pings, comma-separated

async function extractUrls(mainUrl) {
  const encodedUrl = encodeURIComponent(mainUrl);
  const response = await fetch(proxyUrl + encodedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);

  const subUrls = new Set();

  // Extract all links from the page
  $('a').each((_, aElem) => {
    const href = $(aElem).attr('href');
    if (href) {
      let fullUrl = href;
      // If relative, convert to absolute
      if (href.startsWith('/')) {
        fullUrl = 'https://www.xvideos.com' + href;
      }
      // If it's a proxy link, extract the original URL
      const proxyPrefix = 'https://www.xvideos.com/api/proxy?url=';
      if (fullUrl.startsWith(proxyPrefix)) {
        try {
          const decoded = decodeURIComponent(fullUrl.slice(proxyPrefix.length));
          // Only add valid xvideos.com links
          if (decoded.startsWith('https://www.xvideos.com/')) {
            subUrls.add(decoded);
          }
        } catch (e) {
          // fallback: add the proxy url if decode fails
          subUrls.add(fullUrl);
        }
      } else if (fullUrl.startsWith('https://www.xvideos.com/')) {
        subUrls.add(fullUrl);
      }
    }
  });

  const subUrlsArr = Array.from(subUrls);
  console.log(`[SUBURLS] Extracted ${subUrlsArr.length} subUrls from page: ${mainUrl}`);
  if (subUrlsArr.length > 0) {
    console.log('[SUBURLS] List:', subUrlsArr);
  }
  // No thumbPairs needed anymore
  return { subUrls: subUrlsArr, thumbPairs: [] };
}

const url = process.argv[2];
if (!url) {
  console.error('Usage: node scripts/extract-urls.mjs <url>');
  process.exit(1);
}



// Main NeonDB for video mappings
const connectionString = 'postgresql://neondb_owner:npg_rjmolz6Ecn9T@ep-autumn-hall-aho0evwl-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const client = new Client({ connectionString });
// Helper NeonDB for suburl progress
const helperConnectionString = 'postgresql://neondb_owner:npg_04ecalVSoBdD@ep-autumn-hall-ahrwgygq-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const helperClient = new Client({ connectionString: helperConnectionString });

async function ensureTable() {
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

  // Helper table for suburl progress
  await helperClient.query(`
    CREATE TABLE IF NOT EXISTS suburl_progress (
      id SERIAL PRIMARY KEY,
      url TEXT UNIQUE,
      visited BOOLEAN DEFAULT FALSE
    );
  `);
}

const visited = new Set();


async function crawl(url) {
  // Always process the main URL (first crawl), skip only for subUrls
  if (visited.size > 0) {
    const { rows: helperRows } = await helperClient.query('SELECT visited FROM suburl_progress WHERE url = $1', [url]);
    if (helperRows.length > 0 && helperRows[0].visited) {
      logStatus(`[SKIP] Already visited (helper DB): ${url}`);
      return;
    }
  }
  visited.add(url);
  logStatus(`[OPEN] Fetching page: ${url}`);
  // Mark as visited in helper DB
  await helperClient.query('INSERT INTO suburl_progress (url, visited) VALUES ($1, TRUE) ON CONFLICT (url) DO UPDATE SET visited = TRUE', [url]);
  let result;
  try {
    result = await extractUrls(url);
    logStatus(`[EXTRACT] Extracted ${result.subUrls.length} subUrls, ${result.thumbPairs.length} thumb pairs from: ${url}`);
  } catch (e) {
    logStatus(`[ERROR] Error fetching ${url}: ${e.message}`);
    return;
  }

  // Save all subUrls to helper DB (deduped by url)
  for (const subUrl of result.subUrls) {
    await helperClient.query('INSERT INTO suburl_progress (url, visited) VALUES ($1, FALSE) ON CONFLICT (url) DO NOTHING', [subUrl]);
  }

  // Filter video URLs from subUrls (xvideos.com/video...)
  const videoUrlPattern = /^https:\/\/www\.xvideos\.com\/video/;
  const videoUrls = result.subUrls.filter(u => videoUrlPattern.test(u));

  // For each video URL, extract and save mapping
  for (const videoUrl of videoUrls) {
    // Check if video URL already exists in NeonDB (skip all extraction if present)
    const { rows: videoRows } = await client.query('SELECT 1 FROM video_mappings WHERE video = $1', [videoUrl]);
    if (videoRows.length > 0) {
      logStatus(`[SKIP] Duplicate video URL in NeonDB: ${videoUrl}`);
      continue;
    }

    logStatus(`[MAP] Processing video: ${videoUrl}`);

    // Extract m3u8/mp4 url and name from ld+json in head
    let m3u8Url = null;
    let mp4Url = null;
    let finalUrl = null;
    let videoName = null;
    let uploadDate = null;
    let tags = null;
    let imageUrl = null;
    try {
      const videoPageRes = await fetch(proxyUrl + encodeURIComponent(videoUrl), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      const videoHtml = await videoPageRes.text();
      const $video = cheerio.load(videoHtml);
      // Extract ld+json fields
      const ldJson = $video('script[type="application/ld+json"]').html();
      if (ldJson) {
        const meta = JSON.parse(ldJson);
        videoName = typeof meta.name === 'string' ? meta.name.trim() : null;
        uploadDate = typeof meta.uploadDate === 'string' ? meta.uploadDate.trim() : null;
        // Use thumbnailUrl for imageUrl
        if (meta.thumbnailUrl && Array.isArray(meta.thumbnailUrl) && meta.thumbnailUrl.length > 0) {
          imageUrl = meta.thumbnailUrl[0];
        } else if (typeof meta.thumbnailUrl === 'string') {
          imageUrl = meta.thumbnailUrl;
        }
        if (meta.contentUrl) {
          if (meta.contentUrl.endsWith('.m3u8')) {
            m3u8Url = meta.contentUrl;
          } else {
            mp4Url = meta.contentUrl;
          }
        }
      }
      // Decide which url to save: mp4 preferred, else m3u8
      if (mp4Url) {
        finalUrl = mp4Url;
      } else if (m3u8Url) {
        finalUrl = m3u8Url;
      }
      // Extract tags from body
      const tagEls = $video('.video-metadata.video-tags-list li a');
      if (tagEls.length > 0) {
        tags = Array.from(tagEls).map(el => $video(el).text().trim()).filter(Boolean).join(',');
      }
    } catch (err) {
      logStatus(`[ERROR] Failed to extract video meta for video: ${videoUrl} - ${err}`);
    }

    if (!videoName || !videoUrl || !imageUrl || !finalUrl) {
      logStatus(`[SKIP] Incomplete mapping for video: ${videoUrl}`);
      logStatus(`[DEBUG] Mapping fields: videoName=${JSON.stringify(videoName)}, videoUrl=${JSON.stringify(videoUrl)}, imageUrl=${JSON.stringify(imageUrl)}, url=${JSON.stringify(finalUrl)}, uploadDate=${JSON.stringify(uploadDate)}, tags=${JSON.stringify(tags)}`);
      continue;
    }

    // Deduplication by name in NeonDB
    const nameKey = videoName.toLowerCase().trim();
    // Check if name already exists in DB
    const { rows } = await client.query('SELECT 1 FROM video_mappings WHERE LOWER(TRIM(name)) = $1', [nameKey]);
    if (rows.length > 0) {
      logStatus(`[SKIP] Duplicate name in NeonDB: ${videoName}`);
      continue;
    }

    // Upsert mapping into NeonDB, always update last_updated
    await client.query(
      `INSERT INTO video_mappings (name, video, image, url, uploaddate, tags, last_updated) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (video) DO UPDATE SET name = EXCLUDED.name, image = EXCLUDED.image, url = EXCLUDED.url, uploaddate = EXCLUDED.uploaddate, tags = EXCLUDED.tags, last_updated = EXCLUDED.last_updated`,
      [videoName, videoUrl, imageUrl, finalUrl, uploadDate, tags, new Date().toISOString()]
    );
    logStatus(`[SAVE] Saved mapping to NeonDB: name=${videoName}, video=${videoUrl}, image=${imageUrl}, url=${finalUrl}, uploaddate=${uploadDate}, tags=${tags}`);

    // Log total number of records in NeonDB
    const { rows: countRows } = await client.query('SELECT COUNT(*) FROM video_mappings');
    const totalCount = countRows[0] ? countRows[0].count : 'unknown';
    logStatus(`[COUNT] Total records in NeonDB: ${totalCount}`);
  }

  // Recursively crawl all subUrls (not just video URLs)
  const allNextUrls = new Set(result.subUrls.filter(sub => sub.startsWith('https://www.xvideos.com')));
  for (const sub of allNextUrls) {
    if (!visited.has(sub)) {
      logStatus(`[CRAWL] Next URL: ${sub}`);
      await crawl(sub);
    }
  }
}





// Minimal HTTP server for Render web service compatibility with log buffer
const PORT = process.env.PORT || 3001;
let extractionStarted = false;
let extractionDone = false;
let extractionError = null;
const logBuffer = [];
const MAX_LOGS = 100;

function logStatus(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  logBuffer.push(line);
  if (logBuffer.length > MAX_LOGS) logBuffer.shift();
  // Always print to console for Render logs
  console.log(line);
}

async function keepAlivePing() {
  for (const serverUrl of MAIN_SERVER_URLS) {
    try {
      const response = await fetch(`${serverUrl}/api/ping`, {
        headers: {
          'User-Agent': 'URL-Extractor-KeepAlive',
          'X-Keep-Alive': 'true'
        },
        timeout: 5000
      });
      if (response.ok) {
        logStatus(`🔄 Keep-alive ping sent successfully to ${serverUrl}`);
      } else {
        logStatus(`⚠️ Keep-alive ping failed to ${serverUrl}: ${response.status}`);
      }
    } catch (error) {
      logStatus(`⚠️ Keep-alive ping error to ${serverUrl}: ${error.message}`);
    }
  }
}

// Periodically print extraction status
setInterval(() => {
  logStatus(
    `Status: started=${extractionStarted}, done=${extractionDone}, error=${!!extractionError}, visited=${visited.size}`
  );
}, 30000);

async function startExtraction() {
  if (extractionStarted) return;
  extractionStarted = true;
  try {
    await client.connect();
    await helperClient.connect();
    await ensureTable();
    // Use a promise queue to ensure all crawl operations finish before closing DB
    await crawl(url);
    extractionDone = true;
    await client.end();
    await helperClient.end();
    logStatus('Extraction complete. All mappings saved to NeonDB.');
  } catch (err) {
    extractionError = err;
    logStatus('Extraction error: ' + err);
  }
}

// Patch crawl to use logStatus
const origConsoleLog = console.log;
console.log = (...args) => {
  origConsoleLog(...args);
};

// Start extraction in background
if (url) startExtraction();

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  if (!url) {
    res.end('No extraction started. Please provide a URL as argument.');
    return;
  }
  if (extractionError) {
    res.end('Extraction error: ' + extractionError.toString() + '\n' + logBuffer.join('\n'));
    return;
  }
  if (extractionDone) {
    res.end('Extraction complete. All mappings saved to NeonDB.\n' + logBuffer.join('\n'));
    return;
  }
  res.end('Extraction in progress...\n' + logBuffer.join('\n'));
});

server.listen(PORT, () => {
  origConsoleLog(`Status server listening on port ${PORT}`);
  
  // Start keep-alive pings to prevent shutdown
  setInterval(keepAlivePing, KEEP_ALIVE_INTERVAL_MS);
  logStatus(`🔄 Keep-alive pings started (every ${KEEP_ALIVE_INTERVAL_MS/1000}s to ${MAIN_SERVER_URLS.length} servers)`);
});