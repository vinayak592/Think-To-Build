const { chromium } = require('playwright');

(async () => {
  console.log('==================================================');
  console.log('   STARTING THINK TO BUILD BROWSER PANELS TEST    ');
  console.log('==================================================');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[Console Error] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push(`[Page Crash/Error] ${err.message}`);
  });

  const baseUrl = 'http://localhost:4000';

  async function checkErrors(step) {
    if (consoleErrors.length > 0) {
      console.warn(`\x1b[33m[WARN] Console logs/errors during "${step}":\x1b[0m`);
      consoleErrors.forEach(err => console.warn(`  - ${err}`));
      consoleErrors = [];
    } else {
      console.log(`\x1b[32m[PASS]\x1b[0m "${step}" loaded with no console errors.`);
    }
  }

  try {
    // 1. Landing Page
    console.log('\n[1/9] Testing Landing Page...');
    await page.goto(`${baseUrl}/`);
    const title = await page.title();
    console.log(`Landing Page Title: "${title}"`);
    await checkErrors('Landing Page');

    // 2. Portals Page
    console.log('\n[2/9] Testing Portals Page...');
    await page.goto(`${baseUrl}/portals`);
    await page.waitForLoadState('networkidle');
    await checkErrors('Portals Page');

    // 3. Teams Page
    console.log('\n[3/9] Testing Teams Page...');
    await page.goto(`${baseUrl}/teams.html`);
    await page.waitForLoadState('networkidle');
    await checkErrors('Teams Page');

    // 4. Bulk Register Page
    console.log('\n[4/9] Testing Bulk Register Page...');
    await page.goto(`${baseUrl}/bulk_register.html`);
    await page.waitForLoadState('networkidle');
    await page.click('#startBtn');
    console.log('Triggered Bulk Registration button. Waiting 3 seconds for registration network requests...');
    await page.waitForTimeout(3000);
    const logText = await page.locator('#log').innerText();
    const logLines = logText.trim().split('\n');
    console.log(`Bulk Registration Log Summary: ${logLines.length} entries logged.`);
    console.log('Last logs:', logLines.slice(-2).join(' | '));
    await checkErrors('Bulk Register');

    // 5. Team Registration Page
    console.log('\n[5/9] Testing Team Registration Page...');
    await page.goto(`${baseUrl}/register`);
    await page.waitForLoadState('networkidle');
    const isClosed = await page.locator('#registration-closed').isVisible();
    let teamId = null;

    if (isClosed) {
      console.log('Registration is closed (slots filled). Trying to fetch a registered team ID from the teams list...');
      const response = await page.request.get(`${baseUrl}/api/teams`);
      const teams = await response.json();
      if (teams && teams.length > 0) {
        teamId = teams[0].team_id;
        console.log(`Retrieved existing team ID for login test: ${teamId}`);
      } else {
        console.warn('[WARN] No teams found registered in the system.');
      }
    } else {
      const randomId = Math.floor(Math.random() * 1000000);
      const randomPhone = '9' + String(Math.floor(100000000 + Math.random() * 900000000));
      await page.fill('#participant-name', `Test User ${randomId}`);
      await page.fill('#team-name', `Test Team ${randomId}`);
      await page.fill('#phone-number', randomPhone);
      await page.fill('#team-email', `test-${randomId}@example.com`);
      await page.click('button[type="submit"]');

      // Wait a little bit for API response
      await page.waitForTimeout(1000);
      const isErrorMsgVisible = await page.locator('#error-msg').isVisible();
      if (isErrorMsgVisible) {
        const errorText = await page.locator('#error-msg').innerText();
        throw new Error(`Registration failed with error: "${errorText}"`);
      }

      // Wait for success modal
      await page.waitForSelector('#success-modal', { state: 'visible', timeout: 5000 });
      teamId = await page.locator('#generated-team-id').innerText();
      console.log(`\x1b[32m[SUCCESS]\x1b[0m Registered new team. Generated Team ID: ${teamId}`);
    }
    await checkErrors('Team Registration');

    // 6. Participant Dashboard
    if (teamId) {
      console.log(`\n[6/9] Testing Participant Dashboard with ID: ${teamId}...`);
      await page.goto(`${baseUrl}/dashboard`);
      await page.waitForLoadState('networkidle');
      await page.fill('#team-id-input', teamId);
      await page.click('.login-card button');
      await page.waitForSelector('#dashboard-container', { state: 'visible', timeout: 5000 });
      console.log('\x1b[32m[PASS]\x1b[0m Participant dashboard logged in successfully.');
      
      // Check if anti-cheat warning is present
      const dqVisible = await page.locator('#dq-banner').isVisible();
      console.log(`Anti-cheat banner visible: ${dqVisible}`);
      await checkErrors('Participant Dashboard');
    } else {
      console.log('\n[6/9] Skipping Participant Dashboard test due to no available Team ID.');
    }

    // 7. Admin Panel & Control Center
    console.log('\n[7/9] Testing Admin Login & Dashboard...');
    await page.goto(`${baseUrl}/admin`);
    await page.waitForLoadState('networkidle');
    await page.fill('#admin-email', 'admin456@gmail.com');
    await page.fill('#admin-password', 'admin456');
    await page.click('button[type="submit"]');
    await page.waitForSelector('#admin-dashboard', { state: 'visible', timeout: 5000 });
    console.log('\x1b[32m[PASS]\x1b[0m Admin logged in successfully.');

    // Verify Status and Actions headers are present in the table
    const statusHeader = await page.locator('.leaderboard-table th:has-text("Status")').isVisible();
    const actionsHeader = await page.locator('.leaderboard-table th:has-text("Actions")').isVisible();
    console.log(`Admin Table Header "Status" present: ${statusHeader}`);
    console.log(`Admin Table Header "Actions" present: ${actionsHeader}`);

    if (statusHeader && actionsHeader) {
      console.log('\x1b[32m[PASS]\x1b[0m Status and Actions columns successfully added to admin panel.');
    } else {
      throw new Error('Status or Actions column headers are missing in admin.html');
    }
    await checkErrors('Admin Control Center');

    // 8. Judge Login Page
    console.log('\n[8/9] Testing Judge Login...');
    await page.goto(`${baseUrl}/judge`);
    await page.waitForLoadState('networkidle');
    await page.fill('#email', 'judge1@example.com');
    await page.fill('#password', 'judge1pass');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/judge-dashboard', { timeout: 5000 });
    console.log('\x1b[32m[PASS]\x1b[0m Judge authenticated and redirected successfully.');
    await checkErrors('Judge Login');

    // 9. Judge Dashboard Page
    console.log('\n[9/9] Testing Judge Dashboard...');
    const heading = await page.locator('.judge-title h1').innerText();
    console.log(`Judge Dashboard Header: "${heading}"`);
    await checkErrors('Judge Dashboard');

    console.log('\n==================================================');
    console.log('   ALL BROWSER PANELS TESTED SUCCESSFULLY!        ');
    console.log('==================================================');
  } catch (err) {
    console.error('\n\x1b[31m[FAIL] Web Browser panel testing failed with error:\x1b[0m', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
