import { readFileSync } from 'fs';
import { Client } from 'pg';

const jsonPath = 'mapped-urls.json';
const connectionString = 'postgresql://neondb_owner:npg_rjmolz6Ecn9T@ep-autumn-hall-aho0evwl-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function migrateJsonToDb() {
  let mappings;
  try {
    mappings = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  } catch (e) {
    console.error('Could not read mapped-urls.json:', e.message);
    return;
  }

  const client = new Client({ connectionString });
  await client.connect();

  // Create table if not exists
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

  for (const entry of mappings) {
    if (!entry || !entry.name || !entry.video || !entry.image || !entry.m3u8) continue;
    try {
      await client.query(
        `INSERT INTO video_mappings (name, video, image, m3u8) VALUES ($1, $2, $3, $4)
         ON CONFLICT (video) DO UPDATE SET name = EXCLUDED.name, image = EXCLUDED.image, m3u8 = EXCLUDED.m3u8`,
        [entry.name, entry.video, entry.image, entry.m3u8]
      );
      console.log(`Inserted/Updated: ${entry.name}`);
    } catch (e) {
      console.error(`Error inserting ${entry.name}:`, e.message);
    }
  }

  await client.end();
  console.log('Migration complete.');
}

migrateJsonToDb();
