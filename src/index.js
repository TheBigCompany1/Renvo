/****************************************************
 * IMPORTS & ENV SETUP
 ****************************************************/
const express = require('express');
const path = require('path');
const axios = require('axios');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const cors = require('cors');
const { randomUUID } = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

puppeteer.use(StealthPlugin());

const PYTHON_API_URL = process.env.PYTHON_API_URL;
if (!PYTHON_API_URL) {
  console.error("FATAL ERROR: PYTHON_API_URL environment variable is not set.");
  process.exit(1);
}
const PYTHON_SERVICE_URL = `${PYTHON_API_URL}/api/analyze-property`;

/****************************************************
 * MIDDLEWARE
 ****************************************************/
app.use(express.json());
app.use(cors());
app.options('*', cors());
app.use(express.static(path.join(__dirname, '../public')));

/****************************************************
 * ROUTES
 ****************************************************/
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/api/config', (req, res) => {
  res.json({ pythonApiUrl: PYTHON_API_URL });
});

app.get('/api/ping', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({ status: 'ok', message: 'Node.js service is running' });
});

app.post('/api/analyze-property', async (req, res) => {
  const reqId = randomUUID().slice(0, 8);
  console.log(`[${reqId}] Received new request for /api/analyze-property`);
  
  const { propertyUrl } = req.body;
  if (!propertyUrl) {
    return res.status(400).json({ error: 'propertyUrl is required' });
  }

  let browser = null;
  try {
    console.log(`[${reqId}] Launching Puppeteer...`);
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // --- DEFINITIVE ANTI-BLOCKING & TIMEOUT FIX ---
    // 1. Set a realistic User-Agent and Viewport to mimic a real browser.
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    // 2. Intercept and block non-essential requests (images, fonts, stylesheets)
    //    to drastically speed up page load time and evade detection.
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
            req.abort();
        } else {
            req.continue();
        }
    });
    
    page.on('console', msg => {
      const logText = msg.text();
      if (logText.startsWith('[Scrape.js]')) {
        console.log(`[${reqId}] BROWSER LOG:`, logText);
      }
    });

    console.log(`[${reqId}] Navigating to URL: ${propertyUrl}`);
    
    await page.goto(propertyUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    const pageTitle = await page.title();
    console.log(`[${reqId}] Page loaded with title: "${pageTitle}"`);
    
    await page.waitForSelector('#content', { timeout: 10000 });
    console.log(`[${reqId}] Core content element '#content' is visible.`);

    console.log(`[${reqId}] Injecting and evaluating scrape script...`);
    const scriptContent = fs.readFileSync(path.join(__dirname, 'scrape.js'), 'utf8');
    const propertyDetails = await page.evaluate(scriptContent);

    // --- DEFINITIVE LOGGING FIX ---
    // This log confirms exactly what data was captured (or if it was null).
    console.log(`[${reqId}] DATA CAPTURED:`, JSON.stringify(propertyDetails, null, 2));

    if (propertyDetails.error) {
        throw new Error(`Scraping script failed: ${propertyDetails.error}`);
    }
    
    if (browser) {
        await browser.close();
        console.log(`[${reqId}] Browser closed.`);
    }

    console.log(`[${reqId}] Forwarding data to Python service at ${PYTHON_SERVICE_URL}`);
    const pythonResponse = await axios.post(PYTHON_SERVICE_URL, { property_data: propertyDetails });

    const { reportId } = pythonResponse.data;
    if (!reportId) {
         throw new Error("Python service did not return the expected reportId.");
    }
    console.log(`[${reqId}] Python service responded with reportId: ${reportId}`);
    
    res.json({ reportId });
    console.log(`[${reqId}] --- Final success response sent to client. ---`);

  } catch (error) {
    console.error(`[${reqId}] CRITICAL ERROR in /api/analyze-property:`, error.message);
    if (browser) {
        try { await browser.close(); } catch (e) { /* ignore */ }
    }
    if (!res.headersSent) {
        res.status(500).json({ error: error.message || "An internal server error occurred during analysis." });
    }
  }
});

/****************************************************
 * SERVER STARTUP
 ****************************************************/
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});

