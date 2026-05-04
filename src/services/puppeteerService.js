const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
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

// Bring the freshly-launched Chromium window above all other windows so the
// operator can clearly see the run in progress. Windows-only, best-effort:
// any failure is swallowed (the worst outcome is the window stays where
// Chromium placed it). Skipped entirely in headless mode or on non-Windows.
//
// We call out to PowerShell because Node has no built-in Win32 binding for
// SetForegroundWindow / ShowWindow. The script imports the two APIs via
// Add-Type, then walks the Puppeteer process tree (the Chrome browser
// process plus its renderer/GPU children) looking for a non-zero
// MainWindowHandle — that's the window the user actually sees. If none is
// found yet (slow launch) we retry once after 600 ms.
function bringBrowserToFront(browser) {
  if (config.HEADLESS) return Promise.resolve();
  if (process.platform !== 'win32') return Promise.resolve();

  const proc = browser.process();
  const rootPid = proc && proc.pid;
  if (!rootPid) return Promise.resolve();

  const script = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Fg {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
$root = ${rootPid}
$pids = @($root)
$pids += (Get-CimInstance Win32_Process -Filter "ParentProcessId=$root" | Select-Object -ExpandProperty ProcessId)
foreach ($p in $pids) {
  $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
  if ($proc -and $proc.MainWindowHandle -ne 0) {
    [void][Win32Fg]::ShowWindow($proc.MainWindowHandle, 9)  # SW_RESTORE
    [void][Win32Fg]::SetForegroundWindow($proc.MainWindowHandle)
  }
}
`;

  const runOnce = () => new Promise((resolve) => {
    try {
      const ps = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
        { stdio: 'ignore', windowsHide: true }
      );
      ps.on('error', () => resolve());
      ps.on('exit', () => resolve());
    } catch (_) {
      resolve();
    }
  });

  return runOnce().then(() => new Promise((r) => setTimeout(r, 600))).then(runOnce);
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
//
// Match priority (so Google records a real organic click for the right URL):
//   1. Exact target URL (path + protocol-insensitive, trailing-slash insensitive)
//      AND wrapping an <h3> (organic result)
//   2. Exact target URL anywhere on the page (still must be inside #search)
//   3. Same-domain link wrapping an <h3>
//   4. Any same-domain link inside #search
//
// We click the actual SERP <a>, so Google's `/url?...` interceptor fires, the
// click is logged in Search Console, and the destination loads with a Google
// referrer (i.e. organic traffic, not direct).
async function findResultCoords(page, targetUrl, targetDomain) {
  // Wait for actual organic result links to render before reading the DOM.
  // Google's `#search` wrapper appears almost immediately, but the result
  // <a ping="/url?..."> elements stream in after — reading too early returns
  // an empty list and a false 'not_in_serp'.
  await page
    .waitForFunction(
      () =>
        document.querySelectorAll(
          '#search a[ping^="/url"], #rso a[ping^="/url"], a[ping^="/url"][href]'
        ).length > 0,
      { timeout: 15000 }
    )
    .catch(() => {}); // fall through and let the evaluate report what it sees

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await page.evaluate((url, domain) => {
        // Normalize a URL for comparison: strip protocol, leading 'www.',
        // trailing slash, query, and fragment so 'https://x.com/' and
        // 'http://www.x.com' both match 'x.com'.
        const norm = (raw) => {
          if (!raw) return '';
          try {
            const u = new URL(raw, location.href);
            const host = u.hostname.replace(/^www\./i, '').toLowerCase();
            const path = u.pathname.replace(/\/+$/, '');
            return host + path;
          } catch {
            return String(raw).toLowerCase();
          }
        };
        const wantedFull = norm(url);
        const wantedHost = norm(`https://${domain}`);

        // Candidate pool: organic result anchors. Google ALWAYS attaches a
        // ping="/url?sa=t&..." attribute to organic <a> tags — that single
        // attribute is the most reliable selector across SERP layouts and
        // doesn't depend on container IDs (#search / #rso / #main can shift).
        // We union three sources so we still work if any wrapper changes:
        const seen = new Set();
        const all = [];
        for (const sel of [
          '#search a[ping^="/url"][href]',
          '#rso a[ping^="/url"][href]',
          'a[ping^="/url"][href]',
        ]) {
          for (const a of document.querySelectorAll(sel)) {
            if (!seen.has(a)) { seen.add(a); all.push(a); }
          }
        }

        const sameDomain = all.filter(a => {
          const h = norm(a.href);
          return h === wantedHost || h.startsWith(wantedHost + '/');
        });

        const exact = sameDomain.filter(a => norm(a.href) === wantedFull);
        const exactWithH3 = exact.find(a => a.querySelector('h3'));
        const sameDomainWithH3 = sameDomain.find(a => a.querySelector('h3'));

        const link =
          exactWithH3 ||
          exact[0] ||
          sameDomainWithH3 ||
          sameDomain[0] ||
          null;

        if (!link) {
          // Diagnostic snapshot — the FIRST 8 organic anchors we DID see, so
          // logs explain why a real-looking miss happened (wrong domain match,
          // ad results only, SERP layout shift, etc.).
          const sample = all.slice(0, 8).map(a => norm(a.href));
          return {
            found: false,
            wantedFull,
            wantedHost,
            totalCandidates: all.length,
            sample,
          };
        }

        link.scrollIntoView({ behavior: 'instant', block: 'center' });
        const r = link.getBoundingClientRect();
        const matchedExact = exact.includes(link);
        return {
          found: true,
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2),
          href: link.href,
          matchedExact,
        };
      }, targetUrl, targetDomain);

      if (result && result.found === false) {
        const pageInfo = await safeEvaluate(
          page,
          () => ({
            url: location.href,
            title: document.title,
            hasCaptcha: !!(document.querySelector('#captcha-form') ||
                           document.querySelector('iframe[src*="recaptcha"]') ||
                           document.body && /unusual traffic|sorry/i.test(document.body.innerText.slice(0, 300))),
            hasSearchBox: !!document.querySelector('textarea[name="q"]'),
            anchorsTotal: document.querySelectorAll('a').length,
            pingAnchors: document.querySelectorAll('a[ping]').length,
          }),
          { url: 'unknown', title: '', hasCaptcha: false, hasSearchBox: false, anchorsTotal: 0, pingAnchors: 0 }
        );
        console.warn(
          `[puppeteer] findResultCoords miss — wanted ${result.wantedHost} ` +
          `(exact ${result.wantedFull}); saw ${result.totalCandidates} organic ` +
          `links: ${JSON.stringify(result.sample)} | page: ${pageInfo.url} ` +
          `title="${pageInfo.title}" captcha=${pageInfo.hasCaptcha} ` +
          `searchBox=${pageInfo.hasSearchBox} anchors=${pageInfo.anchorsTotal} ` +
          `pingAnchors=${pageInfo.pingAnchors}`
        );
        return null;
      }
      return result;
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

  // Anti-fingerprinting Chromium flags. Together with puppeteer-extra-stealth
  // these defeat the most common Google bot heuristics:
  //   * AutomationControlled    — kills the navigator.webdriver = true leak
  //   * Translate / IsolateOrigins — Chrome's automation-only feature flags
  //   * UserAgentClientHint     — lets us override Sec-CH-UA cleanly
  //   * --window-size           — actual OS-level window matches viewport
  //                               (Google checks window.outerWidth too)
  //   * --lang                  — controls the embedded ICU + initial Accept-Lang
  const primaryLang = (profile.languages && profile.languages[0]) || 'en-US';
  const launchArgs = [
    `--proxy-server=${proxy.host}:${proxy.port}`,
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process,Translate,AutomationControlled',
    '--disable-infobars',
    '--no-default-browser-check',
    '--no-first-run',
    '--password-store=basic',
    '--use-mock-keychain',
    `--lang=${primaryLang}`,
    `--window-size=${profile.viewport.width},${profile.viewport.height}`,
  ];
  if (!config.HEADLESS) {
    // Pin the visible window to a predictable spot so the foreground call
    // below surfaces it where the operator expects.
    launchArgs.push('--window-position=0,0');
  }
  if (extensionExists) {
    launchArgs.push(
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    );
  }

  const browser = await puppeteer.launch({
    headless: config.HEADLESS ? 'new' : false,
    args: launchArgs,
    ignoreDefaultArgs: ['--enable-automation'],
    defaultViewport: null, // use the OS window-size we just set
  });

  // Pop the Chromium window above all other windows so the operator can watch
  // the run live. No-op when headless or on non-Windows; never throws.
  await bringBrowserToFront(browser);

  const page = await browser.newPage();

  if (proxy.username) {
    await page.authenticate({ username: proxy.username, password: proxy.password });
  }

  // ---- Identity emulation (must run BEFORE first navigation) ----------
  // 1. Set the User-Agent + matching Sec-CH-UA / userAgentData via CDP.
  //    Puppeteer's setUserAgent accepts a userAgentMetadata object that
  //    populates navigator.userAgentData and the Sec-CH-UA-* request headers
  //    consistently — without it, a Chrome-134 UA but Sec-CH-UA: "Chrome";v="124"
  //    is an instant tell.
  if (profile.uaMetadata) {
    await page.setUserAgent(profile.userAgent, profile.uaMetadata);
  } else {
    await page.setUserAgent(profile.userAgent);
  }

  // 2. Viewport + touch + DPR. emulate() also flips ontouchstart and the
  //    pointer/hover media queries — important for mobile profiles.
  await page.emulate({
    userAgent: profile.userAgent,
    viewport: {
      width: profile.viewport.width,
      height: profile.viewport.height,
      deviceScaleFactor: profile.deviceScaleFactor,
      isMobile: profile.viewport.isMobile,
      hasTouch: profile.viewport.hasTouch,
      isLandscape: profile.viewport.width > profile.viewport.height,
    },
  });
  // emulate() above replaces the user-agent without metadata, so re-apply it
  // to keep navigator.userAgentData populated.
  if (profile.uaMetadata) {
    await page.setUserAgent(profile.userAgent, profile.uaMetadata);
  }

  // 3. Accept-Language header. The stealth plugin can't see the proxy locale,
  //    so pin it explicitly to match navigator.languages.
  await page.setExtraHTTPHeaders({
    'Accept-Language': profile.acceptLanguage,
  });

  // 4. Timezone so Date.toString() / Intl reports the right offset
  //    (mismatched tz vs IP geolocation is a strong bot signal).
  if (profile.timezone) {
    try { await page.emulateTimezone(profile.timezone); } catch (_) { /* best-effort */ }
  }

  // 5. Patch remaining navigator surfaces that stealth-plugin doesn't touch
  //    (or touches with wrong values for our specific profile).
  await page.evaluateOnNewDocument((p) => {
    try {
      Object.defineProperty(navigator, 'languages', { get: () => p.languages });
      Object.defineProperty(navigator, 'platform', { get: () => p.platform });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => p.hardwareConcurrency });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => p.deviceMemory });
      // navigator.maxTouchPoints must reflect mobile/desktop — Google checks
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => p.maxTouchPoints });
      // Plugins/mimeTypes: real Chrome reports a non-zero PluginArray length.
      // Stealth plugin handles this for desktop Chrome but the iOS/Safari
      // profiles need an empty list.
      if (p.platform === 'iPhone' || p.platform.startsWith('Linux armv')) {
        Object.defineProperty(navigator, 'plugins', { get: () => [] });
      }
      // Permissions.query notification quirk (real Chrome returns 'default'
      // for Notification permission; headless returns 'denied').
      const orig = navigator.permissions && navigator.permissions.query;
      if (orig) {
        navigator.permissions.query = (params) =>
          params && params.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission, onchange: null })
            : orig(params);
      }
    } catch (_) { /* best-effort — never break the page */ }
  }, {
    languages: profile.languages,
    platform: profile.platform,
    hardwareConcurrency: profile.hardwareConcurrency,
    deviceMemory: profile.deviceMemory,
    maxTouchPoints: profile.viewport.hasTouch ? 5 : 0,
  });
  // ---------------------------------------------------------------------

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
    // Wait for the SERP to render. Google's layout varies (#search vs #rso vs
    // #rcnt vs #main) and slow proxies can push the first paint past 15 s, so
    // we race nav + a generous selector union with a 30 s budget. If that
    // fails, do ONE recovery attempt: if we're already on /search the page is
    // probably mid-stream — wait a bit more — otherwise re-submit the query.
    const SERP_SELECTORS =
      '#search, #rso, #rcnt, #main, [role="main"] [data-async-context], ' +
      'form[action="/search"] ~ div #rso, ' +
      '#captcha-form, iframe[src*="recaptcha"]';
    const waitForSerp = async (timeoutMs) => {
      try {
        await Promise.race([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: timeoutMs }),
          page.waitForSelector(SERP_SELECTORS, { timeout: timeoutMs }),
        ]);
        // Either navigation finished or a selector matched — confirm at least
        // one of the SERP/captcha markers is actually in the DOM.
        await page.waitForSelector(SERP_SELECTORS, { timeout: 5000 });
      } catch (err) {
        return err;
      }
      return null;
    };
    let serpErr = await waitForSerp(30000);
    if (serpErr) {
      const url = page.url();
      const onSearchPath = /[/?&]q=/.test(url) || /\/search/.test(url);
      if (onSearchPath) {
        // Page navigated but content is still streaming — give it more time.
        serpErr = await waitForSerp(15000);
      } else {
        // Enter never triggered a navigation — try clicking the search button
        // or re-submitting via the form.
        const resubmitted = await page
          .evaluate(() => {
            const form = document.querySelector('form[action="/search"], form[role="search"]');
            if (form) { form.submit(); return true; }
            return false;
          })
          .catch(() => false);
        if (!resubmitted) {
          const box = await page.$('textarea[name="q"]');
          if (box) {
            await box.click({ clickCount: 3 }).catch(() => {});
            await humanBehavior.typeSlowly(page, 'textarea[name="q"]', job.keyword);
            await page.keyboard.press('Enter');
          }
        }
        serpErr = await waitForSerp(20000);
      }
    }
    if (serpErr) {
      console.warn(
        `[puppeteer] job ${job.id} SERP wait failed at ${page.url()}: ${serpErr.message}`
      );
      return { success: false, error: 'serp_wait_timeout', actualDwellSeconds: null };
    }
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
    const coords = await findResultCoords(page, job.website, targetDomain);
    if (!coords) {
      return { success: false, error: 'not_in_serp', actualDwellSeconds: null };
    }
    console.log(
      `[puppeteer] job ${job.id} clicking SERP result ${coords.matchedExact ? '[exact match]' : '[same-domain fallback]'}: ${coords.href}`
    );

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
