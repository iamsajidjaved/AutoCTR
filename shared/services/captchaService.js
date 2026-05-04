const CAPTCHA_SOLVE_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 1500;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Wraps page.evaluate so that "Execution context was destroyed" errors
// (caused by a navigation racing the evaluate) don't abort the caller.
// Returns `fallback` on transient failures so polling loops can keep going.
async function safeEvaluate(page, fn, fallback = null) {
  try {
    return await page.evaluate(fn);
  } catch (err) {
    const msg = err && err.message ? err.message : '';
    if (
      msg.includes('Execution context was destroyed') ||
      msg.includes('Target closed') ||
      msg.includes('Cannot find context') ||
      msg.includes('Session closed')
    ) {
      return fallback;
    }
    throw err;
  }
}

async function isCaptchaPresent(page) {
  return await safeEvaluate(
    page,
    () => !!document.querySelector(
      'iframe[src*="recaptcha"], #captcha-form, .g-recaptcha, iframe[title*="reCAPTCHA"]'
    ),
    false
  );
}

// Manually click the reCAPTCHA "I'm not a robot" checkbox in the anchor
// iframe. Used as a fallback when RektCaptcha's recaptcha-visibility.js
// auto-open fails to fire (the in-extension trigger depends on chrome.runtime
// messaging through an MV3 service worker that intermittently goes idle and
// loses tab-scoped state). Clicking via puppeteer's frame API bypasses that
// path entirely and just opens the bframe so the extension can solve it.
async function forceClickAnchorCheckbox(page) {
  try {
    const anchorFrame = page
      .frames()
      .find(f => /\/recaptcha\/(api2|enterprise)\/anchor/.test(f.url()));
    if (!anchorFrame) return false;

    // If already checked or in the process of being verified, skip.
    const alreadyChecked = await anchorFrame.evaluate(() => {
      const cb = document.querySelector('#recaptcha-anchor');
      return !!cb && cb.getAttribute('aria-checked') === 'true';
    }).catch(() => false);
    if (alreadyChecked) return false;

    const handle = await anchorFrame.$('#recaptcha-anchor');
    if (!handle) return false;
    await handle.click({ delay: 60 + Math.floor(Math.random() * 80) }).catch(() => {});
    await handle.dispose().catch(() => {});
    return true;
  } catch (_) {
    return false;
  }
}

async function waitForCaptchaSolved(page) {
  const deadline = Date.now() + CAPTCHA_SOLVE_TIMEOUT_MS;
  const startedAt = Date.now();
  let pollCount = 0;
  let manualClickAttempts = 0;
  const MAX_MANUAL_CLICKS = 3;

  while (Date.now() < deadline) {
    // After RektCaptcha clicks "Verify", Google auto-submits the sorry-form,
    // which triggers a top-level navigation. The g-recaptcha-response check
    // can race that navigation, so we tolerate destroyed contexts (treated
    // as "still solving, retry on next poll").
    const solved = await safeEvaluate(page, () => {
      const el = document.getElementById('g-recaptcha-response');
      return !!(el && el.value && el.value.length > 0);
    }, false);

    if (solved) return true;

    const stillPresent = await isCaptchaPresent(page);
    if (!stillPresent) return true;

    // Fallback: if RektCaptcha hasn't opened the image-puzzle iframe within
    // ~5 s of the captcha appearing, click the "I'm not a robot" checkbox
    // ourselves. The extension's auto-open occasionally fails to fire (its
    // recaptcha-visibility.js depends on chrome.runtime messaging through an
    // MV3 service worker whose tab-scoped state can race against initial
    // page load on heavily-loaded multi-instance hosts). Once we open the
    // bframe, the extension's auto_solve still does the actual image solving.
    const elapsedSinceStart = Date.now() - startedAt;
    if (
      elapsedSinceStart > 5000 &&
      manualClickAttempts < MAX_MANUAL_CLICKS &&
      // Only click again every ~10 s of stalling, never spam.
      manualClickAttempts <= Math.floor(elapsedSinceStart / 10000)
    ) {
      const bframeOpen = await safeEvaluate(page, () => {
        const f = Array.from(document.querySelectorAll('iframe'))
          .find(i => /bframe/.test(i.src));
        return !!f && getComputedStyle(f).visibility === 'visible';
      }, false);
      if (!bframeOpen) {
        const clicked = await forceClickAnchorCheckbox(page);
        if (clicked) {
          manualClickAttempts++;
          console.log(
            `[captcha] pid=${process.pid} manually clicked anchor checkbox (attempt ${manualClickAttempts}) — extension auto-open did not fire`
          );
        }
      }
    }

    // Every ~10 s emit a diagnostic showing where in the solve flow we are.
    // bframeVisible=true means the extension opened the image challenge.
    // bframeVisible=false with anchorPresent=true means extension hasn't
    // clicked the checkbox yet (injection or auto-open failure).
    if (pollCount % 7 === 0) {
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      const diag = await safeEvaluate(page, () => {
        const iframes = Array.from(document.querySelectorAll('iframe'));
        const bframe = iframes.find(f => /bframe/.test(f.src));
        const anchor = iframes.find(f => /anchor/.test(f.src));
        const token = document.getElementById('g-recaptcha-response');
        return {
          tokenLen: token ? (token.value || '').length : 0,
          bframeVisible: bframe
            ? getComputedStyle(bframe).visibility === 'visible'
            : false,
          anchorPresent: !!anchor,
          recaptchaIframes: iframes.filter(f => /recaptcha/.test(f.src)).length,
        };
      }, null);
      if (diag) {
        console.log(
          `[captcha] pid=${process.pid} poll T+${elapsed}s` +
          ` — token=${diag.tokenLen}` +
          `, bframeVisible=${diag.bframeVisible}` +
          `, anchorPresent=${diag.anchorPresent}` +
          `, recaptchaIframes=${diag.recaptchaIframes}`
        );
      }
    }
    pollCount++;

    await sleep(POLL_INTERVAL_MS);
  }

  return false;
}

// Wait for the post-CAPTCHA navigation (Google submits the sorry form
// automatically after the token is set) to settle. Multiple settle signals
// are accepted because the redirect chain varies (sorry/index → search,
// or sometimes a quiet in-place reload).
async function waitForPostCaptchaSettle(page, timeoutMs = 20_000) {
  await Promise.race([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => null),
    page.waitForNetworkIdle({ idleTime: 800, timeout: timeoutMs }).catch(() => null),
    sleep(timeoutMs),
  ]);
  // Give the page a brief moment to finish wiring up event handlers.
  await sleep(800);
}

async function handleCaptcha(page) {
  const present = await isCaptchaPresent(page);
  if (!present) return { solved: false, reason: 'not_present' };

  const startedAt = Date.now();
  console.log(`[captcha] pid=${process.pid} CAPTCHA detected at ${page.url()} — waiting for RektCaptcha to solve (timeout ${CAPTCHA_SOLVE_TIMEOUT_MS}ms)`);

  const solved = await waitForCaptchaSolved(page);
  if (!solved) {
    // Build a focused diagnostic so we can tell, on the broken machine,
    // whether the extension's content scripts even reached the recaptcha
    // iframes. RektCaptcha exposes window.__rekt_loaded once recaptcha.js
    // runs (added by recaptcha-visibility.js / recaptcha.js); checking it
    // inside every recaptcha frame tells us if injection failed entirely
    // (extension not loaded, or host_permissions denied) vs if injection
    // worked but the model couldn't run (AV blocking ONNX WASM, etc.).
    let frameDiag = 'unavailable';
    try {
      const frames = page.frames().filter(f => /recaptcha/i.test(f.url()));
      const probes = await Promise.all(frames.map(async f => {
        const url = f.url();
        let injected = null;
        try {
          injected = await f.evaluate(() => ({
            hasAnchorCheckbox: !!document.querySelector('#recaptcha-anchor'),
            hasChallengeImages: !!document.querySelector('.rc-imageselect'),
            // Any script the extension injected leaves traces on window.
            extKeys: Object.keys(window).filter(k => /rekt|captcha/i.test(k)),
          }));
        } catch (e) {
          injected = { error: e.message };
        }
        return { url: url.slice(0, 120), injected };
      }));
      frameDiag = JSON.stringify(probes);
    } catch (_) { /* best-effort */ }

    console.warn(`[captcha] pid=${process.pid} TIMEOUT after ${Date.now() - startedAt}ms at ${page.url()} — extension did not solve. Frame diagnostic: ${frameDiag}. Likely causes: extension not loaded by Chromium (check launch logs for "service worker registered"), AV blocking ONNX model load, or unsupported challenge type.`);
    return { solved: false, reason: 'timeout' };
  }

  console.log(`[captcha] pid=${process.pid} solved in ${Date.now() - startedAt}ms`);

  // Wait for Google's automatic post-solve navigation to complete before
  // returning, so callers don't operate on a destroyed execution context.
  await waitForPostCaptchaSettle(page);

  return { solved: true };
}

module.exports = { handleCaptcha, isCaptchaPresent, safeEvaluate };
