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

/**
 * POST /api/agent/chat
 * General AI chat endpoint for the assistant
 * Body: { message: "What jobs should I apply for?", history: [...] }
 */
router.post('/chat', async (req, res) => {
  const { message, history = [] } = req.body;

  if (!message) {
    return res.status(400).json({ success: false, error: 'Message is required' });
  }

  try {
    // Build context from memory
    const recentSearches = getSearchHistory(3)
      .map(s => `- Searched for: "${s.query}" (${s.resultsCount} results)`)
      .join('\n');

    const recentApps = getApplicationHistory(3)
      .map(a => `- Applied to: ${a.jobTitle} at ${a.company} (${a.status})`)
      .join('\n');

    const systemPrompt = `You are JobAgent AI, a helpful assistant for job searching and career advice.
You help users find jobs, prepare applications, write cover letters, and navigate their job search.

Recent user activity:
${recentSearches || 'No recent searches'}
${recentApps || 'No recent applications'}

Be concise, actionable, and encouraging. Keep responses under 150 words.`;

    // Build messages array with history
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-6), // Keep last 6 messages for context
      { role: 'user', content: message }
    ];

    const { chat } = require('../utils/groqClient');
    const response = await chat(messages, { max_tokens: 300 });

    res.json({ success: true, response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/agent/memory
 * Get agent memory (searches + applications)
 */
router.get('/memory', (req, res) => {
  try {
    res.json({
      success: true,
      searches: getSearchHistory(10),
      applications: getApplicationHistory(10)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;