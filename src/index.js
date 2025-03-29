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

// Middleware to parse JSON bodies
app.use(express.json());
// Serve static files from the public folder
app.use(express.static(path.join(__dirname, '../public')));

/****************************************************
 * ENDPOINT: /api/analyze-property
 * This endpoint accepts a property URL, uses Puppeteer to load
 * the page, injects our local scrape.js script to extract property
 * details, then constructs a prompt to instruct ChatGPT to return
 * valid JSON with investment proposals.
 ****************************************************/
app.post('/api/analyze-property', async (req, res) => {
  try {
    const { url } = req.body;
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
    
    // Change waitUntil to 'domcontentloaded' with a finite timeout (e.g., 30 seconds)
    console.log("Navigating to:", url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log("Page loaded (domcontentloaded).");
    
    // Read the scrape.js file from disk and inject it into the page
    const scrapeScriptPath = path.join(__dirname, 'scrape.js');
    const scrapeScriptContent = fs.readFileSync(scrapeScriptPath, 'utf8');
    await page.evaluate(scrapeScriptContent);
    console.log("Scrape script injected.");
    
    // Call the extractPropertyData function defined in scrape.js
    const propertyDetails = await page.evaluate(() => {
      if (typeof extractPropertyData === 'function') {
        return extractPropertyData();
      } else {
        return { error: "Scraping function not found" };
      }
    });
    
    await browser.close();
    console.log("Property details received:", propertyDetails);
    
    // If propertyDetails is null or contains an error, return an error response.
    if (!propertyDetails || propertyDetails.error) {
      console.error("No property details found:", propertyDetails);
      return res.status(500).json({ error: "Scraping function returned no data." });
    }
    
    // Step 2: Construct a prompt using the scraped property details
    const prompt = `
You are a real estate investment assistant tasked with analyzing prospective properties for investors and home buyers. Your analysis must comprehensively identify the potential return on investment (ROI), rental income potential, cost breakdowns, market insights, and risks.

Based on the property details provided, deliver multiple investment proposals in valid JSON format.

Each proposal must include these detailed fields:

Title: Brief and descriptive title of the proposal.
Costs: Itemized cost breakdown including materials, labor, permits, and contingencies.
ROI: Provide both a percentage and dollar amount.
ProjectedRentalIncome: Estimated monthly and yearly rental income with vacancy rate considerations.
CashFlowAnalysis: Monthly/annual cash flow estimate after mortgage payments, maintenance, property taxes, insurance, and management fees.
ComparableProperties: Recent sale prices, price per square foot, and days on market for similar nearby properties.
MarketTrends: Neighborhood appreciation rates, demographic shifts, infrastructure changes, and economic indicators.
ZoningAndPermits: Explanation of relevant zoning restrictions/opportunities, permit requirements, estimated timelines, and associated costs.
SustainabilityMetrics: Information about potential eco-friendly upgrades, estimated upfront costs, and ongoing savings.
RiskAssessment: Clearly identify possible risks, their likelihood, and proposed mitigation strategies.
BuyerProfile: A demographic and behavioral profile for the ideal buyer or investor targeted by this proposal.
Details: Clear, succinct details outlining the renovation/design plans, amenities, style choices, and expected appeal factors.

Order the investment proposals by ROI, from highest to lowest in dollar amount.

Do not include any extra commentary or text outside the JSON structure provided.

Property details:
Address: ${propertyDetails.address}, ${propertyDetails.city}, ${propertyDetails.state} ${propertyDetails.zip_code}
Price: ${propertyDetails.price}
Beds: ${propertyDetails.beds}
Baths: ${propertyDetails.baths}
Square Footage: ${propertyDetails.sqft}
Description: ${propertyDetails.description}
Last Sold: ${propertyDetails.last_sold}

Return your answer strictly in the following JSON structure:
{
  "success": true,
  "data": [
    {
      "title": "Example Title",
      "costs": "Example Costs",
      "roi": "Example ROI",
      "projectedRentalIncome": "Example Rental Income",
      "cashFlowAnalysis": "Example Cash Flow Analysis",
      "comparableProperties": "Example Comparable Properties",
      "marketTrends": "Example Market Trends",
      "zoningAndPermits": "Example Zoning And Permits",
      "sustainabilityMetrics": "Example Sustainability Metrics",
      "riskAssessment": "Example Risk Assessment",
      "buyerProfile": "Example Buyer Profile",
      "details": "Example Details"
    }
  ]
}
`;
    console.log("Constructed prompt:", prompt);
    
    // Step 3: Call the OpenAI API using the constructed prompt
    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 16384
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        }
      }
    );
    
    let chatGPTText = openaiResponse.data.choices[0].message.content;
    console.log("Raw ChatGPT response:", chatGPTText);
    
    // Remove markdown code fences if present
    chatGPTText = chatGPTText.trim();
    if (chatGPTText.startsWith('```')) {
      chatGPTText = chatGPTText.replace(/^```(?:json)?\s*/, '').replace(/```$/, '').trim();
    }
    
    let parsed;
    try {
      parsed = JSON.parse(chatGPTText);
    } catch (e) {
      console.error("Error parsing ChatGPT JSON:", e);
      return res.status(500).json({ error: "ChatGPT did not return valid JSON." });
    }
    
    console.log("Parsed ChatGPT response:", parsed);
    res.json(parsed);
    
  } catch (error) {
    console.error("Error in /api/analyze-property:", error.response ? error.response.data : error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
