const { ask, parseJSON } = require('../utils/groqClient');

function generateLinkedInUrl(role, location) {
  const baseUrl = 'https://www.linkedin.com/jobs/search';
  const params = new URLSearchParams({
    keywords: role,
    location: location,
    f_TPR: 'r86400', // Past 24 hours
    f_E: '2', // Full-time
    sortBy: 'DD' // Date posted
  });
  
  return `${baseUrl}?${params.toString()}`;
}


async function parseJobQuery(userQuery) {
  const systemPrompt = `You are a job search query parser. 
Your task is to extract structured information from a user's job search request.

Always respond with ONLY a valid JSON object (no markdown, no explanation) with these fields:
{
  "role": "job title/role being searched",
  "location": "city or region",
  "jobType": "full-time | part-time | remote | contract | internship",
  "experience": "fresher | junior | mid | senior | lead | any",
  "keywords": ["array", "of", "relevant", "skills"],
  "company": "specific company name or null",
  "searchQuery": "optimized LinkedIn search keywords string"
}

If a field is not mentioned, use sensible defaults:
- jobType: "full-time"
- experience: "any"
- keywords: derive from the role
- company: null`;

  const response = await ask(systemPrompt, userQuery);
  const parsed = parseJSON(response);

  if (!parsed) {
    // Fallback: do simple text parsing if AI fails
    console.warn('[QueryParser] AI parse failed, using fallback');
    return fallbackParse(userQuery);
  }

  // Build LinkedIn jobs search URL from parsed params
  parsed.linkedinUrl = buildLinkedInURL(parsed);
  parsed.originalQuery = userQuery;

  console.log('[QueryParser] Parsed query:', parsed);
  return parsed;
}

/**
 * Build LinkedIn Jobs search URL from parsed params
 * @param {Object} params
 * @returns {string} LinkedIn search URL
 */
function buildLinkedInURL(params) {
  const base = 'https://www.linkedin.com/jobs/search/';
  const urlParams = new URLSearchParams();

  // Main keyword: role + key skills
  const keywords = params.role || params.searchQuery || 'developer';
  urlParams.set('keywords', keywords);

  // Location
  if (params.location) {
    urlParams.set('location', params.location);
  }

  // Job type mapping
  const jobTypeMap = {
    'full-time': 'F',
    'part-time': 'P',
    'contract': 'C',
    'internship': 'I',
    'remote': 'R'
  };
  if (params.jobType && jobTypeMap[params.jobType]) {
    urlParams.set('f_JT', jobTypeMap[params.jobType]);
  }

  // Sort by most recent
  urlParams.set('sortBy', 'DD');

  // Number of results
  urlParams.set('count', '10');

  return `${base}?${urlParams.toString()}`;
}


function fallbackParse(query) {
  const lower = query.toLowerCase();

  // Try to extract role (everything before "in" or "at" or "jobs")
  const roleMatch = query.match(/(?:find|search|get|show)?\s*(?:me)?\s*([\w\s]+?)\s+(?:jobs?|positions?|roles?|openings?)/i);
  const role = roleMatch ? roleMatch[1].trim() : 'software developer';

  // Try to extract location
  const locMatch = query.match(/(?:in|at|near|around)\s+([\w\s,]+?)(?:\s+for|\s+with|\s*$)/i);
  const location = locMatch ? locMatch[1].trim() : 'India';

  // Detect experience level
  let experience = 'any';
  if (/senior|sr\.|lead|principal/i.test(lower)) experience = 'senior';
  else if (/junior|jr\.|fresher|entry/i.test(lower)) experience = 'junior';
  else if (/mid|intermediate/i.test(lower)) experience = 'mid';

  // Detect job type
  let jobType = 'full-time';
  if (/remote|wfh/i.test(lower)) jobType = 'remote';
  else if (/intern/i.test(lower)) jobType = 'internship';
  else if (/contract|freelance/i.test(lower)) jobType = 'contract';

  const params = { role, location, jobType, experience, keywords: [role], company: null };
  params.linkedinUrl = buildLinkedInURL(params);
  params.originalQuery = query;

  return params;
}

module.exports = { parseJobQuery, buildLinkedInURL };