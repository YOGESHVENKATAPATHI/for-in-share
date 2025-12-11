import { readFileSync, writeFileSync } from 'fs';

const jsonPath = 'mapped-urls.json';

function isValid(entry) {
  return entry && entry.name && entry.video && entry.image && entry.m3u8;
}

function cleanJson() {
  let mappings;
  try {
    mappings = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  } catch (e) {
    console.error('Could not read mapped-urls.json:', e.message);
    return;
  }
  const cleaned = mappings.filter(isValid);
  writeFileSync(jsonPath, JSON.stringify(cleaned, null, 2), 'utf-8');
  console.log(`Cleaned JSON. ${cleaned.length} valid entries remain.`);
}

cleanJson();
