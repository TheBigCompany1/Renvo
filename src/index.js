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
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:5000/api/analyze-property';

/****************************************************
 * MIDDLEWARE
 ****************************************************/
app.use(express.json());

const corsOptions = {
  origin: 'https://renvo.ai',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.static(path.join(__dirname, '../public')));

/****************************************************
 * ROUTES
 ****************************************************/
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/report', (req, res) => {
  const reportPath = path.join(__dirname, '../backend/agent_service/templates/report.html');
  if (fs.existsSync(reportPath)) {
      res.sendFile(reportPath);
  } else {
      res.status(404).send('Report template not found at expected Node path.');
  }
});

app.get('/api/ping', (req, res) => {
  console.log("Received GET /api/ping request");
  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send('pong');
});

/****************************************************
 * ENDPOINT: /api/analyze-property
 ****************************************************/
app.post('/api/analyze-property', async (req, res) => {
  let browser = null;
  try {
    const { url } = req.body;
    if (!url || (!url.includes("redfin") && !url.includes("zillow"))) {
        console.log("Invalid URL received:", url);
        return res.status(400).json({ error: "Please provide a valid Redfin or Zillow URL." });
    }

    // === START DEBUGGING ===
    console.log("--- Filesystem Debugging ---");
    const chromePath = '/usr/bin/google-chrome-stable';
    try {
        const chromeExists = fs.existsSync(chromePath);
        console.log(`Does ${chromePath} exist? ${chromeExists}`);
        if (!chromeExists) {
            const usrBinContents = fs.readdirSync('/usr/bin');
            const chromeLikeFiles = usrBinContents.filter(f => f.toLowerCase().includes('chrome'));
            console.log("Found chrome-like files in /usr/bin/:", chromeLikeFiles);
        }
    } catch (e) {
        console.log("Error during filesystem check:", e.message);
    }
    console.log("--- End Filesystem Debugging ---");
    // === END DEBUGGING ===

    console.log("Launching browser with Docker's native Chrome...");
    browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome-stable',
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });
    const page = await browser.newPage();

    page.on('console', msg => {
        const type = msg.type().substr(0, 3).toUpperCase();
        const colors = { LOG: '\x1b[37m', ERR: '\x1b[31m', WAR: '\x1b[33m', INF: '\x1b[34m' };
        const color = colors[type] || '\x1b[37m';
        console.log(`${color}[Browser Console - ${type}]\x1b[0m`, msg.text());
    });
    page.on('pageerror', error => {
        console.error('\x1b[31m[Browser Page Error]\x1b[0m', error.message);
    });
    page.on('requestfailed', request => {
         const failureText = request.failure()?.errorText;
         if (failureText && failureText !== 'net::ERR_ABORTED') {
            console.warn(`\x1b[33m[Browser Request Failed]\x1b[0m ${failureText} ${request.url()}`);
         }
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');
    console.log("Waiting 3 seconds before navigation...");
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log("Navigating to:", url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log("Page DOM loaded, waiting 10 seconds for dynamic content...");
    await new Promise(resolve => setTimeout(resolve, 10000));
    console.log("Finished waiting 10 seconds.");

    console.log("Injecting and evaluating scrape script...");
    const scrapeScriptPath = path.join(__dirname, 'scrape.js');
    if (!fs.existsSync(scrapeScriptPath)) {
        console.error("CRITICAL: scrape.js not found at path:", scrapeScriptPath);
        throw new Error("Scraping script file is missing.");
    }
    const scriptContent = fs.readFileSync(scrapeScriptPath, 'utf8');

    const propertyDetails = await page.evaluate(scriptToEvaluate => {
        try {
            return eval(scriptToEvaluate);
        } catch (e) {
             return {
                 address: 'Address not found', price: null, beds: null, baths: null, sqft: null, yearBuilt: null, lotSize: null, homeType: null, description: null, hoaFee: null, propertyTax: null, images: [], source: 'unknown', url: window.location.href, timestamp: new Date().toISOString(), estimate: null, estimatePerSqft: null, interiorFeatures: {}, parkingFeatures: {}, communityFeatures: {}, priceHistory: [], taxHistory: [], daysOnMarket: null, constructionDetails: {}, utilityDetails: {}, listingAgent: null, listingBrokerage: null, additionalDetails: {},
                 error: `Error evaluating scrape script in browser: ${e.message}`
             };
        }
    }, scriptContent);

    console.log('Property details received from browser:', propertyDetails);

    if (propertyDetails.error) {
        console.error('Error reported by scrape script:', propertyDetails.error);
        throw new Error(propertyDetails.error);
    }
    if (!propertyDetails || Object.keys(propertyDetails).length === 0) {
        console.error('Scraping returned empty or null data.');
        throw new Error('Failed to scrape property details: No data returned.');
    }

    if (browser) {
        console.log("Closing browser BEFORE calling Python service...");
        try {
            await browser.close();
            browser = null;
        } catch (closeErr) {
            console.error("Error closing browser early:", closeErr);
            browser = null;
        }
    }

    console.log("Forwarding data to Python service...");
    let pythonResponse;
    try {
        pythonResponse = await axios.post(PYTHON_SERVICE_URL, {
            property_data: propertyDetails
        }, { timeout: 10 * 60 * 1000 });

        console.log("Python service response:", pythonResponse.data);

        if (!pythonResponse.data || !pythonResponse.data.reportId) {
             throw new Error("Python service did not return the expected reportId.");
        }

    } catch (axiosError) {
        console.error("Error calling Python service:", axiosError.message);
        if (axiosError.response) {
            console.error("Python service response status:", axiosError.response.status);
            console.error("Python service response data:", axiosError.response.data);
        } else if (axiosError.request) {
            console.error("Python service made no response.");
        }
        throw new Error(`Failed to communicate with analysis service: ${axiosError.message}`);
    }

    if (!res.headersSent) {
        res.json(pythonResponse.data);
        console.log("Final success response sent.");
    } else {
         console.log("Headers already sent, cannot send final success response.");
    }

  } catch (error) {
    console.error("Error in /api/analyze-property endpoint:", error.message, error.stack);
    if (browser) {
        console.warn("Ensuring browser is closed in main catch block...");
        try { await browser.close(); browser = null; } catch (closeErr) { console.error("Error closing browser in main catch:", closeErr); }
    }
    if (!res.headersSent) {
        res.status(500).json({ error: error.message || "Internal server error during analysis process." });
    } else {
        console.log("Headers already sent, cannot send error response from main catch block.");
    }
  } finally {
      if (browser) {
          console.warn("Closing browser in FINALLY block (should have closed earlier)...");
          try { await browser.close(); } catch (closeErr) { console.error("Error closing browser in finally:", closeErr); }
      }
      console.log("--- /api/analyze-property request finished ---");
  }
});


app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});