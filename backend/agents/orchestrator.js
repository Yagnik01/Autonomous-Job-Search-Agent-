/**
 * agents/orchestrator.js
 * Main search orchestration logic
 * - AutoApply (Executor)
 * 
 * Uses Groq to reason about actions and decisions.
 */

const { ask, parseJSON } = require('../utils/groqClient');
const { parseJobQuery } = require('./queryParser');
const { scrapeLinkedInJobs } = require('./linkedinScraper');
const { saveSearch } = require('../utils/memory');

/**
 * Orchestrate a complete job search
 * Called by the /api/agent/search endpoint
 * 
 * @param {string} userQuery - Natural language job search query
 * @returns {Object} { parsedQuery, jobs, agentThoughts, searchUrl }
 */
async function orchestrateSearch(userQuery) {
  console.log('\n[Orchestrator] ══════════════════════════════');
  console.log('[Orchestrator] Starting job search pipeline');
  console.log('[Orchestrator] User query:', userQuery);

  const agentThoughts = [];

  // ─── Step 1: Plan (Parse user intent) ────────────────
  agentThoughts.push({
    phase: 'planning',
    thought: `Analyzing query: "${userQuery}" to extract job role, location, and preferences.`
  });

  const parsedQuery = await parseJobQuery(userQuery);

  agentThoughts.push({
    phase: 'planning',
    thought: `Identified role: "${parsedQuery.role}", location: "${parsedQuery.location}", ` +
             `type: "${parsedQuery.jobType}", experience: "${parsedQuery.experience}"`,
    data: parsedQuery
  });

  // ─── Step 2: Reason about search strategy ─────────────
  const strategyThought = await reasonAboutStrategy(parsedQuery);
  agentThoughts.push({
    phase: 'reasoning',
    thought: strategyThought
  });

  // ─── Step 3: Execute (Scrape LinkedIn) ────────────────
  agentThoughts.push({
    phase: 'executing',
    thought: `Searching LinkedIn for: ${parsedQuery.linkedinUrl}`
  });

  const jobs = await scrapeLinkedInJobs(parsedQuery.linkedinUrl, 10);

  agentThoughts.push({
    phase: 'executing',
    thought: `Found ${jobs.length} job listings. Filtering and ranking results...`
  });

  // ─── Step 4: Rank/Filter results with AI ──────────────
  const rankedJobs = await rankJobResults(jobs, parsedQuery);

  agentThoughts.push({
    phase: 'analysis',
    thought: `Ranked ${rankedJobs.length} jobs by relevance. Top match: "${rankedJobs[0]?.title}" at "${rankedJobs[0]?.company}"`
  });

  // ─── Step 5: Save to memory ───────────────────────────
  saveSearch({
    query: userQuery,
    parsedQuery,
    resultsCount: rankedJobs.length,
    topResult: rankedJobs[0] || null
  });

  agentThoughts.push({
    phase: 'memory',
    thought: 'Search saved to agent memory for future reference.'
  });

  console.log('[Orchestrator] Pipeline complete. Jobs found:', rankedJobs.length);

  return {
    parsedQuery,
    jobs: rankedJobs,
    agentThoughts,
    searchUrl: parsedQuery.linkedinUrl
  };
}

/**
 * Use Groq to reason about the best search strategy
 */
async function reasonAboutStrategy(parsedQuery) {
  try {
    const prompt = `You are a job search agent. Given these search parameters:
Role: ${parsedQuery.role}
Location: ${parsedQuery.location}
Job Type: ${parsedQuery.jobType}
Experience: ${parsedQuery.experience}
Keywords: ${(parsedQuery.keywords || []).join(', ')}

In one sentence, describe the search strategy you'll use to find the best matches.`;

    const thought = await ask(
      'You are a concise job search AI agent. Respond in exactly 1-2 sentences.',
      prompt,
      { temperature: 0.5, max_tokens: 100 }
    );
    return thought.trim();
  } catch {
    return `Searching for ${parsedQuery.role} positions in ${parsedQuery.location} on LinkedIn.`;
  }
}

/**
 * Use Groq to rank and score job results by relevance
 * Falls back to original order if AI fails
 */
async function rankJobResults(jobs, parsedQuery) {
  if (jobs.length === 0) return [];

  try {
    const systemPrompt = `You are a job relevance scorer.
Given a job search query and a list of jobs, rank them by relevance.
Respond with ONLY a JSON array of indices (0-based) in order of relevance.
Example: [2, 0, 4, 1, 3]`;

    const jobList = jobs
      .map((j, i) => `${i}: "${j.title}" at ${j.company} (${j.location})`)
      .join('\n');

    const userMessage = `Search: ${parsedQuery.role} in ${parsedQuery.location}\n\nJobs:\n${jobList}`;

    const response = await ask(systemPrompt, userMessage, { max_tokens: 200 });
    const indices = parseJSON(response);

    if (Array.isArray(indices) && indices.length > 0) {
      // Reorder jobs by AI ranking
      const ranked = indices
        .filter(i => i >= 0 && i < jobs.length)
        .map(i => ({ ...jobs[i], relevanceRank: indices.indexOf(i) + 1 }));

      // Add any missing jobs at the end
      const missing = jobs.filter((_, i) => !indices.includes(i));
      return [...ranked, ...missing];
    }
  } catch (err) {
    console.warn('[Orchestrator] Ranking failed, using original order:', err.message);
  }

  // Fallback: return original order with rank numbers
  return jobs.map((job, i) => ({ ...job, relevanceRank: i + 1 }));
}

module.exports = { orchestrateSearch };