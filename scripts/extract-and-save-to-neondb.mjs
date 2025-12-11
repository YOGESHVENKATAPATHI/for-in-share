import { Client } from 'pg';
import { spawnSync } from 'child_process';

const connectionString = 'postgresql://neondb_owner:npg_rjmolz6Ecn9T@ep-autumn-hall-aho0evwl-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function extractAndSaveMapping({ videoUrl, imageUrl }) {
  // Extract m3u8 url
  const m3u8Proc = spawnSync('node', [
    'scripts/extract-m3u8-urls.mjs',
    videoUrl
  ], { encoding: 'utf-8' });
  let m3u8Url = null;
  if (m3u8Proc.stdout) {
    const m3u8Line = m3u8Proc.stdout.split(/\r?\n/).find(l => l.trim() && l.startsWith('http') && l.endsWith('.m3u8'));
    if (m3u8Line) m3u8Url = m3u8Line.trim();
  }
  // Extract video name
  const nameProc = spawnSync('node', [
    'scripts/extract-video-name.mjs',
    videoUrl
  ], { encoding: 'utf-8' });
  let videoName = null;
  if (nameProc.stdout) {
    const nameLine = nameProc.stdout.split(/\r?\n/).find(l => l.trim());
    if (nameLine) videoName = nameLine.trim();
  }
  if (!videoName || !videoUrl || !imageUrl || !m3u8Url) return null;
  return { name: videoName, video: videoUrl, image: imageUrl, m3u8: m3u8Url };
}

async function saveMappingToDb(mapping) {
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
  await client.query(
    `INSERT INTO video_mappings (name, video, image, m3u8) VALUES ($1, $2, $3, $4)
     ON CONFLICT (video) DO UPDATE SET name = EXCLUDED.name, image = EXCLUDED.image, m3u8 = EXCLUDED.m3u8`,
    [mapping.name, mapping.video, mapping.image, mapping.m3u8]
  );
  await client.end();
}

// Example usage: extract and save a single mapping
// You can adapt this for your recursive extraction logic
(async () => {
  // Replace with your extraction logic to get videoUrl and imageUrl
  const videoUrl = process.argv[2];
  const imageUrl = process.argv[3];
  if (!videoUrl || !imageUrl) {
    console.error('Usage: node scripts/extract-and-save-to-neondb.mjs <videoUrl> <imageUrl>');
    process.exit(1);
  }
  const mapping = await extractAndSaveMapping({ videoUrl, imageUrl });
  if (mapping) {
    await saveMappingToDb(mapping);
    console.log('Saved mapping to Neon DB:', mapping);
  } else {
    console.log('Mapping not valid, not saved.');
  }
})();
