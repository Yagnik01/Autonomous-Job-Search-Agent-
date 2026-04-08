const puppeteer = require('puppeteer');

/**
 * Scrape job listings from LinkedIn
 * @param {string} searchUrl - LinkedIn jobs search URL
 * @param {number} maxResults - Max jobs to return (default 10)
 * @returns {Array} Array of job objects
 */
async function scrapeLinkedInJobs(searchUrl, maxResults = 10) {
  let browser = null;

  try {
    console.log('[Scraper] Launching Puppeteer...');
    console.log('[Scraper] URL:', searchUrl);

    // Launch browser in headless mode
    browser = await puppeteer.launch({
      headless: 'new', // Use new headless mode
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--window-size=1280,720'
      ]
    });

    const page = await browser.newPage();

    // Set realistic user agent to avoid bot detection
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Set viewport
    await page.setViewport({ width: 1280, height: 720 });

    // Navigate to LinkedIn jobs page
    console.log('[Scraper] Navigating to LinkedIn...');
    await page.goto(searchUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for job cards to load
    console.log('[Scraper] Waiting for job listings...');
    
    // LinkedIn uses different selectors - try multiple
    const jobCardSelectors = [
      '.job-search-card',
      '.jobs-search__results-list li',
      '[data-entity-urn]',
      '.base-card'
    ];

    let jobsFound = false;
    for (const selector of jobCardSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 8000 });
        jobsFound = true;
        console.log(`[Scraper] Found jobs with selector: ${selector}`);
        break;
      } catch {
        // Try next selector
      }
    }

    if (!jobsFound) {
      console.log('[Scraper] No job cards found, using mock data');
      return getMockJobs(searchUrl);
    }

    // Extract job data from the page
    const jobs = await page.evaluate((max) => {
      const results = [];

      // Try multiple card selectors (LinkedIn changes their HTML often)
      const cardSelectors = [
        '.job-search-card',
        '.jobs-search__results-list li',
        '.base-card',
        '[data-entity-urn]'
      ];

      let cards = [];
      for (const sel of cardSelectors) {
        cards = document.querySelectorAll(sel);
        if (cards.length > 0) break;
      }

      cards.forEach((card, index) => {
        if (index >= max) return;

        // Extract job title
        const titleEl = card.querySelector(
          '.base-search-card__title, h3.base-card__full-link, ' +
          '.job-search-card__title, h3'
        );
        const title = titleEl ? titleEl.textContent.trim() : 'Unknown Title';

        // Extract company name
        const companyEl = card.querySelector(
          '.base-search-card__subtitle, h4.base-card__subtitle, ' +
          '.job-search-card__company-name, h4'
        );
        const company = companyEl ? companyEl.textContent.trim() : 'Unknown Company';

        // Extract location
        const locationEl = card.querySelector(
          '.job-search-card__location, .base-search-card__metadata, ' +
          '.job-card-container__metadata-item'
        );
        const location = locationEl ? locationEl.textContent.trim() : '';

        // Extract job link
        const linkEl = card.querySelector('a.base-card__full-link, a');
        const link = linkEl ? linkEl.href : '';

        // Extract posted date if available
        const dateEl = card.querySelector(
          'time, .job-search-card__listdate, .base-search-card__metadata time'
        );
        const postedDate = dateEl
          ? (dateEl.getAttribute('datetime') || dateEl.textContent.trim())
          : '';

        if (title && title !== 'Unknown Title') {
          results.push({ title, company, location, link, postedDate });
        }
      });

      return results;
    }, maxResults);

    console.log(`[Scraper] Extracted ${jobs.length} jobs`);

    // If we got very few results, supplement with mock data
    if (jobs.length < 3) {
      console.log('[Scraper] Few results, supplementing with mock data');
      return [...jobs, ...getMockJobs(searchUrl, maxResults - jobs.length)];
    }

    return jobs;

  } catch (error) {
    console.error('[Scraper Error]', error.message);
    // Return mock data on error so the demo still works
    console.log('[Scraper] Returning mock data due to error');
    return getMockJobs(searchUrl);

  } finally {
    if (browser) {
      await browser.close();
      console.log('[Scraper] Browser closed');
    }
  }
}
/** 
 * @param {string} searchUrl - Used to infer role/location for relevant mocks
 * @param {number} count
 */
function getMockJobs(searchUrl = '', count = 10) {
  // Parse role and location from URL for more relevant mocks
  let role = 'Software Developer';
  let location = 'Bangalore, India';

  try {
    const url = new URL(searchUrl);
    const keywords = url.searchParams.get('keywords') || 'Software Developer';
    const loc = url.searchParams.get('location') || 'Bangalore';
    role = keywords.replace(/\+/g, ' ');
    location = loc.replace(/\+/g, ' ');
  } catch {}

  const companies = [
    'Google', 'Microsoft', 'Amazon', 'Flipkart', 'Swiggy',
    'Zomato', 'Razorpay', 'Freshworks', 'Infosys', 'Wipro',
    'TCS', 'Accenture', 'PhonePe', 'CRED', 'Meesho'
  ];

  const jobTypes = [
    `Senior ${role}`, `Junior ${role}`, `${role} II`,
    `Lead ${role}`, `${role} Engineer`, `Staff ${role}`,
    `Principal ${role}`, `${role} (Remote)`, `${role} - Startup`,
    `${role} Intern`
  ];

  return Array.from({ length: Math.min(count, 10) }, (_, i) => ({
    title: jobTypes[i] || `${role} - Position ${i + 1}`,
    company: companies[i] || `Tech Company ${i + 1}`,
    location: i % 3 === 0 ? 'Remote' : location,
    link: `https://www.linkedin.com/jobs/view/${1000000 + i * 12345}/`,
    postedDate: `${i + 1} day${i > 0 ? 's' : ''} ago`,
    isMock: true
  }));
}

module.exports = { scrapeLinkedInJobs, getMockJobs };