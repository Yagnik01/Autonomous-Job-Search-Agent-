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