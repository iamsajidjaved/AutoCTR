const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');
const humanBehavior = require('../utils/humanBehavior');
const deviceProfiles = require('../utils/deviceProfiles');
const { getProxy } = require('./proxyService');
const captchaService = require('./captchaService');
const { safeEvaluate } = require('./captchaService');
const config = require('../config');

puppeteer.use(StealthPlugin());

const extensionPath = path.resolve(config.REKTCAPTCHA_PATH || './extensions/rektcaptcha');
const extensionExists = fs.existsSync(extensionPath);
if (!extensionExists) {
  console.warn(`[captcha] RektCaptcha extension not found at ${extensionPath}. CAPTCHAs will not be solved.`);
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makeTimeout(ms) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error('job_timeout')), ms)
  );
}

async function isCaptchaPresent(page) {
  return safeEvaluate(
    page,
    () => !!(document.querySelector('#captcha-form') || document.querySelector('iframe[src*="recaptcha"]')),
    false
  );
}

async function onSiteBehavior(page, job) {
  const targetDomain = new URL(job.website).hostname;
  const dwellMs = randomBetween(job.min_dwell_seconds * 1000, job.max_dwell_seconds * 1000);
  const deadline = Date.now() + dwellMs;
  const startedAt = Date.now();

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    if (remaining < 2000) break;

    const roll = Math.random();

    if (roll < 0.50) {
      await humanBehavior.randomScroll(page);
      await humanBehavior.randomDelay(1500, 4000);

    } else if (roll < 0.75 && remaining > 10000) {
      const navigated = await humanBehavior.clickInternalLink(page, targetDomain);
      if (navigated) {
        await humanBehavior.waitForNetworkIdle(page);
        await humanBehavior.randomDelay(2000, 5000);
        const currentDomain = new URL(page.url()).hostname;
        if (currentDomain !== targetDomain) {
          await page.goBack({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {});
        }
      } else {
        await humanBehavior.randomScroll(page);
        await humanBehavior.randomDelay(1000, 3000);
      }

    } else if (roll < 0.90) {
      await humanBehavior.selectRandomText(page);
      await humanBehavior.randomDelay(1000, 2500);

    } else {
      await humanBehavior.randomDelay(3000, 8000);
    }
  }

  const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
  return { elapsedSeconds };
}

// Scrolls the main organic result link into view and returns its viewport
// coordinates as plain data (no ElementHandle stored). Using coordinates
// avoids "Execution context was destroyed" errors caused by page re-renders
// between handle acquisition and use.
// Prioritises <a> elements wrapping <h3> — those carry Google's data-ved
// click-tracking attributes and are what users actually click on the SERP.
async function findResultCoords(page, targetDomain) {
  // Retries up to 3 times to absorb "Execution context was destroyed" errors
  // caused by post-CAPTCHA redirect chains or in-place SERP re-renders.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const coords = await page.evaluate((domain) => {
        const links = [...document.querySelectorAll(`#search a[href*="${domain}"]`)];
        const link = links.find(a => !!a.querySelector('h3')) || links[0];
        if (!link) return null;
        // Instant scroll so getBoundingClientRect is accurate immediately
        link.scrollIntoView({ behavior: 'instant', block: 'center' });
        const r = link.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      }, targetDomain);
      return coords;
    } catch (err) {
      const msg = err && err.message ? err.message : '';
      const transient =
        msg.includes('Execution context was destroyed') ||
        msg.includes('Cannot find context') ||
        msg.includes('Session closed');
      if (!transient || attempt === 2) throw err;
      await page.waitForSelector('#search', { timeout: 15000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 800));
    }
  }
  return null;
}

async function runJob(job) {
  const profile = deviceProfiles.getProfile(job.device);

  let proxy;
  try {
    proxy = await getProxy();
  } catch (err) {
    return { success: false, error: 'proxy_unavailable', actualDwellSeconds: null };
  }

  const launchArgs = [
    `--proxy-server=${proxy.host}:${proxy.port}`,
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
  ];
  if (extensionExists) {
    launchArgs.push(
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    );
  }

  const browser = await puppeteer.launch({
    headless: false,
    args: launchArgs,
  });

  const page = await browser.newPage();

  if (proxy.username) {
    await page.authenticate({ username: proxy.username, password: proxy.password });
  }

  await page.setUserAgent(profile.userAgent);
  await page.setViewport(profile.viewport);

  try {
    await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

    const preCheck = await captchaService.handleCaptcha(page);
    if (preCheck.reason === 'timeout') {
      return { success: false, error: 'captcha_timeout', actualDwellSeconds: null };
    }

    await page.waitForSelector('textarea[name="q"]', { timeout: 15000 });
    await humanBehavior.randomDelay(1000, 3000);
    await humanBehavior.typeSlowly(page, 'textarea[name="q"]', job.keyword);
    await page.keyboard.press('Enter');
    await page.waitForSelector('#search, #captcha-form, iframe[src*="recaptcha"]', { timeout: 15000 });
    await humanBehavior.randomDelay(1500, 4000);

    const postCheck = await captchaService.handleCaptcha(page);
    if (postCheck.reason === 'timeout') {
      return { success: false, error: 'captcha_timeout', actualDwellSeconds: null };
    }

    // If a CAPTCHA was present and solved, captchaService already waited for
    // the post-solve navigation to settle. Re-confirm the SERP is rendered
    // (the redirect target may be the search page or the original referrer)
    // and tolerate a second CAPTCHA being shown immediately after.
    if (postCheck.solved) {
      const stillCaptcha = await isCaptchaPresent(page);
      if (stillCaptcha) {
        const second = await captchaService.handleCaptcha(page);
        if (second.reason === 'timeout') {
          return { success: false, error: 'captcha_timeout', actualDwellSeconds: null };
        }
      }
      await page.waitForSelector('#search, textarea[name="q"]', { timeout: 20000 }).catch(() => {});
      await humanBehavior.randomDelay(1000, 2500);

      // If we landed on the homepage rather than the SERP, re-submit the search.
      const hasResults = await safeEvaluate(page, () => !!document.querySelector('#search'), false);
      if (!hasResults) {
        const queryBox = await page.$('textarea[name="q"]');
        if (queryBox) {
          await queryBox.click({ clickCount: 3 }).catch(() => {});
          await humanBehavior.typeSlowly(page, 'textarea[name="q"]', job.keyword);
          await page.keyboard.press('Enter');
          await page.waitForSelector('#search', { timeout: 20000 }).catch(() => {});
          await humanBehavior.randomDelay(1000, 2500);
        }
      }
    }

    if (job.type === 'impression') {
      // Impression: search keyword + interact with the SERP only.
      // Never click the target — the goal is to register a search-results
      // view (an "impression") without a click event for the target site.
      const targetDomain = new URL(job.website).hostname;
      const dwellMs = randomBetween(8000, 25000);
      const result = await humanBehavior.browseSerp(page, targetDomain, dwellMs);
      return { success: true, actualDwellSeconds: result.elapsedSeconds, proxyHost: proxy.host };
    }

    const targetDomain = new URL(job.website).hostname;

    // Scroll the result into view and capture its viewport coordinates in one
    // atomic evaluate call. Returning plain data (not an ElementHandle) prevents
    // "Execution context was destroyed" errors if the page re-renders between
    // acquiring the handle and using it.
    const coords = await findResultCoords(page, targetDomain);
    if (!coords) {
      return { success: false, error: 'not_in_serp', actualDwellSeconds: null };
    }

    // Hover near the element before clicking so Google's mousedown/click
    // tracking handlers fire on a visible, in-viewport element.
    await humanBehavior.randomDelay(500, 1200);
    await page.mouse.move(
      coords.x + randomBetween(-4, 4),
      coords.y + randomBetween(-4, 4)
    );
    await humanBehavior.randomDelay(100, 300);

    // page.mouse.click fires real mousemove/mousedown/mouseup/click events at
    // the exact viewport coordinates — more reliable for Google CTR tracking
    // than element.click() which dispatches synthetic events.
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
      page.mouse.click(coords.x, coords.y),
    ]);

    const captchaOnTarget = await isCaptchaPresent(page);
    if (captchaOnTarget) {
      console.warn(`[puppeteer] CAPTCHA detected on target for job ${job.id}`);
      return { success: false, error: 'captcha', actualDwellSeconds: null };
    }

    const dwellResult = await onSiteBehavior(page, job);
    return { success: true, actualDwellSeconds: dwellResult.elapsedSeconds, proxyHost: proxy.host };

  } finally {
    await browser.close().catch(() => {});
  }
}

async function executeJob(job) {
  const timeoutMs = (job.max_dwell_seconds * 1.5 + 60) * 1000;
  try {
    return await Promise.race([
      runJob(job),
      makeTimeout(timeoutMs),
    ]);
  } catch (err) {
    return { success: false, error: err.message, actualDwellSeconds: null };
  }
}

module.exports = { executeJob };
