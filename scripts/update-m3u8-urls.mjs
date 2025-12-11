
import { Client } from 'pg';
import { spawnSync } from 'child_process';

const connectionString = 'postgresql://neondb_owner:npg_rjmolz6Ecn9T@ep-autumn-hall-aho0evwl-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const UPDATE_INTERVAL_MS = 60000;
const UPDATE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours


function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}


async function updateM3u8Urls() {
  const client = new Client({ connectionString });
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS video_mappings (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      video TEXT NOT NULL,
      image TEXT NOT NULL,
      m3u8 TEXT NOT NULL,
      UNIQUE (video)
    );
  `);
  // Ensure last_updated column exists
  try {
    await client.query(`ALTER TABLE video_mappings ADD COLUMN IF NOT EXISTS last_updated TIMESTAMP`);
  } catch (e) {
    // Ignore if already exists
  }
  while (true) {
    // Find one entry where last_updated is null or older than 2 hours
    const { rows } = await client.query(
      `SELECT * FROM video_mappings WHERE last_updated IS NULL OR last_updated < NOW() - INTERVAL '2 hours' LIMIT 1`
    );
    if (rows.length === 0) {
      console.log('No mappings need update. Sleeping...');
      await sleep(UPDATE_INTERVAL_MS);
      continue;
    }
    const entry = rows[0];
    if (!entry || !entry.video) {
      await sleep(UPDATE_INTERVAL_MS);
      continue;
    }
    const m3u8Proc = spawnSync('node', [
      'scripts/extract-m3u8-urls.mjs',
      entry.video
    ], { encoding: 'utf-8' });
    let newM3u8 = null;
    if (m3u8Proc.stdout) {
      const m3u8Line = m3u8Proc.stdout.split(/\r?\n/).find(l => l.trim() && l.startsWith('http') && l.endsWith('.m3u8'));
      if (m3u8Line) newM3u8 = m3u8Line.trim();
    }
    if (newM3u8 && entry.m3u8 !== newM3u8) {
      console.log(`Updated m3u8 for: ${entry.name}`);
      await client.query(
        `UPDATE video_mappings SET m3u8 = $1, last_updated = NOW() WHERE id = $2`,
        [newM3u8, entry.id]
      );
      console.log('NeonDB updated with new m3u8 URL.');
    } else {
      // Still update last_updated timestamp even if m3u8 is unchanged
      await client.query(
        `UPDATE video_mappings SET last_updated = NOW() WHERE id = $1`,
        [entry.id]
      );
      console.log(`No m3u8 update for: ${entry.name}`);
    }
    await sleep(UPDATE_INTERVAL_MS);
  }
}

updateM3u8Urls();
