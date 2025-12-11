import puppeteer from 'puppeteer';

async function extractImageUrls(url) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const imageUrls = new Set();

  // Listen for all network requests
  page.on('request', (request) => {
    const reqUrl = request.url();
    // Filter for image URLs (jpg, jpeg, png, gif, webp, etc.)
    if (/\.(jpg)(\?|$)/i.test(reqUrl)) {
      imageUrls.add(reqUrl);
    }
    // Also match xvideos thumb CDN pattern
    if (reqUrl.includes('xvideos-cdn.com/videos/thumbs')) {
      imageUrls.add(reqUrl);
    }
  });

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  // Wait a bit for JS-loaded images
  await new Promise(res => setTimeout(res, 5000));

  await browser.close();
  return Array.from(imageUrls);
}


const inputUrl = process.argv[2];
if (!inputUrl) {
  console.error('Usage: node scripts/extract-image-urls.mjs <url>');
  process.exit(1);
}

// Use the proxy for navigation
const proxyBase = 'https://webproxier.vercel.app/api/proxy?url=';
const proxyUrl = proxyBase + encodeURIComponent(inputUrl);

extractImageUrls(proxyUrl).then((urls) => {
  console.log('Image URLs:');
  urls.forEach((u) => console.log(u));
}).catch(console.error);
