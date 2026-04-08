/**
 * routes/apply.js
 * Auto-Apply API Routes
 */

const express = require('express');
const router = express.Router();
const { autoApplyToJob } = require('../agents/autoApply');
const { getApplicationHistory, alreadyApplied } = require('../utils/memory');



router.post('/job', async (req, res) => {
  const { jobUrl, jobTitle, company, userProfile } = req.body;

  if (!jobUrl) {
    return res.status(400).json({ success: false, error: 'jobUrl is required' });
  }

  // Check if already applied
  if (alreadyApplied(jobUrl)) {
    return res.json({
      success: false,
      alreadyApplied: true,
      message: 'You have already applied to this job.'
    });
  }

  // Merge with env defaults if userProfile not provided
  const profile = {
    name: userProfile?.name || process.env.USER_NAME || 'John Doe',
    email: userProfile?.email || process.env.USER_EMAIL || 'user@example.com',
    phone: userProfile?.phone || process.env.USER_PHONE || '',
    location: userProfile?.location || process.env.USER_LOCATION || 'Bangalore, India',
    linkedin: userProfile?.linkedin || ''
  };

  try {
    console.log('[Apply Route] Starting auto-apply for:', jobUrl);

    const result = await autoApplyToJob(
      jobUrl,
      profile,
      { title: jobTitle, company }
    );

    res.json({ success: result.success, ...result });
  } catch (error) {
    console.error('[Apply Route] Error:', error.message);
    res.status(500).json({
      success: false,
      error: `Auto-apply failed: ${error.message}`
    });
  }
});

/**
 * GET /api/apply/history
 * Get application history
 */
router.get('/history', (req, res) => {
  try {
    const history = getApplicationHistory(20);
    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;