// src/index.js

const express = require('express');
const path = require('path');
const fetch = require('node-fetch'); // or skip if using Node 18+ built-in fetch
require('dotenv').config(); // loads variables from .env into process.env

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Serve the public folder as static (HTML, CSS, client-side JS)
app.use(express.static(path.join(__dirname, '../public')));

/**
 * ORIGINAL ROUTE #1: Example API route for comps
 */
app.get('/api/compare', (req, res) => {
  const address = req.query.address;
  // In reality, you'd query your real estate data or an external API here
  // For now, send back a placeholder JSON
  res.json({
    address: address,
    comparables: [
      { id: 1, address: '123 Maple Street', price: 400000 },
      { id: 2, address: '456 Oak Avenue', price: 420000 }
    ]
  });
});

/**
 * ORIGINAL ROUTE #2: Example API route for sign-in
 */
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  // Placeholder logic:
  if (email === 'test@example.com' && password === 'secret') {
    return res.json({ success: true, token: 'abc123' });
  }
  return res.status(401).json({ success: false, message: 'Invalid credentials' });
});

/**
 * NEW ROUTE: Call Realie.ai for property info.
 * Adjust field names & endpoint according to Realie.ai docs.
 */
app.post('/api/realie-property', async (req, res) => {
  try {
    // Destructure the request body to get address info
    // Note: Realie.ai’s docs use `postal_code`, `country`, etc. 
    const { address, city, state, postal_code, country } = req.body;

    // Load the Realie API key from .env
    const REALIE_API_KEY = process.env.REALIE_API_KEY;
    if (!REALIE_API_KEY) {
      return res.status(500).json({
        error: 'Missing REALIE_API_KEY in environment variables'
      });
    }

    // Make the HTTP request to Realie.ai (per their docs):
    const response = await fetch('https://api.realie.ai/api/v1/property/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${REALIE_API_KEY}`
      },
      body: JSON.stringify({
        address,
        city,
        state,
        postal_code,
        country
      })
    });

    // If the response is not OK, return an error
    if (!response.ok) {
      const errorMsg = await response.text();
      return res.status(response.status).json({ error: errorMsg });
    }

    // Parse the JSON data from Realie.ai
    const realieData = await response.json();

    // Return the data to the front-end
    res.json({ success: true, data: realieData });
  } catch (error) {
    console.error('Error calling Realie.ai:', error);
    res.status(500).json({ error: 'An error occurred when calling Realie.ai.' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});