# spec-07 — Puppeteer Execution Engine

**Status:** complete
**Depends on:** spec-06
**Blocks:** spec-08, spec-09

---

## Goal
Replace the Puppeteer stub from spec-06 with a real stealth browser that searches Google and either impressions (scrolls/dwells) or clicks the target website. For click-type visits, the browser stays on the target site for a randomized dwell time performing human-like actions (scroll, internal navigation, text selection) — never leaving for an external domain. After this spec, each job opens a browser, performs the full visit, records actual dwell time, and closes cleanly.

---

## Dependencies to Install
```bash
npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth
```

---

## Files to Create/Modify
```
src/
  services/
    puppeteerService.js    ← replaces the stub
  utils/
    humanBehavior.js       ← random delays, scroll, text selection, internal nav
    deviceProfiles.js      ← mobile/desktop viewport configs
```

---

## Implementation Details

### `src/utils/deviceProfiles.js`

Mobile profile:
```js
{
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ...',
  viewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
  deviceScaleFactor: 3
}
```

Desktop profile:
```js
{
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...',
  viewport: { width: 1366, height: 768, isMobile: false, hasTouch: false },
  deviceScaleFactor: 1
}
```
Include 3+ variants for each to rotate randomly.

### `src/utils/humanBehavior.js`
```js
randomDelay(minMs, maxMs)
  → sleep a random duration within [minMs, maxMs]

randomScroll(page)
  → scroll down in 2–5 steps (random pixel amounts), pause between each,
    occasionally scroll back up partway

typeSlowly(page, selector, text)
  → focus selector, type each character with 50–200ms delay between chars

randomMouseMove(page)
  → move mouse to 2–4 random (x, y) positions within viewport before acting

selectRandomText(page)
  → pick a random paragraph/text node on the page,
    triple-click to select it (simulates copy-reading),
    then click elsewhere to deselect

clickInternalLink(page, targetDomain)
  → find all <a href> links on the current page
  → filter to only those whose href matches targetDomain (same domain)
  → exclude: navigation/header/footer links that lead to login/logout/cart
  → if candidates found, click a random one and return true
  → if none found, return false (caller continues without navigating)
  → after click: wait for load, return true

waitForNetworkIdle(page)
  → wait until no more than 0 in-flight network requests for 500ms (max wait 10s)
```

### `src/services/puppeteerService.js`

```js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async executeJob(job)
  job contains: type, device, keyword, website, min_dwell_seconds, max_dwell_seconds

  1. Pick device profile (mobile or desktop based on job.device)
  2. Build browser launch args (proxy added in spec-08)
  3. Launch browser (headless: false — required; extensions used in spec-09 don't work in standard headless)
  4. Set user agent + viewport
  5. Navigate to https://www.google.com
  6. Wait for search box: textarea[name="q"]
  7. humanBehavior.randomDelay(1000, 3000)
  8. humanBehavior.typeSlowly(page, 'textarea[name="q"]', job.keyword)
  9. Press Enter, waitForSelector('#search', { timeout: 15000 })
  10. humanBehavior.randomDelay(1500, 4000)
  11. [CAPTCHA check here — stub for now, full impl in spec-09]
  12. If job.type === 'impression':
        humanBehavior.randomScroll(page)
        humanBehavior.randomDelay(3000, 8000)
        return { success: true, actualDwellSeconds: null }
  13. If job.type === 'click':
        a. Find link in #search matching target domain
        b. humanBehavior.randomMouseMove(page)
        c. Click the link, waitForNavigation
        d. [CAPTCHA check on target page — stub for now]
        e. const dwellResult = await onSiteBehavior(page, job)
        f. return { success: true, actualDwellSeconds: dwellResult.elapsedSeconds }
  14. Close browser (in finally block)
```

### On-Site Behavior Loop (`onSiteBehavior`)

This function is called after landing on the target website. It runs a behavior loop for a randomized dwell duration, performing human-like actions, without ever navigating outside the target domain.

```js
async function onSiteBehavior(page, job) {
  const targetDomain = new URL(job.website).hostname;
  const dwellMs = randomBetween(
    job.min_dwell_seconds * 1000,
    job.max_dwell_seconds * 1000
  );
  const deadline = Date.now() + dwellMs;
  const startedAt = Date.now();

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    if (remaining < 2000) break;  // not enough time for another action

    // Randomly pick next action, weighted:
    //   scroll      → 50% chance
    //   internal nav → 25% chance (only if enough time remains)
    //   select text  → 15% chance
    //   idle pause   → 10% chance
    const roll = Math.random();

    if (roll < 0.50) {
      await humanBehavior.randomScroll(page);
      await humanBehavior.randomDelay(1500, 4000);

    } else if (roll < 0.75 && remaining > 10000) {
      // Internal navigation — only if >10s remains so we can dwell on the new page
      const navigated = await humanBehavior.clickInternalLink(page, targetDomain);
      if (navigated) {
        await humanBehavior.waitForNetworkIdle(page);
        await humanBehavior.randomDelay(2000, 5000);
        // After navigating, verify we're still on the target domain
        const currentDomain = new URL(page.url()).hostname;
        if (currentDomain !== targetDomain) {
          // Landed outside target (redirect) — go back
          await page.goBack({ waitUntil: 'networkidle0', timeout: 10000 });
        }
      } else {
        // No internal links found — fall back to scroll
        await humanBehavior.randomScroll(page);
        await humanBehavior.randomDelay(1000, 3000);
      }

    } else if (roll < 0.90) {
      await humanBehavior.selectRandomText(page);
      await humanBehavior.randomDelay(1000, 2500);

    } else {
      // Idle — user is "reading"
      await humanBehavior.randomDelay(3000, 8000);
    }
  }

  const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
  return { elapsedSeconds };
}
```

### Internal Link Safety Rules (enforced in `clickInternalLink`)
- Only click `<a>` tags where `href` resolves to the same hostname as `targetDomain`
- Skip `href` values that are: empty, `javascript:`, `#`, `mailto:`, `tel:`
- Skip links whose text or `href` contains: `logout`, `sign-out`, `login`, `register`, `cart`, `checkout`, `payment`
- If clicking causes navigation to a different domain (redirect), go back immediately

### Job Timeout
Timeout entire job at `max_dwell_seconds * 1.5 + 60` seconds (dwell + navigation overhead). Use `Promise.race` with a rejection timeout.

### Error Handling
- Catch all errors, close browser in `finally` block
- Return `{ success: false, error: err.message, actualDwellSeconds: null }` — never throw from `executeJob`

### CAPTCHA Detection (stub)
For now: detect `#captcha-form` or `iframe[src*="recaptcha"]`, log warning, return `{ success: false, error: 'captcha', actualDwellSeconds: null }`. Full solving via RektCaptcha Chrome extension is implemented in spec-09.

### Finding the Target URL in Search Results
```js
// Extract hostname from job.website, match against #search result links
const targetDomain = new URL(job.website).hostname;
const links = await page.$$(`#search a[href*="${targetDomain}"]`);
```

---

## Acceptance Criteria
- [ ] Impression jobs: search Google, scroll SERP, return `actualDwellSeconds: null`
- [ ] Click jobs: search Google, click target URL, run on-site behavior loop, return `actualDwellSeconds`
- [ ] `actualDwellSeconds` falls within `[min_dwell_seconds, max_dwell_seconds + small_overhead]`
- [ ] On-site loop performs scroll, internal navigation, and text selection during dwell
- [ ] Internal navigation never leaves the target domain (verified by checking `page.url()` after each nav)
- [ ] Any accidental external redirect triggers an immediate `goBack()`
- [ ] Browser always closes, even on error
- [ ] Job times out if it runs too long — no infinite hangs
- [ ] Stealth plugin active (no `window.navigator.webdriver` leak)
- [ ] Target URL not found in SERP → `{ success: false, error: 'not_in_serp' }`
