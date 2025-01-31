/****************************************************
 * 1) IMPORTS & ENV SETUP
 ****************************************************/
const express = require('express');
const path = require('path');
require('dotenv').config(); // Loads .env variables into process.env
const { createClient } = require('redis');
const db = require('./db'); // PostgreSQL connection

/****************************************************
 * 2) SET UP REDIS CLIENT (v4)
 ****************************************************/
const redisClient = createClient({
  url: 'redis://localhost:6379', // adjust if your Redis is elsewhere
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

// Connect to Redis asynchronously
(async () => {
  await redisClient.connect();
  console.log('✅ Connected to Redis!');
})();

/****************************************************
 * 3) INITIALIZE EXPRESS APP
 ****************************************************/
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Serve the public folder as static (HTML, CSS, client-side JS)
app.use(express.static(path.join(__dirname, '../public')));

/****************************************************
 * 4) ROUTE: Example API route for comps
 ****************************************************/
app.get('/api/compare', (req, res) => {
  res.json({
    address: req.query.address,
    comparables: [
      { id: 1, address: '123 Maple Street', price: 400000 },
      { id: 2, address: '456 Oak Avenue', price: 420000 },
    ],
  });
});

/****************************************************
 * 5) ROUTE: Example API route for sign-in
 ****************************************************/
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (email === 'test@example.com' && password === 'secret') {
    return res.json({ success: true, token: 'abc123' });
  }
  return res.status(401).json({ success: false, message: 'Invalid credentials' });
});

/****************************************************
 * 6) ROUTE: /api/realie-property
 *    Calls Realie.ai for property info, with Redis caching.
 ****************************************************/
app.post('/api/realie-property', async (req, res) => {
  try {
    const { address, city, state, postal_code, country } = req.body;
    const REALIE_API_KEY = process.env.REALIE_API_KEY;

    if (!REALIE_API_KEY) {
      return res.status(500).json({ error: 'Missing REALIE_API_KEY in environment variables' });
    }

    const cacheKey = `realie:${address}:${city}:${state}:${postal_code}:${country}`;
    const cachedValue = await redisClient.get(cacheKey);

    if (cachedValue) {
      console.log('✅ Serving Realie.ai data from Redis cache');
      return res.json({ success: true, data: JSON.parse(cachedValue) });
    }

    const url = `https://app.realie.ai/api/public/property/search?address=${encodeURIComponent(
      address
    )}&city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}&postal_code=${encodeURIComponent(
      postal_code
    )}&country=${encodeURIComponent(country)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: REALIE_API_KEY },
    });

    if (!response.ok) {
      const errorMsg = await response.text();
      return res.status(response.status).json({ error: errorMsg });
    }

    const realieData = await response.json();
    await redisClient.set(cacheKey, JSON.stringify(realieData), { EX: 86400 });

    console.log('✅ Fetched data from Realie.ai, cached in Redis');
    return res.json({ success: true, data: realieData });
  } catch (error) {
    console.error('❌ Error calling Realie.ai:', error);
    return res.status(500).json({ error: 'An error occurred when calling Realie.ai.' });
  }
});

/****************************************************
 * 7) ROUTE: /api/premium-comps
 *    Fetches Realie Premium Comparables
 ****************************************************/
app.get('/api/premium-comps', async (req, res) => {
  try {
    const REALIE_API_KEY = process.env.REALIE_API_KEY;
    if (!REALIE_API_KEY) {
      return res.status(500).json({ error: 'Missing REALIE_API_KEY' });
    }

    const url = 'https://app.realie.ai/api/public/premium/comparables/';
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: REALIE_API_KEY },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: await response.text() });
    }

    const data = await response.json();
    return res.json({ success: true, data });
  } catch (error) {
    console.error('❌ Error fetching premium comps:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/****************************************************
 * 8) ROUTE: /api/comparables
 *    Insert and Retrieve Data from PostgreSQL
 ****************************************************/

/** ✅ Insert a New Comparable Property */
app.post('/api/comparables', async (req, res) => {
  try {
    const { address, city, state, zip_code, latitude, longitude, bedrooms, bathrooms, sale_price } = req.body;

    const result = await db.one(
      `INSERT INTO comparables (address, city, state, zip_code, latitude, longitude, bedrooms, bathrooms, sale_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [address, city, state, zip_code, latitude, longitude, bedrooms, bathrooms, sale_price]
    );

    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('❌ Error inserting into PostgreSQL:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/** ✅ Fetch All Comparables */
app.get('/api/comparables', async (req, res) => {
  try {
    const result = await db.any('SELECT * FROM comparables');
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('❌ Error fetching from PostgreSQL:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/****************************************************
 * 9) START THE SERVER
 ****************************************************/
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
