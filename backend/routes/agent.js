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
