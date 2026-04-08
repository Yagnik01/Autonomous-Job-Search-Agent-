/**
 * routes/agent.js
 * Agent API Routes
 * Handles search orchestration and AI reasoning
 */

const express = require('express');
const router = express.Router();
const { orchestrateSearch } = require('../agents/orchestrator');
const { ask } = require('../utils/groqClient');
const { getSearchHistory, getApplicationHistory } = require('../utils/memory');


/**
 * POST /api/agent/search
 * Main endpoint: parse query → scrape LinkedIn → return jobs
 * Body: { query: "Find frontend developer jobs in Bangalore" }
 */
router.post('/search', async (req, res) => {
    const { query } = req.body;
  
    if (!query || query.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a job search query (e.g., "Find React developer jobs in Bangalore")'
      });
    }
  
    try {
      console.log('[Agent Route] Search request:', query);
      const result = await orchestrateSearch(query.trim());
  
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[Agent Route] Search error:', error.message);
      res.status(500).json({
        success: false,
        error: `Search failed: ${error.message}`
      });
    }
  });
  