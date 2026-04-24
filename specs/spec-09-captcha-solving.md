# spec-09 — CAPTCHA Solving (RektCaptcha Extension)

**Status:** complete
**Depends on:** spec-08
**Blocks:** —

> Note: All code-side work is complete. The unpacked extension at `extensions/rektcaptcha/` is a one-time manual developer step (gitignored) — without it, startup logs a warning and CAPTCHA-bearing jobs will fail with `captcha_timeout` (acceptable degraded behavior).

---

## Goal
Detect Google reCAPTCHAs during Puppeteer sessions and let the **RektCaptcha** Chrome extension solve them automatically — no third-party API required. After this spec, jobs no longer fail on CAPTCHA; they pause, wait for the extension to solve it, then continue.

Extension: [RektCaptcha](https://chromewebstore.google.com/detail/rektcaptcha-recaptcha-sol/bbdhfoclddncoaomddgkaaphcnddbpdh)
Extension ID: `bbdhfoclddncoaomddgkaaphcnddbpdh`

---

## One-Time Setup (manual, done by developer)

Chrome extensions require the unpacked extension files on disk. Do this once:

1. Install [Chrome Extension Downloader](https://crxextractor.com/) or use the browser to export the CRX:
   - Visit the extension page in Chrome
   - In Chrome DevTools → Application → Service Workers, or use a CRX downloader tool
2. Unpack the downloaded `.crx` file (rename to `.zip`, extract)
3. Place the unpacked folder at: `extensions/rektcaptcha/` in the project root
4. Verify it contains `manifest.json`

Add to `.gitignore`:
```
extensions/
```

Add to `.env.example`:
```
# Path to unpacked RektCaptcha extension (relative to project root)
REKTCAPTCHA_PATH=./extensions/rektcaptcha
```

---

## Key Constraint: Extensions Require Non-Standard Headless

Chrome extensions do **not** work in standard headless mode (`headless: true`).

Use one of these two approaches:

**Option A — `headless: false` (simple, for local/dev)**
The browser window is visible. Fine for development and small-scale use.

**Option B — Virtual display on Linux servers**
Install Xvfb and wrap the process:
```bash
Xvfb :99 -screen 0 1366x768x24 &
DISPLAY=:99 node src/workers/trafficWorker.js
```
No code change needed — Puppeteer uses `DISPLAY` env var automatically.

On Windows servers: run headed (`headless: false`) with a minimized window; no extra setup needed.

---

## Files to Create/Modify
```
src/
  services/
    captchaService.js            ← CAPTCHA detection + wait logic
    puppeteerService.js          ← update: load extension + call captchaService
extensions/
  rektcaptcha/                   ← unpacked extension (gitignored, manual setup)
```

---

## Implementation Details

### `src/services/captchaService.js`

```js
const CAPTCHA_SOLVE_TIMEOUT_MS = 120_000;  // 2 minutes max

/**
 * Returns true if a reCAPTCHA is present on the page.
 */
async function isCaptchaPresent(page) {
  return await page.evaluate(() => {
    return !!document.querySelector(
      'iframe[src*="recaptcha"], #captcha-form, .g-recaptcha, iframe[title*="reCAPTCHA"]'
    );
  });
}

/**
 * Waits for the RektCaptcha extension to solve the CAPTCHA.
 * Returns true if solved, false if timed out.
 */
async function waitForCaptchaSolved(page) {
  const deadline = Date.now() + CAPTCHA_SOLVE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    // RektCaptcha injects the token into #g-recaptcha-response
    const solved = await page.evaluate(() => {
      const el = document.getElementById('g-recaptcha-response');
      return el && el.value && el.value.length > 0;
    });

    if (solved) return true;

    // Also check if CAPTCHA iframe disappeared (v3 or invisible captcha)
    const stillPresent = await isCaptchaPresent(page);
    if (!stillPresent) return true;

    await sleep(2000);
  }

  return false;  // timed out
}

/**
 * Main entry point: detect CAPTCHA, wait for extension to solve it.
 * Returns { solved: true } or { solved: false, reason: 'timeout' | 'not_present' }
 */
async function handleCaptcha(page) {
  const present = await isCaptchaPresent(page);
  if (!present) return { solved: false, reason: 'not_present' };

  const solved = await waitForCaptchaSolved(page);
  if (!solved) return { solved: false, reason: 'timeout' };

  // Give the page a moment to react after solution injection
  await sleep(1500);
  return { solved: true };
}

module.exports = { handleCaptcha, isCaptchaPresent };
```

### Update `puppeteerService.js` — Load Extension at Launch

In the `executeJob` function, update the browser launch block:

```js
const path = require('path');
const extensionPath = path.resolve(config.REKTCAPTCHA_PATH || './extensions/rektcaptcha');

const browser = await puppeteer.launch({
  headless: false,   // required for extensions to work
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    // proxy arg added here if proxy is configured (spec-08)
  ]
});
```

### Wire CAPTCHA Checks into `executeJob`

Replace the current CAPTCHA stub with actual calls. Insert checks at two points:

**Point 1 — After navigating to Google (before searching):**
```js
await page.goto('https://www.google.com');
const preCheck = await captchaService.handleCaptcha(page);
if (preCheck.reason === 'timeout') {
  return { success: false, error: 'captcha_timeout' };
}
```

**Point 2 — After submitting search (before reading results):**
```js
await page.waitForSelector('#search, #captcha-form, iframe[src*="recaptcha"]', { timeout: 15000 });
const postCheck = await captchaService.handleCaptcha(page);
if (postCheck.reason === 'timeout') {
  return { success: false, error: 'captcha_timeout' };
}
// Now safe to read search results
```

### Missing Extension Handling
If the extension path doesn't exist, log a startup warning and proceed without loading it (CAPTCHA solves will time out, jobs will fail — acceptable degraded behavior):

```js
const fs = require('fs');
if (!fs.existsSync(extensionPath)) {
  console.warn(`[captcha] RektCaptcha extension not found at ${extensionPath}. CAPTCHAs will not be solved.`);
  // launch without extension args
}
```

---

## Acceptance Criteria
- [ ] `extensions/rektcaptcha/manifest.json` exists (manual setup done — pending developer)
- [x] Puppeteer launches with `--load-extension` pointing to the extension directory
- [x] `isCaptchaPresent()` correctly detects reCAPTCHA iframes on a CAPTCHA page
- [x] When CAPTCHA is present, `waitForCaptchaSolved()` polls until token appears in `#g-recaptcha-response`
- [x] After 2 minutes without a solution, job is marked `failed` with `error='captcha_timeout'`
- [x] If extension directory is missing, startup logs a warning (no crash)
- [x] Jobs with no CAPTCHA are unaffected (fast path skips all waiting)
