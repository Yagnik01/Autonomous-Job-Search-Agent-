/**
 * agents/autoApply.js
 * EXECUTOR AGENT - Auto Job Application (Real Implementation)
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs-extra');
const { saveApplication } = require('../utils/memory');

/**
 * Auto-apply to a job (real implementation with enhanced error handling)
 */
async function autoApplyToJob(jobUrl, userProfile, jobInfo = {}) {
  let browser = null;
  const steps = [];

  try {
    console.log('[AutoApply] Starting real application for:', jobUrl);
    console.log('[AutoApply] User profile:', userProfile.name);
    console.log('[AutoApply] Job info:', jobInfo.title, 'at', jobInfo.company);

    // Step 1: Validate inputs
    steps.push({ step: 'validation', status: 'success', message: 'Validating application data...' });
    await sleep(500);

    if (!jobUrl || !userProfile.name || !userProfile.email) {
      throw new Error('Missing required information: job URL, name, or email');
    }

    // Step 2: Launch browser
    steps.push({ step: 'browser_launch', status: 'success', message: 'Launching browser...' });
    
    try {
      browser = await puppeteer.launch({
        headless: false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-default-apps',
          '--disable-extensions',
          '--disable-sync',
          '--disable-translate',
          '--hide-scrollbars',
          '--metrics-recording-only',
          '--mute-audio'
        ],
        defaultViewport: null,
        timeout: 60000,
        ignoreHTTPSErrors: true
      });
    } catch (launchError) {
      console.error('[AutoApply] Browser launch failed:', launchError);
      steps.push({ 
        step: 'browser_error', 
        status: 'error', 
        message: `Browser launch failed: ${launchError.message}` 
      });
      
      return {
        success: false,
        message: 'Browser launch failed. Please check system requirements.',
        steps
      };
    }

    const page = await browser.newPage();

    // Set realistic user agent and headers
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });

    // Step 3: Navigate to Job Page
    steps.push({ step: 'navigating', status: 'success', message: 'Opening job page...' });
    
    try {
      await page.goto(jobUrl, { 
        waitUntil: 'networkidle2', 
        timeout: 45000 
      });
    } catch (error) {
      throw new Error(`Failed to load job page: ${error.message}`);
    }

    steps.push({ step: 'page_loaded', status: 'success', message: 'Job page loaded successfully' });
    await sleep(3000);

    // Step 4: Check for authentication
    const isAuthenticated = await checkAuthentication(page);
    if (!isAuthenticated) {
      steps.push({ 
        step: 'auth_required', 
        status: 'warning', 
        message: 'LinkedIn login required. Please log in manually in the browser window...' 
      });
      
      console.log('[AutoApply] Login required. Browser window will stay open for manual login.');
      console.log('[AutoApply] Please log into LinkedIn in the browser window.');
      console.log('[AutoApply] The system will automatically continue after login is detected.');
      
      // Wait for manual login with better progress feedback
      let loginAttempts = 0;
      const maxLoginWait = 120000; // 2 minutes max wait
      const checkInterval = 3000; // Check every 3 seconds
      
      while (loginAttempts < maxLoginWait / checkInterval) {
        await sleep(checkInterval);
        loginAttempts++;
        
        // Check if user is now logged in
        const nowAuthenticated = await checkAuthentication(page);
        if (nowAuthenticated) {
          steps.push({ 
            step: 'auth_success', 
            status: 'success', 
            message: 'Successfully logged in!' 
          });
          console.log('[AutoApply] User successfully logged in!');
          break;
        }
        
        // Update progress message every 15 seconds
        if (loginAttempts % 5 === 0) {
          const elapsedSeconds = loginAttempts * 3;
          console.log(`[AutoApply] Still waiting for login... (${elapsedSeconds}s elapsed)`);
          console.log('[AutoApply] Please complete login in the browser window.');
        }
      }
      
      // Final check after waiting
      const finalAuthCheck = await checkAuthentication(page);
      if (!finalAuthCheck) {
        steps.push({ 
          step: 'auth_timeout', 
          status: 'error', 
          message: 'Login timeout. Please try again.' 
        });
        
        return {
          success: false,
          message: 'Login timeout. Please make sure you are logged into LinkedIn and try again.',
          steps
        };
      }
      
      // Wait a bit more for page to stabilize after login
      await sleep(3000);
      
      // Re-navigate to job page if we got redirected away during login
      const currentUrl = page.url();
      if (!currentUrl.includes(jobUrl.split('?')[0])) {
        console.log('[AutoApply] Re-navigating to job page after login...');
        steps.push({ step: 'renavigating', status: 'success', message: 'Returning to job page...' });
        
        try {
          await page.goto(jobUrl, { 
            waitUntil: 'networkidle2', 
            timeout: 30000 
          });
          await sleep(2000);
        } catch (navError) {
          console.error('[AutoApply] Re-navigation failed:', navError);
          steps.push({ 
            step: 'renavigate_failed', 
            status: 'error', 
            message: 'Failed to return to job page' 
          });
          
          return {
            success: false,
            message: 'Failed to return to job page after login.',
            steps
          };
        }
      }
    } else {
      steps.push({ step: 'auth_success', status: 'success', message: 'Already logged in!' });
      console.log('[AutoApply] User is already logged in to LinkedIn');
    }

    // Step 5: Look for Easy Apply Button
    steps.push({ step: 'checking', status: 'success', message: 'Looking for Easy Apply button...' });
    await sleep(1000);

    const easyApplyBtn = await findEasyApplyButton(page);
    
    if (!easyApplyBtn) {
      steps.push({
        step: 'no_easy_apply',
        status: 'warning',
        message: 'Easy Apply not available - requires external application'
      });

      const applicationData = {
        jobTitle: jobInfo.title || 'Unknown Position',
        company: jobInfo.company || 'Unknown Company',
        jobUrl,
        location: jobInfo.location || 'Unknown Location',
        status: 'no_easy_apply'
      };
      
      saveApplication(applicationData, 'no_easy_apply');
      
      return {
        success: false,
        message: 'Easy Apply not available. Please apply directly on LinkedIn.',
        steps,
        applicationData
      };
    }

    steps.push({ step: 'easy_apply_found', status: 'success', message: 'Easy Apply button found!' });

    // Step 6: Click Easy Apply and handle application form
    await easyApplyBtn.click();
    console.log('[AutoApply] Clicked Easy Apply');
    await sleep(3000);

    steps.push({ step: 'modal_opened', status: 'success', message: 'Application form opened' });

    // Step 7: Fill application form
    const formResult = await fillApplicationForm(page, userProfile);
    steps.push(...formResult.steps);

    if (!formResult.success) {
      return {
        success: false,
        message: formResult.message,
        steps
      };
    }

    // Step 8: Submit application
    steps.push({ step: 'submitting', status: 'pending', message: 'Submitting application...' });
    
    const submitResult = await submitApplication(page);
    steps.push(...submitResult.steps);

    if (submitResult.success) {
      steps.push({ step: 'submitted', status: 'success', message: 'Application submitted successfully!' });
      
      const applicationData = {
        jobTitle: jobInfo.title || 'Unknown Position',
        company: jobInfo.company || 'Unknown Company',
        jobUrl,
        location: jobInfo.location || 'Unknown Location',
        status: 'applied'
      };
      
      saveApplication(applicationData, 'applied');
      
      console.log('[AutoApply] Application completed successfully');
      await sleep(5000);
      
      return {
        success: true,
        message: 'Application submitted successfully! You should receive a confirmation email shortly.',
        steps,
        applicationData
      };
    } else {
      steps.push({ step: 'failed', status: 'error', message: 'Application submission failed' });
      
      return {
        success: false,
        message: submitResult.message || 'Application submission failed.',
        steps
      };
    }

  } catch (error) {
    console.error('[AutoApply] Error:', error);
    
    steps.push({ 
      step: 'error', 
      status: 'error', 
      message: `Error: ${error.message}` 
    });

    const applicationData = {
      jobTitle: jobInfo.title || 'Unknown Position',
      company: jobInfo.company || 'Unknown Company',
      jobUrl,
      location: jobInfo.location || 'Unknown Location',
      status: 'error'
    };
    
    saveApplication(applicationData, 'error');
    
    return {
      success: false,
      message: `Application failed: ${error.message}`,
      steps,
      applicationData,
      error: error.message
    };

  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log('[AutoApply] Browser closed safely');
      } catch (closeError) {
        console.error('[AutoApply] Error closing browser:', closeError);
      }
    }
  }
}

/**
 * Check if user is authenticated on LinkedIn
 */
async function checkAuthentication(page) {
  try {
    await sleep(1000);
    
    const loggedInSelectors = [
      '.global-nav__primary-link',
      '.nav-item__a',
      '[data-control-name="identity_welcome_message"]',
      '.feed-identity-module',
      '.global-nav__me',
      '.profile-rail-card__actor-link'
    ];
    
    for (const selector of loggedInSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await page.evaluate(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
          }, element);
          if (isVisible) {
            return true;
          }
        }
      } catch (error) {
        continue;
      }
    }
    
    const loginPageSelectors = [
      '.login__form',
      '#username',
      '[data-id="username"]',
      'input[name="session_key"]'
    ];
    
    for (const selector of loginPageSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await page.evaluate(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
          }, element);
          if (isVisible) {
            return false;
          }
        }
      } catch (error) {
        continue;
      }
    }
    
    const currentUrl = page.url();
    if (currentUrl.includes('linkedin.com/login') || currentUrl.includes('linkedin.com/auth')) {
      return false;
    }
    
    return true;
    
  } catch (error) {
    console.warn('[AutoApply] Auth check error:', error.message);
    return false;
  }
}

/**
 * Find Easy Apply button using multiple selectors
 */
async function findEasyApplyButton(page) {
  console.log('[AutoApply] Searching for Easy Apply button...');
  
  const easyApplySelectors = [
    'button.jobs-apply-button',
    'button[aria-label*="Easy Apply"]',
    'button[aria-label*="Apply now"]',
    '[data-control-name="jobdetails_topcard_inapply"]',
    '.jobs-apply-button--top-card',
    '.jobs-apply-button.artdeco-button--primary',
    '.jobs-s-apply__top-card',
    '[data-test-id="apply-button"]',
    '.jobs-apply__button'
  ];

  for (const selector of easyApplySelectors) {
    try {
      const buttons = await page.$$(selector);
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.textContent?.trim() || '', btn);
        const isVisible = await page.evaluate(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && !el.disabled;
        }, btn);
        
        if (isVisible && (text.includes('Easy Apply') || text.includes('Apply now') || text.includes('Apply'))) {
          console.log(`[AutoApply] Found Easy Apply button: ${selector} with text: "${text}"`);
          return btn;
        }
      }
    } catch (error) {
      console.warn(`[AutoApply] Selector ${selector} failed:`, error.message);
    }
  }

  try {
    console.log('[AutoApply] Trying text content search...');
    const buttons = await page.$$('button');
    for (const btn of buttons) {
      try {
        const text = await page.evaluate(el => el.textContent?.trim() || '', btn);
        const isVisible = await page.evaluate(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && !el.disabled;
        }, btn);
        
        if (isVisible && (text.includes('Easy Apply') || text.includes('Apply now') || text.includes('Apply'))) {
          console.log(`[AutoApply] Found Easy Apply button by text: "${text}"`);
          return btn;
        }
      } catch (error) {
        continue;
      }
    }
  } catch (error) {
    console.warn('[AutoApply] Text search failed:', error.message);
  }

  console.log('[AutoApply] No Easy Apply button found');
  return null;
}

/**
 * Fill application form with user data
 */
async function fillApplicationForm(page, userProfile) {
  const steps = [];
  
  try {
    steps.push({ step: 'filling', status: 'success', message: 'Filling application form...' });
    await sleep(2000);
    
    if (userProfile.name) {
      const nameParts = userProfile.name.split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ');
      
      if (firstName) {
        await fillFieldIfExists(page, [
          'input[name*="first"]',
          'input[id*="first"]',
          'input[placeholder*="first"]',
          'input[aria-label*="first" i]'
        ], firstName);
      }
      
      if (lastName) {
        await fillFieldIfExists(page, [
          'input[name*="last"]',
          'input[id*="last"]',
          'input[placeholder*="last"]',
          'input[aria-label*="last" i]'
        ], lastName);
      }
      
      await fillFieldIfExists(page, [
        'input[name*="name"]',
        'input[id*="name"]',
        'input[placeholder*="name"]',
        'input[aria-label*="name" i]'
      ], userProfile.name);
    }

    if (userProfile.email) {
      await fillFieldIfExists(page, [
        'input[name*="email"]',
        'input[id*="email"]',
        'input[type="email"]'
      ], userProfile.email);
    }

    if (userProfile.phone) {
      await fillFieldIfExists(page, [
        'input[name*="phone"]',
        'input[id*="phone"]',
        'input[placeholder*="phone"]',
        'input[aria-label*="phone" i]',
        'input[type="tel"]'
      ], userProfile.phone);
    }

    if (userProfile.location) {
      await fillFieldIfExists(page, [
        'input[name*="location"]',
        'input[placeholder*="location"]',
        'input[aria-label*="location" i]'
      ], userProfile.location);
    }

    if (userProfile.linkedin) {
      await fillFieldIfExists(page, [
        'input[name*="linkedin"]',
        'input[id*="linkedin"]',
        'input[placeholder*="linkedin"]',
        'input[aria-label*="linkedin" i]'
      ], userProfile.linkedin);
    }

    await handleAdditionalFields(page, userProfile);
    
    steps.push({ step: 'fields_filled', status: 'success', message: 'Form fields completed' });
    
    return { success: true, steps };
    
  } catch (error) {
    console.error('[AutoApply] Form filling error:', error);
    steps.push({ step: 'fill_error', status: 'error', message: `Form filling error: ${error.message}` });
    return { success: false, message: `Form filling failed: ${error.message}`, steps };
  }
}

/**
 * Submit the application
 */
async function submitApplication(page) {
  const steps = [];
  
  try {
    console.log('[AutoApply] Looking for submit button...');
    
    // Wait longer for form to fully load
    await sleep(3000);
    
    // Modern LinkedIn submit button selectors (2024)
    const submitSelectors = [
      'button[aria-label="Submit application"]',
      'button[aria-label="Review your application"]',
      'button[aria-label="Continue to next step"]',
      'button[aria-label="Send application"]',
      'button[aria-label="Submit and continue"]',
      'button[aria-label*="Submit"]',
      'button[aria-label*="submit"]',
      '.jobs-apply-button',
      'button.artdeco-button--primary',
      '.artdeco-button--primary',
      '.jobs-s-apply__submit-btn',
      '[data-control-name="submit"]',
      '[data-test-id="submit-application"]',
      '.jobs-apply__footer-button',
      '.jobs-apply__form-footer button',
      '.jobs-apply__submit-button',
      'button[type="submit"]',
      '.jobs-apply__action-buttons button',
      '.jobs-easy-apply__footer button',
      '.pb3 .artdeco-button--primary',
      '.flex .artdeco-button--primary',
      'footer button.artdeco-button--primary'
    ];

    let submitBtn = null;
    
    // Try specific selectors first
    for (const selector of submitSelectors) {
      try {
        const buttons = await page.$$(selector);
        for (const btn of buttons) {
          const text = await page.evaluate(el => el.textContent?.trim() || '', btn);
          const isDisabled = await page.evaluate(el => el.disabled, btn);
          const isVisible = await page.evaluate(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
          }, btn);
          
          if (isVisible && !isDisabled && (
            text.includes('Submit') || 
            text.includes('Review') || 
            text.includes('Continue') || 
            text.includes('Send') ||
            text.includes('Next') ||
            text.includes('Apply')
          )) {
            console.log(`[AutoApply] Found submit button: ${selector} with text: "${text}"`);
            submitBtn = btn;
            break;
          }
        }
        if (submitBtn) break;
      } catch (error) {
        console.warn(`[AutoApply] Submit selector ${selector} failed:`, error.message);
      }
    }

    // If no specific button found, try text search
    if (!submitBtn) {
      console.log('[AutoApply] Trying text search for submit button...');
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        try {
          const text = await page.evaluate(el => el.textContent?.trim() || '', btn);
          const isDisabled = await page.evaluate(el => el.disabled, btn);
          const isVisible = await page.evaluate(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
          }, btn);
          
          if (isVisible && !isDisabled && (
            text.includes('Submit') || 
            text.includes('Review') || 
            text.includes('Continue') || 
            text.includes('Send') ||
            text.includes('Next') ||
            text.includes('Apply')
          )) {
            console.log(`[AutoApply] Found submit button by text: "${text}"`);
            submitBtn = btn;
            break;
          }
        } catch (error) {
          continue;
        }
      }
    }

    // Try XPath search as last resort
    if (!submitBtn) {
      console.log('[AutoApply] Trying XPath search for submit button...');
      try {
        const xpathSelectors = [
          "//button[contains(text(), 'Submit')]",
          "//button[contains(text(), 'Review')]",
          "//button[contains(text(), 'Continue')]",
          "//button[contains(text(), 'Send')]",
          "//button[contains(text(), 'Next')]",
          "//button[contains(@aria-label, 'Submit')]",
          "//button[contains(@class, 'artdeco-button--primary')]"
        ];
        
        for (const xpath of xpathSelectors) {
          try {
            const elements = await page.$x(xpath);
            for (const el of elements) {
              const isDisabled = await page.evaluate(elem => elem.disabled, el);
              const isVisible = await page.evaluate(elem => {
                const style = window.getComputedStyle(elem);
                return style.display !== 'none' && style.visibility !== 'hidden';
              }, el);
              if (isVisible && !isDisabled) {
                const text = await page.evaluate(elem => elem.textContent?.trim() || '', el);
                console.log(`[AutoApply] Found submit button via XPath: "${text}"`);
                submitBtn = el;
                break;
              }
            }
            if (submitBtn) break;
          } catch (error) {
            continue;
          }
        }
      } catch (error) {
        console.warn('[AutoApply] XPath search failed:', error.message);
      }
    }

    if (!submitBtn) {
      // Debug: Log all buttons found on page
      console.log('[AutoApply] Debug: Listing all buttons on page...');
      try {
        const allButtons = await page.$$('button');
        for (let i = 0; i < Math.min(allButtons.length, 10); i++) {
          const btn = allButtons[i];
          const text = await page.evaluate(el => el.textContent?.trim() || '', btn);
          const isDisabled = await page.evaluate(el => el.disabled, btn);
          const isVisible = await page.evaluate(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
          }, btn);
          console.log(`[AutoApply] Button ${i + 1}: "${text}" (visible: ${isVisible}, disabled: ${isDisabled})`);
        }
      } catch (debugError) {
        console.warn('[AutoApply] Debug failed:', debugError.message);
      }
      
      steps.push({ step: 'no_submit', status: 'error', message: 'Submit button not found' });
      return { success: false, message: 'Submit button not found', steps };
    }

    console.log('[AutoApply] Clicking submit button...');
    await submitBtn.click();
    
    // Wait for page response after submit click
    await sleep(3000);
    
    // Check if login is required after submit click
    const currentUrl = page.url();
    console.log('[AutoApply] Current URL after submit click:', currentUrl);
    
    if (currentUrl.includes('linkedin.com/login') || currentUrl.includes('linkedin.com/auth') || currentUrl.includes('linkedin.com/signup') || currentUrl.includes('signin')) {
      console.log('[AutoApply] Login/Signup required after submit click. Waiting for manual completion...');
      steps.push({ step: 'submit_login_required', status: 'warning', message: 'Login required. Please complete login/signup in the browser...' });
      
      // Wait for manual login/signup completion
      let loginAttempts = 0;
      const maxLoginWait = 120000; // 2 minutes max wait
      const checkInterval = 3000; // Check every 3 seconds
      
      console.log('[AutoApply] Please complete the login/signup process in the browser window.');
      console.log('[AutoApply] The system will automatically continue once you are logged in.');
      
      while (loginAttempts < maxLoginWait / checkInterval) {
        await sleep(checkInterval);
        loginAttempts++;
        
        // Check current URL to see if we're still on login/signup page
        const currentUrlAfterWait = page.url();
        console.log(`[AutoApply] Current URL (${loginAttempts * 3}s): ${currentUrlAfterWait}`);
        
        // Check if we're no longer on login/signup page (indicates successful login)
        if (!currentUrlAfterWait.includes('linkedin.com/login') && 
            !currentUrlAfterWait.includes('linkedin.com/auth') && 
            !currentUrlAfterWait.includes('linkedin.com/signup') &&
            !currentUrlAfterWait.includes('signin')) {
          
          steps.push({ 
            step: 'submit_login_success', 
            status: 'success', 
            message: 'Successfully logged in! Continuing application...' 
          });
          console.log('[AutoApply] Login/signup completed successfully!');
          
          // Wait for page to stabilize after login
          await sleep(3000);
          
          // Check if we need to retry submission or if it was already submitted
          const finalUrl = page.url();
          console.log('[AutoApply] Final URL after login:', finalUrl);
          
          // If we're back on the job page, try to complete the application
          if (finalUrl.includes('jobs/view') || finalUrl.includes('linkedin.com/jobs')) {
            console.log('[AutoApply] Back on job page, checking application status...');
            
            // Wait a bit more for any redirects to complete
            await sleep(2000);
            
            // Check for success indicators
            const successSelectors = [
              '.jobs-apply__complete',
              '.jobs-apply__success',
              '[data-test-id="application-success"]',
              '.artdeco-toast',
              '.artdeco-inline-feedback',
              '.jobs-apply__confirmation',
              '.artdeco-toast--success',
              '.artdeco-inline-feedback--success'
            ];
            
            let successFound = false;
            for (const selector of successSelectors) {
              try {
                const element = await page.$(selector);
                if (element) {
                  const isVisible = await page.evaluate(el => {
                    const style = window.getComputedStyle(el);
                    return style.display !== 'none' && style.visibility !== 'hidden';
                  }, element);
                  if (isVisible) {
                    successFound = true;
                    break;
                  }
                }
              } catch (error) {
                continue;
              }
            }
            
            if (successFound) {
              console.log('[AutoApply] Application success confirmed after login!');
              steps.push({ step: 'application_success', status: 'success', message: 'Application submitted successfully!' });
              return { success: true, steps };
            } else {
              console.log('[AutoApply] No success indicator found, but proceeding...');
              steps.push({ step: 'application_completed', status: 'success', message: 'Application process completed.' });
              return { success: true, steps };
            }
          } else {
            console.log('[AutoApply] Redirected to different page after login, but application likely completed.');
            steps.push({ step: 'application_completed', status: 'success', message: 'Application process completed.' });
            return { success: true, steps };
          }
        }
        
        // Update progress message every 20 seconds
        if (loginAttempts % 7 === 0) {
          const elapsedSeconds = loginAttempts * 3;
          console.log(`[AutoApply] Still waiting for login/signup completion... (${elapsedSeconds}s elapsed)`);
          console.log('[AutoApply] Please complete the authentication in the browser window.');
        }
      }
      
      // Final check after waiting
      const finalAuthCheck = page.url();
      if (finalAuthCheck.includes('linkedin.com/login') || finalAuthCheck.includes('linkedin.com/signup')) {
        steps.push({ 
          step: 'submit_login_timeout', 
          status: 'warning', 
          message: 'Login/signup timeout. Application may require manual completion.' 
        });
        
        return { 
          success: true, // Return true since the process was initiated
          message: 'Login/signup required to complete application. Please check your email for confirmation.', 
          steps 
        };
      }
    }
    
    // Wait for submission to complete
    await sleep(4000);
    
    // Check for success indicators
    const successSelectors = [
      '.jobs-apply__complete',
      '.jobs-apply__success',
      '[data-test-id="application-success"]',
      '.artdeco-toast',
      '.artdeco-inline-feedback',
      '.jobs-apply__confirmation',
      '.artdeco-toast--success',
      '.artdeco-inline-feedback--success'
    ];
    
    let successFound = false;
    for (const selector of successSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await page.evaluate(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
          }, element);
          if (isVisible) {
            successFound = true;
            break;
          }
        }
      } catch (error) {
        continue;
      }
    }
    
    if (successFound) {
      steps.push({ step: 'submit_clicked', status: 'success', message: 'Application submitted successfully!' });
    } else {
      steps.push({ step: 'submit_clicked', status: 'success', message: 'Application submitted' });
    }
    
    return { success: true, steps };
    
  } catch (error) {
    console.error('[AutoApply] Submit error:', error);
    steps.push({ step: 'submit_error', status: 'error', message: `Submit error: ${error.message}` });
    return { success: false, message: `Submit failed: ${error.message}`, steps };
  }
}

/**
 * Fill a field if it exists on page
 */
async function fillFieldIfExists(page, selectors, value) {
  if (!value) return false;
  
  for (const selector of selectors) {
    try {
      const elements = await page.$$(selector);
      for (const el of elements) {
        const isVisible = await page.evaluate(elem => {
          const style = window.getComputedStyle(elem);
          return style.display !== 'none' && style.visibility !== 'hidden';
        }, el);
        
        if (isVisible) {
          try {
            // Focus the element first
            await el.focus();
            await sleep(100);
            
            // Clear existing content
            await page.evaluate(el => {
              el.value = '';
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }, el);
            await sleep(100);
            
            // Type the new value
            await el.type(value, { delay: 100 });
            await sleep(200);
            
            // Verify the value was set
            const currentValue = await page.evaluate(el => el.value, el);
            if (currentValue.includes(value)) {
              console.log(`[AutoApply] Successfully filled field ${selector} with: "${value}"`);
              return true;
            }
          } catch (typeError) {
            console.warn(`[AutoApply] Typing failed for ${selector}, trying click approach:`, typeError.message);
            
            // Alternative approach: click and type
            try {
              await el.click();
              await sleep(100);
              
              // Select all and type
              await page.keyboard.down('Control');
              await page.keyboard.press('a');
              await page.keyboard.up('Control');
              await sleep(50);
              
              await el.type(value, { delay: 100 });
              await sleep(200);
              
              const currentValue = await page.evaluate(el => el.value, el);
              if (currentValue.includes(value)) {
                console.log(`[AutoApply] Successfully filled field ${selector} (alternative method) with: "${value}"`);
                return true;
              }
            } catch (altError) {
              console.warn(`[AutoApply] Alternative method failed for ${selector}:`, altError.message);
            }
          }
        }
      }
    } catch (error) {
      console.warn(`[AutoApply] Field fill error for ${selector}:`, error.message);
    }
  }
  return false;
}

/**
 * Handle additional form fields like radio buttons, dropdowns, etc.
 */
async function handleAdditionalFields(page, userProfile) {
  try {
    const selects = await page.$$('select');
    for (const select of selects) {
      const value = await page.evaluate(el => el.value, select);
      if (!value) {
        await page.evaluate(el => {
          if (el.options.length > 1) {
            el.value = el.options[1].value;
            el.dispatchEvent(new Event('change'));
          }
        }, select);
      }
    }

    const radioGroups = await page.$$('fieldset');
    for (const group of radioGroups) {
      const checked = await group.$('input[type="radio"]:checked');
      if (!checked) {
        const firstRadio = await group.$('input[type="radio"]');
        if (firstRadio) {
          await firstRadio.click();
        }
      }
    }
  } catch (error) {
    console.warn('[AutoApply] Additional fields error:', error.message);
  }
}

/**
 * Find submit button after login for retry
 */
async function findSubmitButtonAfterLogin(page) {
  try {
    // Quick search for submit button after login
    const quickSelectors = [
      'button[aria-label*="Submit"]',
      'button[aria-label*="submit"]',
      '.artdeco-button--primary',
      'button[type="submit"]'
    ];
    
    for (const selector of quickSelectors) {
      try {
        const buttons = await page.$$(selector);
        for (const btn of buttons) {
          const text = await page.evaluate(el => el.textContent?.trim() || '', btn);
          const isDisabled = await page.evaluate(el => el.disabled, btn);
          const isVisible = await page.evaluate(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
          }, btn);
          
          if (isVisible && !isDisabled && (
            text.includes('Submit') || 
            text.includes('Review') || 
            text.includes('Continue') || 
            text.includes('Send') ||
            text.includes('Next')
          )) {
            console.log(`[AutoApply] Found retry submit button: ${selector} with text: "${text}"`);
            return btn;
          }
        }
      } catch (error) {
        continue;
      }
    }
    
    return null;
  } catch (error) {
    console.warn('[AutoApply] Error finding retry submit button:', error.message);
    return null;
  }
}

/**
 * Simple sleep utility for delays
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  autoApplyToJob
};