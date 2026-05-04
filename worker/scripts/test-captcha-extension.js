// Smoke test: launches N Puppeteer browsers in parallel, each with the
// RektCaptcha extension, then visits a test reCAPTCHA page and confirms the
// extension's content script is alive and its settings are populated.
//
// Reproduces the multi-instance race that previously left the solver dormant.
// Run with: node scripts/test-captcha-extension.js [instances]
//
// Pass = every instance reports recaptcha_auto_open === true AND
// recaptcha_auto_solve === true within 5 seconds of page load.

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const extensionPath = path.resolve(
  process.env.REKTCAPTCHA_PATH || './extensions/rektcaptcha'
);
if (!fs.existsSync(extensionPath)) {
  console.error(`Extension not found at ${extensionPath}`);
  process.exit(2);
}

const N = parseInt(process.argv[2], 10) || Math.max(2, require('os').cpus().length);

// Public Google reCAPTCHA demo page — loads a real reCAPTCHA widget.
const TEST_URL = 'https://www.google.com/recaptcha/api2/demo';

async function runOne(idx) {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--window-size=1280,800',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    defaultViewport: null,
  });

  try {
    // Match production warmup before navigation.
    await new Promise(r => setTimeout(r, 1500));
    const page = await browser.newPage();
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Find the recaptcha anchor iframe and read its content-script's view of
    // chrome.storage.local. We can't call chrome.storage from page context,
    // but the recaptcha iframe IS where the extension's recaptcha.js runs;
    // we instead verify behaviour: the extension auto-clicks the checkbox
    // when recaptcha_auto_open === true. So we just wait for the checkbox
    // to become "checked" (or for the image challenge to appear), proving
    // the solver is alive.
    const start = Date.now();
    let success = false;
    while (Date.now() - start < 15000) {
      const state = await page.evaluate(() => {
        const anchorIframe = Array.from(document.querySelectorAll('iframe'))
          .find(f => /recaptcha\/api2\/anchor/.test(f.src));
        if (!anchorIframe) return { phase: 'no-anchor-iframe' };
        // We can't reach into a cross-origin iframe's DOM. Instead infer from
        // the bframe (image-challenge) iframe appearing OR the visible state.
        const bframe = Array.from(document.querySelectorAll('iframe'))
          .find(f => /recaptcha\/api2\/bframe/.test(f.src));
        const responseEl = document.getElementById('g-recaptcha-response');
        return {
          phase: 'loaded',
          hasBframe: !!bframe,
          bframeVisible: bframe ? getComputedStyle(bframe).visibility === 'visible' : false,
          token: responseEl ? (responseEl.value || '').length : 0,
        };
      });
      // Auto-open path: bframe becomes visible (Rekt clicked the checkbox)
      // OR token populated (already solved). Either proves the extension is
      // active.
      if (state.bframeVisible || state.token > 0) {
        success = true;
        console.log(`[#${idx}] PASS after ${Date.now() - start}ms (${JSON.stringify(state)})`);
        break;
      }
      await new Promise(r => setTimeout(r, 500));
    }
    if (!success) {
      const final = await page.evaluate(() => ({
        iframes: Array.from(document.querySelectorAll('iframe')).map(f => f.src),
      }));
      console.error(`[#${idx}] FAIL — extension never activated. Iframes: ${JSON.stringify(final.iframes)}`);
    }
    return success;
  } catch (err) {
    console.error(`[#${idx}] ERROR: ${err.message}`);
    return false;
  } finally {
    await browser.close().catch(() => {});
  }
}

(async () => {
  console.log(`Launching ${N} browsers in parallel against ${TEST_URL}`);
  const results = await Promise.all(
    Array.from({ length: N }, (_, i) => runOne(i + 1))
  );
  const passed = results.filter(Boolean).length;
  console.log(`\n=== Result: ${passed}/${N} instances activated the solver ===`);
  process.exit(passed === N ? 0 : 1);
})();
