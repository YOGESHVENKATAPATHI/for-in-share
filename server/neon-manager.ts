import { Client } from 'pg';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

// Manage Neon DB connection strings via env DATABASE_URL and optional Airtable table.
export async function getNeonDbUrls(opts?: { includeEnv?: boolean; includeBackup?: boolean; includeAirtable?: boolean; includeHardcoded?: boolean }): Promise<string[]> {
  const includeEnv = opts?.includeEnv !== false; // default true
  const includeBackup = opts?.includeBackup !== false; // default true
  const includeAirtable = opts?.includeAirtable !== false; // default true
  const includeHardcoded = opts?.includeHardcoded !== false; // default true

  const sources: Record<string, string> = {};
  let urls: string[] = [];
  if (includeBackup) {
    const backupStrings = process.env.BACKUP_STRINGS || '';
    if (backupStrings) {
      const backupUrls = backupStrings.split(',').map(u => u.trim()).filter(Boolean);
      urls = urls.concat(backupUrls.filter(u => !urls.includes(u)));
      backupUrls.forEach(u => (sources[u] = 'backup'));
      console.log('[NeonManager] Using BACKUP_STRINGS entries:', backupUrls.length);
    }
  }
  if (includeEnv) {
    const dbUrl = process.env.DATABASE_URL || '';
    if (dbUrl) {
      const envUrls = dbUrl.split(',').map(u => u.trim()).filter(Boolean);
      urls = urls.concat(envUrls.filter(u => !urls.includes(u)));
      envUrls.forEach(u => (sources[u] = 'env'));
      console.log('[NeonManager] process.env.DATABASE_URL entries:', envUrls.length);
    }
  }

  // If Airtable credentials present, fetch additional connection strings
  const airtableApiKey = process.env.AIRTABLE_API_KEY;
  const airtableBase = process.env.AIRTABLE_BASE_ID;
  const airtableTable = process.env.AIRTABLE_TABLE_ID;
    // Always include Airtable unless explicitly disabled by SKIP_AIRTABLE
    const skipAirtable = String(process.env.SKIP_AIRTABLE || '').toLowerCase() === 'true';
    if (includeAirtable && !skipAirtable && airtableApiKey && airtableBase && airtableTable) {
    try {
      const res = await fetch(`https://api.airtable.com/v0/${airtableBase}/${airtableTable}`, {
        headers: { Authorization: `Bearer ${airtableApiKey}` }
      });
      if (res.ok) {
        const json = await res.json();
        const airtableUrls = (json.records || []).map((r: any) => (r.fields?.connectionstring || '').trim()).filter(Boolean);
        console.log('[NeonManager] Airtable returned', airtableUrls.length, 'urls');
        // Merge unique
        airtableUrls.filter(u => !urls.includes(u)).forEach(u => { urls.push(u); sources[u] = 'airtable'; });
      }
    } catch (err) {
      console.warn('Failed to fetch Neon connection strings from Airtable', err);
    }
  }

  // Include previously hardcoded fallback if present in env
  const hardcodedExtractedDb = process.env.HARDCODED_EXTRACTED_DB || '';
  if (includeHardcoded && hardcodedExtractedDb && !urls.includes(hardcodedExtractedDb)) { urls.push(hardcodedExtractedDb); sources[hardcodedExtractedDb] = 'hardcoded'; }
  console.log('[NeonManager] Final urls count:', urls.length);
  console.log('[NeonManager] Url sources sample:', Object.entries(sources).slice(0, 10));

  // If we have a persisted main extracted DB saved, prioritize it
  try {
    const { promises: fsp } = await import('fs');
    const metaPath = path.resolve(process.cwd(), 'meta', 'extracted_main.json');
    if (fs.existsSync(metaPath)) {
      const raw = await fsp.readFile(metaPath, 'utf8');
      const json = JSON.parse(raw);
      const mainConn = (json && json.main) || '';
      if (mainConn && !urls.includes(mainConn)) {
        urls.unshift(mainConn);
      } else if (mainConn && urls.includes(mainConn)) {
        // Move mainConn to front
        urls.splice(urls.indexOf(mainConn), 1);
        urls.unshift(mainConn);
      }
    }
  } catch (err) {
    // Ignore meta errors
  }

  return urls;
}

  // Import a JSON into all discovered Neon DBs (skips duplicates by id)
  export async function importVideoMappingsToAll(jsonFilePath: string, options?: { skipIfExists?: boolean }): Promise<any[]> {
    const results: any[] = [];
    const urls = await getNeonDbUrls();
    for (const url of urls) {
      try {
        console.log(`[NeonManager] Importing to ${url}`);
        const res = await importVideoMappingsFromJson(url, jsonFilePath);
        results.push({ url, ok: true, res });
      } catch (err) {
        console.warn(`[NeonManager] Import failed for ${url}`, err?.message || err);
        results.push({ url, ok: false, err: String(err?.message || err) });
      }
    }
    return results;
  }
// Copy missing rows from source db to destination db for video_mappings table
export async function replicateExtractedVideoMappings(sourceConn: string, targetConn: string): Promise<{ inserted: number; skipped: number }> {
  const src = new Client({ connectionString: sourceConn });
  const dst = new Client({ connectionString: targetConn });
  await src.connect();
  await dst.connect();
  try {
    // Ensure target has table
    const tableCheck = await dst.query(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'video_mappings');`);
    if (!tableCheck.rows[0].exists) {
      return { inserted: 0, skipped: 0 };
    }
    // Get IDs from target
    const targetRows = await dst.query('SELECT id FROM video_mappings');
    const targetIds = new Set(targetRows.rows.map((r: any) => String(r.id)));

    // Iterate source rows and insert missing ones
    const batchSize = 200;
    let offset = 0;
    let inserted = 0;
    let skipped = 0;
    while (true) {
      const res = await src.query(`SELECT * FROM video_mappings ORDER BY id LIMIT ${batchSize} OFFSET ${offset}`);
      if (!res.rows || res.rows.length === 0) break;
      for (const row of res.rows) {
        const id = String(row.id);
        if (targetIds.has(id)) { skipped++; continue; }
        // Build insert dynamically
        const cols = Object.keys(row).map(c => '"' + c + '"').join(', ');
        const vals = Object.values(row);
        const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
        try {
          await dst.query(`INSERT INTO video_mappings (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, vals);
          inserted++;
          targetIds.add(id);
        } catch (e) {
          console.warn('Failed to insert row into target extracted DB', e.message || e);
        }
      }
      if (res.rows.length < batchSize) break;
      offset += batchSize;
    }

    return { inserted, skipped };
  } finally {
    await src.end();
    await dst.end();
  }
}

export async function tryReplicateToAnotherNeon(thresholdBytes = 0): Promise<void> {
  // Determine primary from env and find a target in Airtable. This is a simple heuristic.
  const urls = await getNeonDbUrls();
  if (urls.length < 2) {
    console.warn('No additional Neon DBs available to replicate to');
    return;
  }
  const primary = urls[0];
  const target = urls.find(u => u !== primary) || urls[1];
  try {
    const result = await replicateExtractedVideoMappings(primary, target);
    console.log(`[NeonManager] Replication done inserted=${result.inserted} skipped=${result.skipped}`);
  } catch (err) {
    console.warn('Neon replication failed', err);
  }
}

export async function getDbSizeBytes(connString: string): Promise<number | null> {
  try {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: connString });
    await client.connect();
    const res = await client.query(`SELECT pg_database_size(current_database()) as size`);
    await client.end();
    if (!res.rows || res.rows.length === 0) return null;
    return Number(res.rows[0].size || 0);
  } catch (err) {
    console.warn('Failed to get DB size for Neon server', err?.message || err);
    return null;
  }
}

export async function getMainExtractedDb(): Promise<string | null> {
  // Try env var first
  const envVal = process.env.HARDCODED_EXTRACTED_DB || null;
  if (envVal) return envVal;
  // Try meta file
  try {
    const { promises: fsp } = await import('fs');
    const metaPath = path.resolve(process.cwd(), 'meta', 'extracted_main.json');
    if (!fs.existsSync(metaPath)) return null;
    const raw = await fsp.readFile(metaPath, 'utf8');
    const json = JSON.parse(raw);
    return (json && json.main) || null;
  } catch (err) {
    return null;
  }
}

export async function setMainExtractedDb(connString: string): Promise<void> {
  try {
    const { promises: fsp } = await import('fs');
    const metaDir = path.resolve(process.cwd(), 'meta');
    if (!fs.existsSync(metaDir)) await fsp.mkdir(metaDir, { recursive: true });
    const metaPath = path.resolve(metaDir, 'extracted_main.json');
    await fsp.writeFile(metaPath, JSON.stringify({ main: connString }), 'utf8');
  } catch (err) {
    console.warn('Failed to persist main extracted DB selection', err?.message || err);
  }
}

export async function importVideoMappingsFromJson(targetConn: string, jsonFilePath: string): Promise<{ inserted: number; skipped: number }> {
  const { promises: fsp } = await import('fs');
  const path = jsonFilePath;
  const content = await fsp.readFile(path, 'utf-8');
  let rows: any[];
  try {
    rows = JSON.parse(content);
    if (!Array.isArray(rows)) throw new Error('JSON root is not an array');
  } catch (err) {
    console.warn('Failed to parse json file for import', err?.message || err);
    throw err;
  }

  const dst = new Client({ connectionString: targetConn });
  await dst.connect();
  try {
    // Ensure table exists
    const tableCheck = await dst.query(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'video_mappings');`);
    if (!tableCheck.rows[0].exists) {
      console.log('[NeonManager] video_mappings table not found in target DB; attempting to create minimal schema');
      try {
        await dst.query(`CREATE TABLE IF NOT EXISTS video_mappings (
          id varchar(255) PRIMARY KEY,
          name text,
          video text,
          m3u8 text,
          image text,
          thumbnail text,
          url text,
          uploaddate timestamp,
          tags text,
          uploadedby text,
          size bigint,
          type text,
          duration numeric,
          last_updated timestamp,
          meta jsonb
        );`);
        console.log('[NeonManager] Created minimal video_mappings table in target DB');
      } catch (err) {
        console.warn('[NeonManager] Failed to create video_mappings table in target DB', err?.message || err);
        return { inserted: 0, skipped: rows.length || 0 };
      }
    }

    const batchSize = 200;
    let inserted = 0;
    let skipped = 0;
    const colRes = await dst.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'video_mappings'`);
    const allowedCols = new Set(colRes.rows.map((r: any) => r.column_name));
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      for (const row of batch) {
        // Only insert columns that exist in the target table
        const filteredKeys = Object.keys(row).filter(k => allowedCols.has(k));
        if (filteredKeys.length === 0) { skipped++; continue; }
        const cols = filteredKeys.map(c => '"' + c + '"').join(', ');
        const vals = filteredKeys.map(k => row[k]);
        const placeholders = vals.map((_, idx) => `$${idx + 1}`).join(', ');
        try {
          const res = await dst.query(`INSERT INTO video_mappings (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, vals);
          // If PG returns affected rows info, otherwise count as inserted
          if (typeof res.rowCount === 'number') {
            if (res.rowCount > 0) inserted += res.rowCount; else skipped++;
          } else {
            inserted++;
          }
        } catch (err) {
          skipped++;
          console.warn('Failed to insert row from json into target extracted DB', err?.message || err);
        }
      }
    }
    return { inserted, skipped };
  } finally {
    await dst.end();
  }
}

export async function importVideoMappingsIntoAllNeons(jsonFilePath: string, opts?: { ignoreErrors?: boolean }): Promise<{ perDb: { url: string; inserted: number; skipped: number; error?: string }[] }> {
  const results: { url: string; inserted: number; skipped: number; error?: string }[] = [];
  const { promises: fsp } = await import('fs');
  const raw = await fsp.readFile(jsonFilePath, 'utf8');
  const rows: any[] = JSON.parse(raw);
  if (!Array.isArray(rows)) throw new Error('JSON root is not array');
  console.log('[NeonManager] importVideoMappingsIntoAllNeons: rows length:', rows.length);

  const urls = await getNeonDbUrls();
  console.log('[NeonManager] importVideoMappingsIntoAllNeons: will process urls count:', urls.length);
  for (const url of urls) {
    console.log(`[NeonManager] importVideoMappingsIntoAllNeons: processing ${url}`);
    try {
      const client = new Client({ connectionString: url });
      await client.connect();
      // ensure table exists
      const tableCheck = await client.query(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'video_mappings');`);
      if (!tableCheck.rows[0].exists) {
        await client.query(`CREATE TABLE IF NOT EXISTS video_mappings (
          id varchar(255) PRIMARY KEY,
          name text,
          video text,
          m3u8 text,
          image text,
          thumbnail text,
          url text,
          uploaddate timestamp,
          tags text,
          uploadedby text,
          size bigint,
          type text,
          duration numeric,
          last_updated timestamp,
          meta jsonb
        );`);
      }
      // Check existing IDs in batches
      const allIds = rows.map(r => String(r.id));
      const chunkSize = 1000;
      const existing = new Set<string>();
      for (let i = 0; i < allIds.length; i += chunkSize) {
        const chunk = allIds.slice(i, i + chunkSize);
        const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(', ');
        const res = await client.query(`SELECT id FROM video_mappings WHERE id IN (${placeholders})`, chunk);
        for (const r of res.rows) existing.add(String(r.id));
      }
      // Prepare allowed columns set for this DB
      const colRes = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'video_mappings'`);
      const allowedCols = new Set(colRes.rows.map((r: any) => r.column_name));
      // Insert rows that are not found
      let inserted = 0;
      let skipped = 0;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const batch = rows.slice(i, i + chunkSize);
        const toInsert = batch.filter(r => !existing.has(String(r.id)));
        if (toInsert.length === 0) {
          skipped += batch.length;
          continue;
        }
        // Only use columns that exist in the target DB and are present in the row
        const cols = Object.keys(toInsert[0]).filter(k => allowedCols.has(k));
        const colList = cols.map(c => '"' + c + '"').join(', ');
        // Build multi-row insert with placeholders
        const values: any[] = [];
        const valuePlaceholders: string[] = [];
        toInsert.forEach((row, rowIdx) => {
          const rowPlaceholders = cols.map((_, colIdx) => `$${rowIdx * cols.length + colIdx + 1}`);
          valuePlaceholders.push(`(${rowPlaceholders.join(',')})`);
          cols.forEach(c => values.push(row[c]));
        });
          const query = `INSERT INTO video_mappings (${colList}) VALUES ${valuePlaceholders.join(',')} ON CONFLICT DO NOTHING`;
        try {
          const r = await client.query(query, values);
          if (typeof r.rowCount === 'number') inserted += r.rowCount; else inserted += toInsert.length;
        } catch (err) {
          console.warn(`[NeonManager] Failed inserting batch to ${url}`, err?.message || err);
          // fallback to single-row inserts
          for (const row of toInsert) {
            const cols2 = Object.keys(row);
            const cols2List = cols2.map(c => '"' + c + '"').join(', ');
            const vals = Object.values(row);
            const ph = vals.map((_, idx) => `$${idx + 1}`).join(', ');
            try { await client.query(`INSERT INTO video_mappings (${cols2List}) VALUES (${ph}) ON CONFLICT DO NOTHING`, vals); inserted++; } catch (e) { skipped++; }
          }
        }
      }
      await client.end();
      results.push({ url, inserted, skipped });
      console.log(`[NeonManager] importVideoMappingsIntoAllNeons: done ${url} inserted=${inserted} skipped=${skipped}`);
    } catch (err) {
      console.warn(`[NeonManager] Import to ${url} failed`, err?.message || err);
      if (!opts?.ignoreErrors) results.push({ url, inserted: 0, skipped: 0, error: String(err?.message || err) });
      else results.push({ url, inserted: 0, skipped: 0, error: String(err?.message || err) });
    }
  }
  return { perDb: results };
}

export default { getNeonDbUrls, replicateExtractedVideoMappings, tryReplicateToAnotherNeon, getDbSizeBytes, importVideoMappingsFromJson, importVideoMappingsIntoAllNeons, getMainExtractedDb, setMainExtractedDb };
