import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const proxyBase = 'https://webproxier.vercel.app/api/proxy?url=';

async function extractVideoName(videoUrl) {
  const encodedUrl = encodeURIComponent(videoUrl);
  const response = await fetch(proxyBase + encodedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);
  // Extract text from h2.page-title
  const h2 = $('h2.page-title').clone();
  h2.find('span.duration').remove(); // Remove duration span if present
  const name = h2.text().trim();
  return name;
}

const inputUrl = process.argv[2];
if (!inputUrl) {
  console.error('Usage: node scripts/extract-video-name.mjs <video-url>');
  process.exit(1);
}

extractVideoName(inputUrl).then(name => {
  console.log(name);
}).catch(console.error);
