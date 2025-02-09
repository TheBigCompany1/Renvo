/****************************************************
 * 1) IMPORTS & ENV SETUP
 ****************************************************/
const express = require('express');
const path = require('path');
require('dotenv').config(); // Loads .env variables into process.env
const fetch = require('node-fetch'); // Install via: npm install node-fetch
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
 * 6.5) NEW ROUTE: /api/property-photos
 *    Uses RapidAPI's US Real Estate Listings API to fetch property photos.
 *
 *    This route expects a query parameter "id" (the property ID).
 *
 *    Example RapidAPI call:
 *    GET https://us-real-estate-listings.p.rapidapi.com/propertyPhotos?id=9366731748
 ****************************************************/
app.get('/api/property-photos', async (req, res) => {
  try {
    // Extract the property id from query parameters.
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: 'Property id is required' });
    }

    // Use RapidAPI credentials from environment variables, with fallback values.
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '0f364140e6msh60b1951021ca933p11af5djsn92511c03dc20';
    const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'us-real-estate-listings.p.rapidapi.com';

    const url = `https://${RAPIDAPI_HOST}/propertyPhotos?id=${encodeURIComponent(id)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorMsg = await response.text();
      return res.status(response.status).json({ error: errorMsg });
    }

    const data = await response.json();
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching property photos:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/****************************************************
 * 6.6) NEW ROUTE: /api/save-property-photos
 *    Fetches property photos from RapidAPI and stores them
 *    in a normalized schema in PostgreSQL.
 *
 *    It expects a JSON body with a property id:
 *    { "id": "9366731748" }
 *
 *    For each photo URL in the API response, a row is inserted into the property_photos table.
 ****************************************************/
app.post('/api/save-property-photos', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Property id is required in the request body.' });
    }

    // Use RapidAPI credentials
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '0f364140e6msh60b1951021ca933p11af5djsn92511c03dc20';
    const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'us-real-estate-listings.p.rapidapi.com';

    const url = `https://${RAPIDAPI_HOST}/propertyPhotos?id=${encodeURIComponent(id)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorMsg = await response.text();
      return res.status(response.status).json({ error: errorMsg });
    }

    const data = await response.json();

    // Assume the API response contains an array of photo URLs under data.photos
    const photos = data.photos || [];
    let insertedCount = 0;

    for (let i = 0; i < photos.length; i++) {
      const photo_url = photos[i];
      // Insert normalized data: property id, photo URL, and photo order.
      await db.none(
        'INSERT INTO property_photos(property_id, photo_url, photo_order) VALUES($1, $2, $3)',
        [id, photo_url, i + 1]
      );
      insertedCount++;
    }

    return res.json({ success: true, message: 'Property photos saved', count: insertedCount });
  } catch (error) {
    console.error('Error saving property photos:', error);
    return res.status(500).json({ error: 'Internal server error' });
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
 * NEW ROUTE: /api/search-property
 * This endpoint accepts a query parameter "address"
 * and returns properties from the comparables table
 * that match the given address (using a case‑insensitive search).
 ****************************************************/
app.get('/api/search-property', async (req, res) => {
  try {
    const { address } = req.query;
    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }
    // Search across multiple fields for a better match.
    const result = await db.any(
      "SELECT * FROM properties WHERE (address || ' ' || city || ' ' || state || ' ' || zip_code) ILIKE $1",
      [`%${address}%`]
    );
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error searching property:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
/****************************************************
 * NEW ROUTE: /api/property-addresses
 * Returns a list of property addresses matching the search term.
 ****************************************************/
app.get('/api/property-addresses', async (req, res) => {
  try {
    const { search } = req.query;
    if (!search) {
      return res.json({ success: true, data: [] });
    }
    // Query the properties table for addresses matching the search term (case-insensitive)
    const results = await db.any(
      "SELECT id, address, city, state, zip_code FROM properties WHERE address ILIKE $1 LIMIT 10",
      [`%${search}%`]
    );
    res.json({ success: true, data: results });
  } catch (error) {
    console.error("Error fetching property addresses:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});
/****************************************************
 * NEW ROUTE: /api/hbu-recommendations
 * This endpoint accepts a query parameter "property_id"
 * and returns the HBU recommendations for that property.
 ****************************************************/
app.get('/api/hbu-recommendations', async (req, res) => {
  try {
    const { property_id } = req.query;
    if (!property_id) {
      return res.status(400).json({ success: false, error: 'Property id is required' });
    }
    const recommendations = await db.any('SELECT * FROM hbu_recommendations WHERE property_id = $1', [property_id]);
    res.json({ success: true, data: recommendations });
  } catch (error) {
    console.error('Error fetching HBU recommendations:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});
/****************************************************
 * NEW ROUTE: /api/hbu-model
 * This endpoint generates highest and best use (HBU) recommendations
 * using simple rule-based logic based on the property details.
 * It accepts a query parameter "property_id".
 ****************************************************/
app.get('/api/hbu-model', async (req, res) => {
  try {
    const { property_id } = req.query;
    if (!property_id) {
      return res.status(400).json({ success: false, error: 'Property id is required' });
    }
    
    // Fetch property details from the database
    const property = await db.one('SELECT * FROM properties WHERE id = $1', [property_id]);
    
    const recommendations = [];

    if (property.square_footage >= 2000 && property.beds >= 4) {
      recommendations.push({
        recommendation: 'Renovate for Multi-Family Rental',
        cost_estimate: '$300,000',
        expected_roi: '10-12%',
        timeline: '6-8 months',
        comparable_links: ['https://www.zillow.com/homedetails/Example1', 'https://www.zillow.com/homedetails/Example2'],
        analysis: 'The property’s spacious layout and multiple bedrooms indicate potential for conversion into multiple rental units. Local comps suggest that multi-family units yield higher rental income.'
      });
    }

    if (property.lot_size >= 5000) {
      recommendations.push({
        recommendation: 'Add an Accessory Dwelling Unit (ADU)',
        cost_estimate: '$150,000',
        expected_roi: '8-10%',
        timeline: '4-6 months',
        comparable_links: ['https://www.zillow.com/homedetails/Example3'],
        analysis: 'The large lot size provides the opportunity to add an ADU, increasing rental income without a full conversion. Local market data supports this approach.'
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        recommendation: 'Maintain Current Use',
        cost_estimate: 'N/A',
        expected_roi: 'N/A',
        timeline: 'N/A',
        comparable_links: [],
        analysis: 'There are no significant opportunities identified based on the current property data. Incremental improvements may be the best approach.'
      });
    }

    return res.json({ success: true, data: recommendations });
  } catch (error) {
    console.error('Error in HBU model:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});
// NEW ROUTE: Get photos from the database for a given property
app.get('/api/property-photos-db', async (req, res) => {
  try {
    const { property_id } = req.query;
    if (!property_id) {
      return res.status(400).json({ error: 'Property id is required' });
    }
    const photos = await db.any('SELECT photo_url, photo_order FROM property_photos WHERE property_id = $1 ORDER BY photo_order', [property_id]);
    res.json({ success: true, data: photos });
  } catch (error) {
    console.error('Error fetching property photos from DB:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
/****************************************************
 * 9) START THE SERVER
 ****************************************************/
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
