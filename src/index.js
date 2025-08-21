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
const { randomUUID } = require('crypto'); // ADDED: For unique request logging
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// MODIFIED: Make the check for this environment variable stricter.
// It must be set to the internal service URL (e.g., http://renvo-python:10000) on Render.
const PYTHON_API_URL = process.env.PYTHON_API_URL;
if (!PYTHON_API_URL) {
  console.error("FATAL ERROR: The PYTHON_API_URL environment variable is not set. This is required for the application to function.");
  process.exit(1); // Exit if the critical URL is not configured.
}

const PYTHON_SERVICE_URL = `${PYTHON_API_URL}/api/analyze-property`;
// REMOVED: PYTHON_STATUS_URL is no longer needed as the server will not poll.
// const PYTHON_STATUS_URL = `${PYTHON_API_URL}/api/report/status`;

/****************************************************
 * MIDDLEWARE
 ****************************************************/
app.use(express.json());
app.use(cors());
app.options('*', cors());
app.use(express.static(path.join(__dirname, '../public')));

/****************************************************
 * POLLING FUNCTION - REMOVED
 ****************************************************/
// REMOVED: The entire pollReportStatus function is deleted.
// This is the source of the timeout error. The responsibility for polling
// is correctly handled by the frontend report page (`report.html`), which
// already has the necessary JavaScript to check the status until it's complete.
// Keeping this here makes the Node service unstable.

/****************************************************
 * ROUTES
 ****************************************************/
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// REMOVED: This route is not needed and can cause confusion.
// The report is served directly by the Python service.
/*
app.get('/report', (req, res) => {
  const reportPath = path.join(__dirname, '../backend/agent_service/templates/report.html');
  if (fs.existsSync(reportPath)) {
      res.sendFile(reportPath);
  } else {
      res.status(404).send('Report template not found at expected Node path.');
  }
});
*/

app.get('/api/ping', (req, res) => {
  console.log("Received GET /api/ping request");
  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send('pong');
});

/****************************************************
 * ENDPOINT: /api/analyze-property
 ****************************************************/
app.post('/api/analyze-property', async (req, res) => {
  const reqId = randomUUID().slice(0, 8); // ADDED: Unique ID for this specific request log.
  console.log(`[${reqId}] --- Received new request ---`);
  let browser = null;
  try {
    const { url } = req.body;
    if (!url || (!url.includes("redfin") && !url.includes("zillow"))) {
        console.log(`[${reqId}] Invalid URL received:`, url);
        return res.status(400).json({ error: "Please provide a valid Redfin or Zillow URL." });
    }

    // Filesystem Debugging (no changes)
    console.log(`[${reqId}] --- Filesystem Debugging ---`);
    const chromePath = '/usr/bin/google-chrome-stable';
    try {
        const chromeExists = fs.existsSync(chromePath);
        console.log(`[${reqId}] Does ${chromePath} exist? ${chromeExists}`);
    } catch (e) {
        console.log(`[${reqId}] Error during filesystem check:`, e.message);
    }
    console.log(`[${reqId}] --- End Filesystem Debugging ---`);

    console.log(`[${reqId}] Launching browser with Docker's native Chrome...`);
    browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome-stable',
        protocolTimeout: 120000,
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });
    const page = await browser.newPage();

    // ADDED: Enhanced logging with request ID for browser events
    page.on('console', msg => console.log(`[${reqId}] BROWSER LOG:`, msg.text()));
    page.on('pageerror', error => console.error(`[${reqId}] BROWSER ERROR:`, error.message));
    page.on('requestfailed', request => {
         const failureText = request.failure()?.errorText;
         if (failureText && failureText !== 'net::ERR_ABORTED') {
            console.warn(`[${reqId}] BROWSER REQ FAIL: ${failureText} ${request.url()}`);
         }
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');
    console.log(`[${reqId}] Waiting 3 seconds before navigation...`);
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log(`[${reqId}] Navigating to:`, url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log(`[${reqId}] Page DOM loaded, waiting 10 seconds for dynamic content...`);
    await new Promise(resolve => setTimeout(resolve, 10000));
    console.log(`[${reqId}] Finished waiting.`);

    console.log(`[${reqId}] Injecting and evaluating scrape script...`);
    const scrapeScriptPath = path.join(__dirname, 'scrape.js');
    if (!fs.existsSync(scrapeScriptPath)) {
        console.error(`[${reqId}] CRITICAL: scrape.js not found at path:`, scrapeScriptPath);
        throw new Error("Scraping script file is missing.");
    }
    const scriptContent = fs.readFileSync(scrapeScriptPath, 'utf8');
    const propertyDetails = await page.evaluate(scriptContent); // Evaluate script directly

    console.log(`[${reqId}] Property details received from browser.`);

    if (propertyDetails.error) {
        console.error(`[${reqId}] Error reported by scrape script:`, propertyDetails.error);
        throw new Error(propertyDetails.error);
    }
    if (!propertyDetails || !propertyDetails.address || propertyDetails.address === 'Address not found') {
        console.error(`[${reqId}] Scraping returned empty or invalid data.`);
        throw new Error('Failed to scrape property details: No valid data returned.');
    }

    if (browser) {
        console.log(`[${reqId}] Closing browser BEFORE calling Python service...`);
        await browser.close();
        browser = null;
    }

    console.log(`[${reqId}] Forwarding data to Python service...`);
    const pythonResponse = await axios.post(PYTHON_SERVICE_URL, {
        property_data: propertyDetails
    });

    const { reportId } = pythonResponse.data;
    if (!reportId) {
         throw new Error("Python service did not return the expected reportId.");
    }
    console.log(`[${reqId}] Python service responded with reportId: ${reportId}`);
    
    // REMOVED: Do not poll from the server.
    // await pollReportStatus(reportId);

    // MODIFIED: Immediately send the reportId back to the client.
    if (!res.headersSent) {
        res.json({ reportId });
        console.log(`[${reqId}] --- Final success response sent to client. ---`);
    } else {
         console.log(`[${reqId}] Headers already sent, cannot send final response.`);
    }

  } catch (error) {
    console.error(`[${reqId}] Error in /api/analyze-property endpoint:`, error.message, error.stack);
    if (browser) {
        console.warn(`[${reqId}] Ensuring browser is closed in main catch block...`);
        try { await browser.close(); } catch (closeErr) { console.error(`[${reqId}] Error closing browser in main catch:`, closeErr); }
    }
    if (!res.headersSent) {
        res.status(500).json({ error: error.message || "Internal server error during analysis process." });
    }
  } finally {
      if (browser) {
          console.warn(`[${reqId}] Closing browser in FINALLY block (should have already been closed)...`);
          try { await browser.close(); } catch (closeErr) { console.error(`[${reqId}] Error closing browser in finally:`, closeErr); }
      }
      console.log(`[${reqId}] --- /api/analyze-property request processing finished ---`);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});