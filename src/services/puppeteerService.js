const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');
const humanBehavior = require('../utils/humanBehavior');
const deviceProfiles = require('../utils/deviceProfiles');
const { getProxy } = require('./proxyService');
const captchaService = require('./captchaService');
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
  return page.evaluate(() =>
    !!(document.querySelector('#captcha-form') || document.querySelector('iframe[src*="recaptcha"]'))
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

// Returns the <a> element that Google tracks as a CTR click for targetDomain.
// Prioritises links that wrap an <h3> (the visible title) since those carry
// Google's data-ved tracking attributes and fire the CTR event listeners.
async function findResultLink(page, targetDomain) {
  const links = await page.$$(`#search a[href*="${targetDomain}"]`);
  for (const link of links) {
    const hasH3 = await link.evaluate(el => !!el.querySelector('h3'));
    if (hasH3) return link;
  }
  // Fallback: any direct-domain link in the results block
  return links.length > 0 ? links[0] : null;
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

    // If a CAPTCHA was present and solved, Google auto-submits and navigates back
    // to the SERP. Wait for #search to finish loading before proceeding.
    if (postCheck.solved) {
      await page.waitForSelector('#search', { timeout: 20000 });
      await humanBehavior.randomDelay(1000, 2500);
    }

    if (job.type === 'impression') {
      await humanBehavior.randomScroll(page);
      await humanBehavior.randomDelay(3000, 8000);
      return { success: true, actualDwellSeconds: null, proxyHost: proxy.host };
    }

    const targetDomain = new URL(job.website).hostname;

    // Find the main organic result link: the <a> that wraps the <h3> title.
    // Google fires its CTR tracking events on this element, so clicking anything
    // else (breadcrumb, display URL) won't register as a click in Search Console.
    const resultLink = await findResultLink(page, targetDomain);
    if (!resultLink) {
      return { success: false, error: 'not_in_serp', actualDwellSeconds: null };
    }

    // Scroll result into view and hover before clicking — mimics real user behaviour
    // and ensures Google's mousedown/click handlers fire on the visible element.
    await resultLink.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await humanBehavior.randomDelay(500, 1500);
    await humanBehavior.randomMouseMove(page);

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
      resultLink.click(),
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
