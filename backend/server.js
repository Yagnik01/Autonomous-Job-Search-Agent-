/**
 * server.js - Main Express Server
 * AI Job Agent Backend
 */

require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Simple health check to ensure the server is running
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;