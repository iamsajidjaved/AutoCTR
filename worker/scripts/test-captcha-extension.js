// Smoke test: launches N Puppeteer browsers in parallel, each with the
// RektCaptcha extension, then visits a test reCAPTCHA page and confirms the
// extension's content script is alive AND the ONNX model successfully
// classifies image tiles.
//
// Reproduces the multi-instance race that previously left the solver dormant,
// AND catches the more recent failure mode where the checkbox is clicked but
// the model never selects tiles (ONNX-runtime WASM init failure inside the
// bframe). Run with: node scripts/test-captcha-extension.js [instances]
//
// Pass = every instance EITHER:
//   * populates g-recaptcha-response (full solve), OR
//   * shows >=1 selected tile inside the bframe within 30 s (model is alive
//     even if Google rejected the verification submit).
// Bframe-visible alone does NOT pass — that proved insufficient on the
// failing PCs.

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
    let lastState = null;
    const TIMEOUT_MS = 30000;
    while (Date.now() - start < TIMEOUT_MS) {
      // Top-level state — token populated, or bframe rendered.
      const top = await page.evaluate(() => {
        const bframe = Array.from(document.querySelectorAll('iframe'))
          .find(f => /recaptcha\/api2\/bframe/.test(f.src));
        const responseEl = document.getElementById('g-recaptcha-response');
        return {
          hasBframe: !!bframe,
          bframeVisible: bframe ? getComputedStyle(bframe).visibility === 'visible' : false,
          token: responseEl ? (responseEl.value || '').length : 0,
        };
      });

      // Reach into the bframe to count selected tiles — proves the model is
      // actually classifying images, not just that the iframe loaded.
      let bframeState = null;
      const bframe = page.frames().find(f => /recaptcha\/api2\/bframe/.test(f.url()));
      if (bframe) {
        try {
          bframeState = await bframe.evaluate(() => {
            const tiles = document.querySelectorAll('.rc-imageselect-target td, .rc-image-tile-wrapper');
            const selected = document.querySelectorAll('.rc-imageselect-tileselected, .rc-imageselect-dynamic-selected');
            return { tileCount: tiles.length, tilesSelected: selected.length };
          });
        } catch (_) { /* iframe may have navigated */ }
      }
      lastState = { top, bframeState };

      const tilesSelected = bframeState && bframeState.tilesSelected > 0;
      if (top.token > 0 || tilesSelected) {
        success = true;
        console.log(`[#${idx}] PASS after ${Date.now() - start}ms (${JSON.stringify(lastState)})`);
        break;
      }
      await new Promise(r => setTimeout(r, 500));
    }
    if (!success) {
      const final = await page.evaluate(() => ({
        iframes: Array.from(document.querySelectorAll('iframe')).map(f => f.src),
      }));
      console.error(`[#${idx}] FAIL — model never selected tiles (and no token). Last state: ${JSON.stringify(lastState)}. Iframes: ${JSON.stringify(final.iframes)}`);
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
