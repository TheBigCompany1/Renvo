const fetch = require('node-fetch');
const { Client } = require('pg');
require('dotenv').config();

// Set your RapidAPI credentials from environment variables (or hard-code for testing)
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '0f364140e6msh60b1951021ca933p11af5djsn92511c03dc20';
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'us-real-estate-listings.p.rapidapi.com';

// Configure your PostgreSQL connection
const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgres://neondb_owner:npg_ApBwV7kb9jcn@ep-twilight-poetry-a6wq1u66-pooler.us-west-2.aws.neon.tech/neondb?sslmode=require'
});

async function fetchAndSavePhotos(propertyId) {
  try {
    // Fetch property photos from RapidAPI
    const url = `https://${RAPIDAPI_HOST}/propertyPhotos?id=${encodeURIComponent(propertyId)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      throw new Error(`API error: ${await response.text()}`);
    }
    const data = await response.json();
    const photos = data.photos || [];

    // Insert each photo into the database
    await client.query('BEGIN');
    for (let i = 0; i < photos.length; i++) {
      await client.query(
        'INSERT INTO property_photos(property_id, photo_url, photo_order) VALUES($1, $2, $3)',
        [propertyId, photos[i], i + 1]
      );
    }
    await client.query('COMMIT');
    console.log(`Inserted ${photos.length} photos for property ID ${propertyId}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`Error processing property ${propertyId}:`, error);
  }
}

async function main() {
  try {
    await client.connect();

    // Example: Use an array of property IDs to fetch and store photos
    const propertyIds = ['9366731748', 'ANOTHER_PROPERTY_ID']; // Replace with actual IDs

    for (const propertyId of propertyIds) {
      await fetchAndSavePhotos(propertyId);
    }
  } catch (error) {
    console.error('Error in main:', error);
  } finally {
    await client.end();
  }
}

main();
