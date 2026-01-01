#!/usr/bin/env node
import 'dotenv/config';
let neonManager;
try {
  neonManager = (await import('../server/neon-manager')).default;
} catch (err) {
  console.error('Failed to import neon-manager', err?.message || err);
  process.exit(1);
}
import path from 'path';
import fs from 'fs';

(async () => {
  const args = process.argv.slice(2);
  const allFlag = args.includes('--all') || args.includes('-a');
  const airtableOnly = args.includes('--airtable') || args.includes('-t');
  const argsNoFlags = args.filter(a => a && !a.startsWith('-'));
  const filePath = argsNoFlags[0] ? path.resolve(argsNoFlags[0]) : path.resolve(process.cwd(), 'video_mappings.json');
  let targetConn = argsNoFlags[1] || undefined;
  if (!fs.existsSync(filePath)) {
    console.error('Backup JSON not found at', filePath);
    process.exit(1);
  }

  const urls = await neonManager.getNeonDbUrls(airtableOnly ? { includeEnv: false, includeBackup: false, includeAirtable: true } : undefined);
  console.log('Discovered Neon DB URLs:', urls);
  if (!urls || urls.length === 0) {
    console.error('No Neon DBs available');
    process.exit(1);
  }
  if (targetConn && !allFlag) {
    console.log('Importing to target', targetConn);
    try {
      const result = await neonManager.importVideoMappingsFromJson(targetConn, filePath);
      console.log('Import result', result);
      await neonManager.setMainExtractedDb(targetConn);
      process.exit(0);
    } catch (err) {
      console.error('Import failed:', err?.message || err);
      process.exit(1);
    }
  } else {
    console.log('Importing to all discovered Neon DBs...');
    try {
      const res = await neonManager.importVideoMappingsIntoAllNeons(filePath, { ignoreErrors: true });
      console.log('Import results per DB:');
      for (const d of res.perDb) {
        if (!d.error) console.log(`- ${d.url}: inserted=${d.inserted} skipped=${d.skipped}`);
        else console.log(`- ${d.url}: error=${d.error}`);
      }
      process.exit(0);
    } catch (err) {
      console.error('Import-all failed:', err?.message || err);
      process.exit(1);
    }
  }
  process.exit(0);
})();
