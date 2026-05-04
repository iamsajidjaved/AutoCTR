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

async function waitForCaptchaSolved(page) {
  const deadline = Date.now() + CAPTCHA_SOLVE_TIMEOUT_MS;

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
