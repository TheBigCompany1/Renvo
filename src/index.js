/****************************************************
 * IMPORTS & ENV SETUP
 ****************************************************/
const express = require('express');
const path = require('path');
const axios = require('axios');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:5000/api/analyze-property';

/****************************************************
 * MIDDLEWARE
 ****************************************************/
app.use(express.json());

// Manually set CORS headers for all responses
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
  next();
});

app.use(express.static(path.join(__dirname, '../public')));

/****************************************************
 * ROUTES
 ****************************************************/
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// --- NOTE: This /report route serves a static file ---
// --- The actual report generation is handled by Python ---
app.get('/report', (req, res) => {
  const reportPath = path.join(__dirname, '../backend/agent_service/templates/report.html');
  if (fs.existsSync(reportPath)) {
      res.sendFile(reportPath);
  } else {
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
    console.log("TEST: The /api/analyze-property request was received successfully!");
  
    // For this test, we will send back a fake success response
    // to prove the connection is working.
    res.json({
      reportId: "test-id-12345",
      message: "Server connection is working!"
    });
  });

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});