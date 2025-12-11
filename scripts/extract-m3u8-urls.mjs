import puppeteer from 'puppeteer';

async function extractM3u8Url(url) {
  let browser;
  let m3u8Url = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('HTML5 Player drawed with Hls.js')) {
        // Extract m3u8 URL from the log
        const match = text.match(/https?:\/\/[^\s]+\.m3u8/);
        if (match) {
          m3u8Url = match[0];
        }
      }
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    // Wait a bit for JS to run and log
    await new Promise(res => setTimeout(res, 5000));
    await browser.close();
    return m3u8Url;
  } catch (err) {
    if (browser) await browser.close();
    console.error('[ERROR] Puppeteer failed:', err);
    return null;
  }
}

const inputUrl = process.argv[2];
if (!inputUrl) {
  console.error('Usage: node scripts/extract-m3u8-urls.mjs <video-url>');
  process.exit(1);
}

// Use the proxy for navigation
const proxyBase = 'https://webproxier.vercel.app/api/proxy?url=';
const proxyUrl = proxyBase + encodeURIComponent(inputUrl);

extractM3u8Url(proxyUrl).then((m3u8) => {
  if (m3u8) {
    console.log(m3u8);
  } else {
    console.error('[ERROR] No m3u8 URL found');
  }
}).catch(err => {
  console.error('[ERROR] Extraction failed:', err);
});
