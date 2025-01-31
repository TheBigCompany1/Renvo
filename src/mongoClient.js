// src/mongoClient.js

const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config(); // loads MONGODB_URI from .env

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('Missing MONGODB_URI in environment variables');
}

// Create a single, reusable client
let client;

// This function will connect or return the existing connection
async function connectToMongo() {
  try {
    if (!client) {
      // We create the client with the new serverApi version, as per MongoDB docs
      client = new MongoClient(uri, {
        serverApi: {
          version: ServerApiVersion.v1,
          strict: true,
          deprecationErrors: true,
        },
      });
    }

    // If not connected, connect
    if (!client.topology || !client.topology.isConnected()) {
      console.log('Attempting to connect to MongoDB Atlas...');
      await client.connect();
      console.log('Connected to MongoDB Atlas!');

      // Optionally do a ping to verify
      await client.db('admin').command({ ping: 1 });
      console.log('Pinged your deployment. You successfully connected to MongoDB!');
    }

    // Return the "renvo" database (or any name you want)
    return client.db('renvo');
  } catch (err) {
    console.error('Failed to connect to MongoDB Atlas:', err);
    throw err; // re-throw so the calling route sees the error
  }
}

module.exports = { connectToMongo };
