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
  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send('pong');
});

/****************************************************
 * ENDPOINT: /api/analyze-property
 ****************************************************/
app.post('/api/analyze-property', async (req, res) => {
  const reqId = randomUUID().slice(0, 8);
  console.log(`[${reqId}] --- Received new /api/analyze-property request ---`);
  let browser = null;
  try {
    const { url } = req.body;
    if (!url || (!url.includes("redfin") && !url.includes("zillow"))) {
        return res.status(400).json({ error: "Please provide a valid Redfin or Zillow URL." });
    }

    console.log(`[${reqId}] Launching browser...`);
    browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome-stable',
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    const page = await browser.newPage();
    
    console.log(`[${reqId}] Navigating to:`, url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // --- THIS IS THE FIX (v18) ---
    // Wait for the "Key Details" table, which is present on all layouts and
    // indicates that the core property data has been rendered.
    console.log(`[${reqId}] Waiting for dynamic content to render by looking for the Key Details table...`);
    await page.waitForFunction(
      "document.querySelector('.KeyDetailsTable, .KeyDetails-Table')",
      { timeout: 30000 } // Generous 30-second timeout
    );
    console.log(`[${reqId}] Key Details table found. Page is ready for scraping.`);
    // --- END OF FIX ---

    console.log(`[${reqId}] Injecting and evaluating scrape script...`);
    const scriptContent = fs.readFileSync(path.join(__dirname, 'scrape.js'), 'utf8');
    const propertyDetails = await page.evaluate(scriptContent);

    if (propertyDetails.error) {
        throw new Error(`Scraping script failed: ${propertyDetails.error}`);
    }
    console.log(`[${reqId}] Scrape successful for address:`, propertyDetails.address);

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
        res.status(500).json({ error: error.message || "Internal server error." });
    }
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

