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
  res.status(200).send({ message: 'renvo-node-staging is alive' });
});

app.post('/api/analyze-property', async (req, res) => {
  const reqId = randomUUID();
  console.log(`[${reqId}] Received new request for /api/analyze-property`);

  let browser;
  try {
    const { propertyUrl } = req.body;
    if (!propertyUrl) {
      console.error(`[${reqId}] Missing propertyUrl in request body.`);
      return res.status(400).json({ error: 'propertyUrl is required' });
    }

    console.log(`[${reqId}] Launching Puppeteer...`);
    browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // --- FIX 1, PART 1: ADD CONSOLE LOG VISIBILITY ---
    // This is the critical fix to pipe browser logs to the server for debugging.
    page.on('console', msg => {
        const text = msg.text();
        // The scraper script prefixes logs with '[Scrape.js]', so we can filter.
        if (text.startsWith('[Scrape.js]')) {
            console.log(`[${reqId}] BROWSER_LOG: ${text}`);
        }
    });

    console.log(`[${reqId}] Navigating to URL: ${propertyUrl}`);
    await page.goto(propertyUrl, { waitUntil: 'networkidle2' });

    // --- FIX 1, PART 2: ADD A RESILIENT WAIT ---
    // This waits for one of several possible content containers to appear,
    // ensuring the scraper doesn't run on an empty or incomplete page.
    try {
        console.log(`[${reqId}] Waiting for a valid content container to load...`);
        await page.waitForSelector('.key-detail-info, .HomeInfo, .dp-details-set, #property-details-scroll-container', { timeout: 15000 });
        console.log(`[${reqId}] Content container found. Proceeding with scrape.`);
    } catch (e) {
        console.warn(`[${reqId}] Timed out waiting for primary content containers. The page may have a new layout or failed to load correctly. Attempting to scrape anyway.`);
    }


    console.log(`[${reqId}] Injecting and evaluating scrape script...`);
    const scriptContent = fs.readFileSync(path.join(__dirname, 'scrape.js'), 'utf8');
    const propertyDetails = await page.evaluate(scriptContent);

    if (propertyDetails.error) {
        throw new Error(`Scraping script failed: ${propertyDetails.error}`);
    }
    
    // ADDED: Log the full scraped data object for complete visibility.
    console.log(`[${reqId}] Scrape successful. Full data received:\n`, JSON.stringify(propertyDetails, null, 2));

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
        res.status(500).json({ error: error.message || "An internal server error occurred." });
    }
  }
});


/****************************************************
 * SERVER START
 ****************************************************/
app.listen(PORT, () => {
  console.log(`renvo-node-staging server is running on port ${PORT}`);
});


