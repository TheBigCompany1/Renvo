/****************************************************
 * IMPORTS & ENV SETUP
 ****************************************************/
const express = require('express');
const path = require('path');
const axios = require('axios');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
// Set the Python service URL (default to localhost:5000)
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:5000/api/analyze-property';

/****************************************************
 * MIDDLEWARE
 ****************************************************/
// Parse JSON bodies
app.use(express.json());
// Serve static files from the public folder
app.use(express.static(path.join(__dirname, '../public')));

/****************************************************
 * ROUTES
 ****************************************************/
// Explicit GET route for root ("/") to serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// GET route to serve the report page (used by your Chrome extension)
app.get('/report', (req, res) => {
  res.sendFile(path.join(__dirname, '../backend/agent_service/templates/report.html'));
});

/****************************************************
 * ENDPOINT: /api/analyze-property
 * This endpoint accepts a property URL, uses Puppeteer to load
 * the page, injects our local scrape.js script to extract property
 * details, and then forwards these details (including the original URL)
 * to a Python service that uses your multi-agent orchestrator.
 ****************************************************/
app.post('/api/analyze-property', async (req, res) => {
  try {
    const { url } = req.body;
    // Validate URL
    if (!url || (!url.includes("redfin") && !url.includes("zillow"))) {
      return res.status(400).json({ error: "Please provide a valid Redfin or Zillow URL." });
    }
    
    // Step 1: Use Puppeteer to load the property page and scrape property details
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    // Set a realistic user agent to help bypass rate limiting
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/115.0.0.0 Safari/537.36'
    );
    
    // Add a short delay (3 seconds) to mimic human behavior
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log("Navigating to:", url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log("Page loaded (domcontentloaded).");
    
    // Read the scrape.js file from disk and inject it into the page context
    const scrapeScriptPath = path.join(__dirname, 'scrape.js');
    const scrapeScriptContent = fs.readFileSync(scrapeScriptPath, 'utf8');
    await page.evaluate(scrapeScriptContent);
    console.log("Scrape script injected.");
    
    // Call the extractPropertyData() function defined in scrape.js
    const propertyDetails = await page.evaluate(() => {
      if (typeof extractPropertyData === 'function') {
        return extractPropertyData();
      } else {
        return { error: "Scraping function not found" };
      }
    });
    
    await browser.close();
    console.log("Property details received:", propertyDetails);
    
    // If no valid property data was scraped, return an error
    if (!propertyDetails || propertyDetails.error) {
      console.error("No property details found:", propertyDetails);
      return res.status(500).json({ error: "Scraping function returned no data." });
    }
    
    // Step 2: Forward the scraped property details and original URL to the Python service
    const pythonResponse = await axios.post(PYTHON_SERVICE_URL, {
      url: propertyDetails.url,         // forward the URL explicitly
      property_data: propertyDetails    // forward the full scraped data
    });
    
    console.log("Python service response:", pythonResponse.data);
    res.json(pythonResponse.data);
    
  } catch (error) {
    console.error("Error in /api/analyze-property:", error.response ? error.response.data : error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
