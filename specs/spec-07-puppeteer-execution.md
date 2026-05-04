# spec-07 — Puppeteer Execution Engine

**Status:** complete
**Depends on:** spec-06
**Blocks:** spec-08, spec-09

---

## Goal
Replace the Puppeteer stub from spec-06 with a real stealth browser that executes two distinct job types:

- **Impression** — The worker searches the keyword on Google, solves any Google CAPTCHA if it appears, views the Google SERP, scrolls up and down the results page, then closes the browser in a way that Google records it as a search impression. The target website appears in the results but is **not clicked**.
- **Click / Visit** — The worker searches the keyword on Google, solves any Google CAPTCHA if it appears, finds the target website in the SERP, clicks on it, and then interacts with the site for a randomized dwell period performing human-like actions (scroll, internal navigation, text selection) — never navigating outside the target domain.

After this spec, each job opens a browser, performs the appropriate action, records actual dwell time (clicks only), and closes cleanly.

---

## Critical Invariant — SERP-Click Only

The entire product depends on this rule, so it is called out here explicitly:

- A **click** job MUST be executed by clicking the target's organic-result anchor on the Google SERP itself, using a real mouse event (`page.mouse.click(x, y)` on the matching `a[ping^="/url"]` element). This causes Google's `/url?...` interceptor to fire, so the destination loads with `Referer: https://www.google.com` and the click is registered by Google as a genuine SERP click (organic traffic).
- It is **forbidden** to reach the target via `page.goto(targetUrl)`, by extracting/copying the SERP `href` and navigating to it directly, by `window.open`, or by any other mechanism that bypasses the SERP anchor click. Such shortcuts arrive as direct traffic with no Google referrer and defeat the purpose of the tool.
- The only direct navigation allowed inside a job is `page.goto('https://www.google.com')` to start the search.
- An **impression** job MUST search the keyword on Google and dwell on the SERP without ever clicking the target domain (target may be hovered/scrolled past, never clicked).
- If the target URL is not present on SERP page 1, the job fails with `{ success: false, error: 'not_in_serp' }`. Multi-page pagination is intentionally **out of scope** for spec-07; if needed it will be added as a separate spec rather than weakening this invariant.

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

### `shared/utils/deviceProfiles.js`

A device profile is a fully-coherent identity used by puppeteerService to make
each session indistinguishable from a real device. Every field is intentional;
mismatches between any two of them are an instant bot signal.

```js
{
  userAgent:          // Chrome/Safari/Firefox UA string, kept current to the
                      //   present major version (refresh on each Chrome bump).
  viewport: {
    width, height,
    isMobile,         // toggles mobile/desktop layout heuristics
    hasTouch,         // toggles ontouchstart + maxTouchPoints
  },
  deviceScaleFactor,  // pixel ratio (3 for iPhones, 2 for Retina, ~2.6 Android)
  platform,           // navigator.platform (e.g. 'Win32', 'MacIntel', 'iPhone')
  languages,          // navigator.languages array
  acceptLanguage,     // exact Accept-Language header value (must match languages)
  timezone,           // IANA tz for page.emulateTimezone (must align with proxy IP geo)
  hardwareConcurrency,// navigator.hardwareConcurrency
  deviceMemory,       // navigator.deviceMemory (GB)
  uaMetadata,         // Sec-CH-UA / userAgentData payload — null for Safari/Firefox/iOS
  weight,             // weighted-random pick weight inside its (mobile|desktop) pool
}
```

Pool composition (April 2026):
- **Desktop** (7 profiles): Chrome 134 on Win/Mac/Linux (most weight), Edge 134, Safari 17.6, Firefox 125 — weighted to mirror real-world market share.
- **Mobile** (6 profiles): iOS 17.6/17.5/16.7 Safari, Android 14 Pixel 8 / Samsung S24 with Chrome 134, Android 13 Samsung A54.

The desktop-vs-mobile split itself is decided by `mobile_desktop_ratio` at job
distribution time (spec-05). The pick inside each pool uses `weight`-based
random selection so the most common real-world combos are picked most often.

### `shared/utils/humanBehavior.js`
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

browseSerp(page, targetDomain, dwellMs)
  → SERP-only interaction loop used by impression visits
  → weighted actions over the dwell window:
      55% smooth scroll a small distance through the results
      20% hover (mouse-move only, never click) over a non-target organic result
      13% expand a "People also ask" question if present (in-place expand, no navigation)
      remainder: idle reading pause + small mouse jiggle
  → never clicks any link; explicitly skips any <a> whose href contains targetDomain
     when picking a hover candidate, so no impression accidentally registers a click
  → optional final smooth-scroll back to top (40% chance)
  → returns { elapsedSeconds }

waitForNetworkIdle(page)
  → wait until no more than 0 in-flight network requests for 500ms (max wait 10s)
```

### `shared/services/puppeteerService.js`

```js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async executeJob(job)
  job contains: type, device, keyword, website, min_dwell_seconds, max_dwell_seconds

  1. Pick device profile (mobile or desktop based on job.device) via weighted random
  2. Build browser launch args (proxy added in spec-08) — see "Super-Stealth Browser Launch" below
  3. Launch browser with `headless: false` — always. Extensions used in spec-09 don't work in standard headless, and the project policy is to never run headless.
  3a. On Windows, bring the freshly-launched Chromium window to the foreground via a brief PowerShell `SetForegroundWindow` / `ShowWindow` call (best-effort; silent no-op on non-Windows or any failure). Lets the operator clearly see each visible run.
  4. Apply full identity emulation BEFORE first navigation:
       - `page.setUserAgent(ua, uaMetadata)` (UA + Sec-CH-UA / navigator.userAgentData)
       - `page.emulate({ viewport, userAgent })` (DPR, touch, mobile media queries)
       - `page.setExtraHTTPHeaders({ 'Accept-Language': profile.acceptLanguage })`
       - `page.emulateTimezone(profile.timezone)`
       - `page.evaluateOnNewDocument(...)` to patch navigator.languages / platform /
         hardwareConcurrency / deviceMemory / maxTouchPoints / plugins / permissions
  5. Navigate to https://www.google.com
  6. Wait for search box: textarea[name="q"]
  7. humanBehavior.randomDelay(1000, 3000)
  8. humanBehavior.typeSlowly(page, 'textarea[name="q"]', job.keyword)
  9. Press Enter, then **wait for the SERP** with `waitForSerp(timeoutMs)`:
       - Selector union: `#search, #rso, #rcnt, #main, [role="main"] [data-async-context], form[action="/search"] ~ div #rso, #captcha-form, iframe[src*="recaptcha"]`
       - Race `page.waitForNavigation({ waitUntil: 'domcontentloaded' })` against
         `page.waitForSelector(SERP_SELECTORS)`, then re-confirm a selector hit (5 s).
       - First attempt: 30 s. If it fails, ONE recovery attempt:
         - If current URL contains `q=` or `/search` → wait another 15 s (mid-stream).
         - Else (Enter never navigated) → submit the form via `form.submit()` or
           re-type the query and press Enter, then wait 20 s.
       - If both attempts fail → `{ success: false, error: 'serp_wait_timeout' }`,
         and log `[puppeteer] job <id> SERP wait failed at <url>: <message>`.
       - Why broad selectors + retry: Google's SERP wrapper varies by A/B
         (`#search` / `#rso` / `#rcnt` / `#main`), and slow proxies can push first
         paint past 15 s. The original tight selector caused intermittent
         `Waiting for selector ... failed` errors, especially on click jobs that
         tie up workers longer.
  10. humanBehavior.randomDelay(1500, 4000)
  11. captchaService.handleCaptcha(page) — if CAPTCHA appeared after search, wait for extension to solve it
  12. If CAPTCHA was solved (postCheck.solved === true): waitForSelector('#search', timeout 20s) + randomDelay
      → Google auto-submits the CAPTCHA form and navigates back to the SERP; must wait before reading results
  13. If job.type === 'impression':
        // Impression: view + interact with the SERP only. Target site is never clicked.
        // Dwell is decoupled from job.min/max_dwell_seconds (those govern on-site time)
        // and uses a SERP-appropriate window of 8–25 seconds.
        const dwellMs = randomBetween(8000, 25000)
        const result = await humanBehavior.browseSerp(page, targetDomain, dwellMs)
        return { success: true, actualDwellSeconds: result.elapsedSeconds }
  14. If job.type === 'click':
        // Click/Visit: find and click target site in SERP, then interact on-site.
        a. findResultCoords(page, targetDomain) → { x, y } or null — see helper below
           (scroll + coords resolved in one page.evaluate; no ElementHandle stored)
        b. randomDelay(500, 1200) + page.mouse.move(x±4, y±4)  ← hover near element
        c. randomDelay(100, 300)
        d. Promise.all([waitForNavigation, page.mouse.click(x, y)])
        e. const dwellResult = await onSiteBehavior(page, job)
        f. return { success: true, actualDwellSeconds: dwellResult.elapsedSeconds }
  15. Close browser (in finally block)
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

### Finding the Target URL in Search Results (`findResultCoords`)

Google attaches CTR tracking listeners to the `<a>` element wrapping the `<h3>` title. Clicking other `<a>` elements in the result block (display URL, breadcrumb) will **not** register in Google Search Console.

**Match priority** (so Google records a real organic click for the campaign URL):
  1. Exact target URL (protocol-, www-, and trailing-slash insensitive) wrapping an `<h3>`
  2. Exact target URL anywhere in the candidate pool
  3. Same-domain link wrapping an `<h3>`
  4. Any same-domain link in the candidate pool

The helper logs `[exact match]` vs `[same-domain fallback]` so the campaign owner can see which result was actually clicked. The fallback to other URLs on the same domain only fires when the exact campaign URL isn't ranked on the SERP.

**Candidate selector.** Google ALWAYS attaches a `ping="/url?sa=t&..."` attribute to organic result `<a>` tags — that single attribute is the most reliable selector across SERP layouts and doesn't depend on container IDs (`#search` / `#rso` / `#main` shift between A/B variants). The helper unions three sources so we still work if any wrapper changes:
```js
'#search a[ping^="/url"][href]'
'#rso a[ping^="/url"][href]'
'a[ping^="/url"][href]'   // document-wide fallback
```

**Race-free read.** Before reading the DOM, the helper waits for at least one organic result link to render (`page.waitForFunction(... a[ping^="/url"] ...)` with a 15 s timeout). The `#search` wrapper appears almost immediately after submit, but the result `<a>` tags stream in afterwards — reading too early returns an empty list and a false `not_in_serp`.

**Diagnostic on miss.** If no candidate matches the target domain, the helper logs the wanted host + a sample of the first 8 organic anchors it DID see, so misses are explainable (wrong layout, ad-only SERP, redirect, etc.):
```
[puppeteer] findResultCoords miss — wanted example.com (exact example.com/page);
  saw 10 organic links: ["competitor1.com","competitor2.com",...]
```

**Important:** Do not store `ElementHandle` objects across delays. After a CAPTCHA redirect, Google's SERP JS may re-render results, destroying the execution context. The helper resolves everything inside a single `page.evaluate` call and returns plain viewport coordinates `{ x, y, href, matchedExact }`. The call site is wrapped in a 3-attempt retry loop that absorbs transient `"Execution context was destroyed"` errors caused by post-CAPTCHA redirect chains.

Use `page.mouse.click(x, y)` (not `element.click()`) — it fires real `mousemove`/`mousedown`/`mouseup`/`click` events at exact viewport coordinates, which is what Google's tracking listeners require. The click is performed on the actual SERP `<a>`, so Google's `/url?...` interceptor fires, the click is logged in Search Console, and the destination loads with a Google referrer (organic traffic, not direct):
```js
await page.mouse.move(coords.x + offset, coords.y + offset);
await humanBehavior.randomDelay(100, 300);
await Promise.all([
  page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
  page.mouse.click(coords.x, coords.y),
]);
```

---

## Super-Stealth Browser Launch

The previous "set userAgent + viewport" approach is not enough — Google fingerprints sessions across dozens of signals. Every job runs through the full stealth pipeline below.

### Anti-detection Chromium flags
```js
const launchArgs = [
  `--proxy-server=${proxy.host}:${proxy.port}`,
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',          // kills navigator.webdriver
  '--disable-features=IsolateOrigins,site-per-process,Translate,AutomationControlled',
  '--disable-infobars',
  '--no-default-browser-check',
  '--no-first-run',
  '--password-store=basic',
  '--use-mock-keychain',
  `--lang=${profile.languages[0]}`,                          // ICU + Accept-Language
  `--window-size=${profile.viewport.width},${profile.viewport.height}`,
  '--window-position=0,0',  // predictable on-screen spot for the foreground window
];
puppeteer.launch({
  headless: false,
  args: launchArgs,
  ignoreDefaultArgs: ['--enable-automation'],                // remove the automation banner
  defaultViewport: null,                                      // honor the OS window-size
});
```

### Per-page identity emulation (must run BEFORE first navigation)

| Surface | API | Why |
|---|---|---|
| `navigator.userAgent` | `page.setUserAgent(ua, uaMetadata)` | Sets UA + Sec-CH-UA / `navigator.userAgentData` consistently |
| Viewport, DPR, touch | `page.emulate({ viewport, userAgent })` | Triggers correct mobile / pointer media queries |
| `Accept-Language` header | `page.setExtraHTTPHeaders` | Must match `navigator.languages` and `--lang` |
| Timezone | `page.emulateTimezone(profile.timezone)` | Date / Intl offset must match proxy IP geo |
| `navigator.languages` / `.platform` / `.hardwareConcurrency` / `.deviceMemory` / `.maxTouchPoints` / `.plugins` | `page.evaluateOnNewDocument(...)` | Patches surfaces stealth-plugin doesn't cover or covers with wrong values |
| Notification permission quirk | `navigator.permissions.query` shim | Real Chrome returns `'default'`; headless returns `'denied'` |

Combined with `puppeteer-extra-plugin-stealth` (which patches `navigator.webdriver`, `chrome` runtime, WebGL vendor, Permissions API, etc.) the resulting fingerprint passes the major detection suites (CreepJS, FpJS Bot Detection, BotD).

### Identity coherence checklist
For any single profile, all of the following MUST be consistent or the session is detectable:
- UA string ↔ Sec-CH-UA brand+version ↔ `navigator.userAgentData`
- UA platform (e.g. `Win64`) ↔ `navigator.platform` (`Win32`) ↔ Sec-CH-UA-Platform
- `viewport.isMobile` / `hasTouch` ↔ `maxTouchPoints` ↔ UA "Mobile" token
- `Accept-Language` header ↔ `navigator.languages` ↔ `--lang` flag
- `timezone` ↔ proxy IP geolocation (loose tolerance — cluster by region)

The pool in `deviceProfiles.js` is hand-curated to satisfy this checklist for every entry.

---

## Acceptance Criteria
- [ ] Impression jobs: search Google, solve CAPTCHA if present, run `browseSerp` (scroll, hover non-target results, optionally expand "People also ask"), close browser — target site is **never** clicked; `actualDwellSeconds` reports the SERP dwell window (~8–25s)
- [ ] Click/Visit jobs: search Google, solve CAPTCHA if present, click target URL in SERP, run on-site behavior loop, return `actualDwellSeconds`
- [ ] `actualDwellSeconds` for clicks falls within `[min_dwell_seconds, max_dwell_seconds + small_overhead]`
- [ ] `browseSerp` never picks the target domain as a hover candidate (no accidental click on impression visits)
- [ ] On-site loop performs scroll, internal navigation, and text selection during dwell
- [ ] Internal navigation never leaves the target domain (verified by checking `page.url()` after each nav)
- [ ] Any accidental external redirect triggers an immediate `goBack()`
- [ ] Browser always closes, even on error
- [ ] Job times out if it runs too long — no infinite hangs
- [ ] Stealth plugin active (no `window.navigator.webdriver` leak)
- [ ] Target URL not found in SERP → `{ success: false, error: 'not_in_serp' }`
- [ ] SERP fails to render after Enter (after 1 retry) → `{ success: false, error: 'serp_wait_timeout' }`, with the failure URL + underlying selector message logged for diagnosis
- [ ] Click jobs prioritize the **exact** campaign URL on the SERP; only fall back to other same-domain results when the exact URL isn't ranked (logged as `[exact match]` vs `[same-domain fallback]`)
- [ ] Click is performed via `page.mouse.click` on the SERP `<a>` so Google's `/url?...` interceptor fires and the destination loads with a Google referrer (organic, not direct traffic)
- [ ] Each session uses a complete, coherent device fingerprint: UA + Sec-CH-UA + viewport + DPR + touch + Accept-Language + timezone + navigator.platform/languages/hardwareConcurrency/deviceMemory/maxTouchPoints all match the chosen profile
- [ ] Mobile profiles emulate touch (`hasTouch: true`, `maxTouchPoints > 0`) and trigger mobile media queries
- [ ] User-Agent strings stay current to within one major Chrome/Safari version (refresh `deviceProfiles.js` on each Chrome major bump)
- [ ] Desktop / mobile split honors `mobile_desktop_ratio` from the campaign (enforced at distribution time in spec-05)
