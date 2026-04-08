/**
 * routes/apply.js
 * Auto-Apply API Routes
 */

const express = require('express');
const router = express.Router();
const { autoApplyToJob } = require('../agents/autoApply');
const { getApplicationHistory, alreadyApplied } = require('../utils/memory');