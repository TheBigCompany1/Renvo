/****************************************************
 * IMPORTS & ENV SETUP
 ****************************************************/
const express = require('express');
const path = require('path');
const axios = require('axios');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const cors = require('cors'); // <-- ADDED THIS LINE
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:5000/api/analyze-property';

/****************************************************
 * MIDDLEWARE
 ****************************************************/
app.use(express.json());
app.use(cors()); // <-- AND ADDED THIS LINE
app.use(express.static(path.join(__dirname, '../public')));

/****************************************************
 * ROUTES
 ****************************************************/
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// --- NOTE: This /report route serves a static file ---
// --- The actual report generation is handled by Python ---
// --- Ensure this path correctly points to where Flask renders the report ---
// --- Typically, Flask serves its own templates, so this might not be needed ---
// --- or should point to the correct location if served statically by Node ---
app.get('/report', (req, res) => {
  // This path might need adjustment depending on your final deployment structure
  // If Flask serves the report at /report, this Node.js route might conflict or be unnecessary.
  const reportPath = path.join(__dirname, '../backend/agent_service/templates/report.html');
  if (fs.existsSync(reportPath)) {
      res.sendFile(reportPath);
  } else {
      // Maybe redirect to the Python service's report URL if Flask handles it?
      // Example: res.redirect(`${process.env.PYTHON_SERVICE_URL.replace('/api/analyze-property', '')}/report?reportId=${req.query.reportId}`);
      // Or send a 404 if Node is expected to serve it but it's missing
      res.status(404).send('Report template not found at expected Node path.');
  }
});
// -------------------------------------------------------------------

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
  // Removed responseSent flag, relying on standard res.headersSent check
  try {
    const { url } = req.body;
    if (!url || (!url.includes("redfin") && !url.includes("zillow"))) {
        console.log("Invalid URL received:", url);
        return res.status(400).json({ error: "Please provide a valid Redfin or Zillow URL." });
    }

    console.log("Launching browser with args...");
    browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome-stable',
        headless: true, // Keep true for server environments
        protocolTimeout: 120000,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });
    const page = await browser.newPage();

    // --- Setup Console/Error Listeners (Good for Debugging) ---
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
         // Log only significant failures, ignore aborted requests often caused by ads/trackers
         const failureText = request.failure()?.errorText;
         if (failureText && failureText !== 'net::ERR_ABORTED') {
            console.warn(`\x1b[33m[Browser Request Failed]\x1b[0m ${failureText} ${request.url()}`);
         }
    });
    // -----------------------------------------------------------

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'); // Keep user agent consistent
    console.log("Waiting 3 seconds before navigation...");
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log("Navigating to:", url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); // Use domcontentloaded for faster initial load

    console.log("Page DOM loaded, waiting 10 seconds for dynamic content...");
    await new Promise(resolve => setTimeout(resolve, 10000)); // Allow time for JS execution on Redfin/Zillow
    console.log("Finished waiting 10 seconds.");

    // --- Inject and Execute Scrape Script ---
    console.log("Injecting and evaluating scrape script...");
    const scrapeScriptPath = path.join(__dirname, 'scrape.js');
    if (!fs.existsSync(scrapeScriptPath)) {
        console.error("CRITICAL: scrape.js not found at path:", scrapeScriptPath);
        throw new Error("Scraping script file is missing.");
    }
    const scriptContent = fs.readFileSync(scrapeScriptPath, 'utf8');
    // console.log('[Index.js] First 200 chars of scrape.js being injected:', scriptContent.substring(0, 200)); // Keep for debugging if needed

    // *** MODIFIED page.evaluate CALL ***
    const propertyDetails = await page.evaluate(scriptToEvaluate => {
        // The scriptToEvaluate (scrape.js content) runs immediately
        // because it ends with (() => { ... })();
        // We just need to return the result of that execution.
        try {
             // Directly evaluate the script content which should return the data object or an error object
             // The 'eval' here is within the secure browser context of page.evaluate
             // and executes the script content passed in.
            return eval(scriptToEvaluate); // scrape.js IIFE returns the data object
        } catch (e) {
             // console.error is not available directly here, but we can log from the main Node context via listeners
             // Return an error object matching the expected structure
             return {
                 // Default structure fields... ensure these match Property model defaults
                 address: 'Address not found', price: null, beds: null, baths: null, sqft: null, yearBuilt: null, lotSize: null, homeType: null, description: null, hoaFee: null, propertyTax: null, images: [], source: 'unknown', url: window.location.href, timestamp: new Date().toISOString(), estimate: null, estimatePerSqft: null, interiorFeatures: {}, parkingFeatures: {}, communityFeatures: {}, priceHistory: [], taxHistory: [], daysOnMarket: null, constructionDetails: {}, utilityDetails: {}, listingAgent: null, listingBrokerage: null, additionalDetails: {},
                 error: `Error evaluating scrape script in browser: ${e.message}` // Include specific error
             };
        }
    }, scriptContent); // Pass the scrape.js content as an argument
    // **********************************

    console.log('Property details received from browser:', propertyDetails); // Log the actual result

    // Check for errors returned FROM the scrape script execution
    if (propertyDetails.error) {
        console.error('Error reported by scrape script:', propertyDetails.error);
        // Decide how to handle - maybe try to proceed if some basic data exists?
        // For now, let's throw an error to stop processing and return 500
        throw new Error(propertyDetails.error);
    }
    if (!propertyDetails || Object.keys(propertyDetails).length === 0) {
        // Handle case where evaluate might return empty/null unexpectedly
        console.error('Scraping returned empty or null data.');
        throw new Error('Failed to scrape property details: No data returned.');
    }


    // --- Close browser EARLY (after scraping, before long Python call) ---
    // This helps ensure Node can send its response without interference
    if (browser) {
        console.log("Closing browser BEFORE calling Python service...");
        try {
            await browser.close();
            browser = null; // Set to null so finally block doesn't try again
            console.log("Browser closed successfully (early).");
        } catch (closeErr) {
            console.error("Error closing browser early:", closeErr);
            browser = null; // Ensure it's null even if close fails
        }
    }
    // ------------------------------------------------------------------


    // Forward data to Python service
    console.log("Forwarding data to Python service...");
    let pythonResponse;
    try {
        pythonResponse = await axios.post(PYTHON_SERVICE_URL, {
            // Send the entire propertyDetails object under the property_data key
            // Ensure Python endpoint expects this structure
            property_data: propertyDetails
        }, { timeout: 10 * 60 * 1000 }); // Add a timeout (e.g., 10 minutes) for the Python call

        console.log("Python service response:", pythonResponse.data);

        if (!pythonResponse.data || !pythonResponse.data.reportId) {
             throw new Error("Python service did not return the expected reportId.");
        }

    } catch (axiosError) {
        console.error("Error calling Python service:", axiosError.message);
        // Log more details if available
        if (axiosError.response) {
            console.error("Python service response status:", axiosError.response.status);
            console.error("Python service response data:", axiosError.response.data);
        } else if (axiosError.request) {
            console.error("Python service made no response.");
        }
        // Rethrow or handle as an internal server error for the client
        throw new Error(`Failed to communicate with analysis service: ${axiosError.message}`);
    }


    // Send final success response to client
    console.log("Attempting to send final success response to client...");
    if (!res.headersSent) {
        res.json(pythonResponse.data); // Send { reportId: '...' }
        console.log("Final success response sent.");
    } else {
         console.log("Headers already sent, cannot send final success response.");
    }


  } catch (error) {
    // Generic error handling for the endpoint
    console.error("Error in /api/analyze-property endpoint:", error.message, error.stack); // Log stack trace too
    // Ensure browser is closed if an error occurred before the early close attempt
    if (browser) {
        console.warn("Ensuring browser is closed in main catch block...");
        try { await browser.close(); browser = null; } catch (closeErr) { console.error("Error closing browser in main catch:", closeErr); }
    }
    // Send error response if not already sent
    if (!res.headersSent) {
        res.status(500).json({ error: error.message || "Internal server error during analysis process." });
    } else {
        console.log("Headers already sent, cannot send error response from main catch block.");
    }
  } finally {
      // Final check: Ensure browser is closed (redundant if early close succeeded, but safe)
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
