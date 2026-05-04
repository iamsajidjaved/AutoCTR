const fs = require('fs');
const path = require('path');

const CAPTCHA_SOLVE_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 1500;

// Fast-fail mode: when this process has already timed out once with strong
// evidence the extension's ONNX runtime can't load (no `rektcaptcha:` console
// trace inside the bframe AND/OR a failed fetch of dist/ort-wasm-simd.wasm),
// subsequent CAPTCHAs short-circuit after FAST_FAIL_TIMEOUT_MS instead of
// burning the full 120 s per job. The host is broken; an operator must apply
// the runbook in README.md → Troubleshooting → "CAPTCHA solver stuck after
// checkbox click". This avoids poisoning the queue while the issue is fixed.
//
// Reset on process restart (PM2 restart) so a transient failure doesn't latch
// permanently across operator intervention.
const FAST_FAIL_TIMEOUT_MS = 5_000;
let WASM_FAILURE_DETECTED = false;
let WASM_FAILURE_REASON = null;

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

// Read a snapshot of the bframe (image-challenge iframe). Returns null if the
// bframe is not present or its execution context is unavailable. Used both
// for live diagnostics during the polling loop and for the post-timeout dump.
async function probeBframe(page) {
  const bframe = page
    .frames()
    .find(f => /\/recaptcha\/(api2|enterprise)\/bframe/.test(f.url()));
  if (!bframe) return null;
  try {
    return await bframe.evaluate(() => {
      const challenge = document.querySelector('.rc-imageselect');
      const tiles = document.querySelectorAll(
        '.rc-imageselect-target td, .rc-image-tile-wrapper'
      );
      const selected = document.querySelectorAll(
        '.rc-imageselect-tileselected, .rc-imageselect-dynamic-selected'
      );
      const verifyBtn = document.querySelector('#recaptcha-verify-button');
      const errorBanner = document.querySelector('.rc-imageselect-incorrect-response');
      const desc = document.querySelector('.rc-imageselect-desc, .rc-imageselect-desc-no-canonical');
      return {
        challengePresent: !!challenge,
        tileCount: tiles.length,
        tilesSelected: selected.length,
        verifyEnabled: !!verifyBtn && !verifyBtn.disabled,
        errorBannerVisible: !!errorBanner && getComputedStyle(errorBanner).display !== 'none',
        challengeText: desc ? (desc.innerText || '').slice(0, 80) : '',
      };
    });
  } catch (err) {
    return { error: err.message };
  }
}

// Attach console + pageerror listeners to a page so we can dump the last N
// messages on a CAPTCHA timeout. RektCaptcha logs lines prefixed with
// "rektcaptcha:" when its model loads — the absence of those lines after the
// bframe opens is the most diagnostic signal we have for an ONNX-runtime
// WASM load failure inside the iframe.
//
// Returns an object the caller can read on timeout. Safe to call multiple
// times per page; subsequent calls are no-ops.
function attachBframeConsoleCapture(page) {
  if (page.__captchaConsoleCapture) return page.__captchaConsoleCapture;
  const buf = { messages: [], errors: [] };
  page.__captchaConsoleCapture = buf;

  const onConsole = (msg) => {
    try {
      const line = `[${msg.type()}] ${msg.text()}`.slice(0, 300);
      buf.messages.push(line);
      if (buf.messages.length > 50) buf.messages.shift();
    } catch (_) { /* best-effort */ }
  };
  const onPageError = (err) => {
    try {
      buf.errors.push(String(err && err.message ? err.message : err).slice(0, 300));
      if (buf.errors.length > 30) buf.errors.shift();
    } catch (_) { /* best-effort */ }
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  return buf;
}

// On timeout, ask the bframe to fetch the extension's ONNX-runtime WASM files
// so we can confirm whether they're reachable AND non-zero from inside that
// iframe context. A 200 + non-trivial size for at least ort-wasm.wasm means
// the extension files are intact and MV3 web_accessible_resources is
// permitting the fetch — pointing at CPU SIMD detection or a runtime model
// error. A failed fetch (404, network error, 0 bytes) for ALL variants means
// AV is blocking the files or the CRX didn't include them.
async function probeWasmFetchFromBframe(page) {
  const bframe = page
    .frames()
    .find(f => /\/recaptcha\/(api2|enterprise)\/bframe/.test(f.url()));
  if (!bframe) return { ok: false, reason: 'no_bframe' };
  try {
    return await bframe.evaluate(async () => {
      const out = {
        crossOriginIsolated: typeof crossOriginIsolated !== 'undefined' ? !!crossOriginIsolated : null,
        sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
        hardwareConcurrency: navigator.hardwareConcurrency || 0,
        wasmFiles: [],
      };
      // Recover the extension's ID by inspecting any <script> the extension
      // injected into this iframe — its src is chrome-extension://<id>/...
      let extId = null;
      for (const s of document.querySelectorAll('script')) {
        const m = (s.src || '').match(/^chrome-extension:\/\/([a-p]+)\//);
        if (m) { extId = m[1]; break; }
      }
      if (!extId) {
        out.extensionIdFound = false;
        return out;
      }
      out.extensionIdFound = true;
      out.extensionId = extId;
      const candidates = [
        'ort-wasm.wasm',
        'ort-wasm-simd.wasm',
        'ort-wasm-threaded.wasm',
        'ort-wasm-simd-threaded.wasm',
      ];
      for (const f of candidates) {
        try {
          const r = await fetch(`chrome-extension://${extId}/dist/${f}`);
          let size = parseInt(r.headers.get('content-length') || '0', 10);
          // content-length is often missing for chrome-extension:// — read
          // the body length as a fallback so we can detect 0-byte files.
          if (!size && r.ok) {
            try {
              const buf = await r.arrayBuffer();
              size = buf.byteLength;
            } catch (_) { /* best-effort */ }
          }
          out.wasmFiles.push({ file: f, status: r.status, size });
        } catch (e) {
          out.wasmFiles.push({ file: f, error: String(e && e.message || e).slice(0, 100) });
        }
      }
      return out;
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Best-effort dump of failure state to disk so the operator has something
// concrete to inspect. Goes to worker/logs/ which already exists and is
// gitignored. Filenames include pid + epoch so concurrent workers don't
// clobber each other.
async function dumpTimeoutArtifacts(page) {
  try {
    // Resolve worker/logs from this file's location regardless of cwd.
    const dir = path.resolve(__dirname, '..', '..', 'worker', 'logs');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const stamp = `${process.pid}-${Date.now()}`;
    const pngPath = path.join(dir, `captcha-timeout-${stamp}.png`);
    const htmlPath = path.join(dir, `captcha-timeout-${stamp}.html`);
    await page.screenshot({ path: pngPath, fullPage: false }).catch(() => {});
    const html = await safeEvaluate(page, () => document.documentElement.outerHTML, '');
    if (html) fs.writeFileSync(htmlPath, html, 'utf8');
    return { pngPath, htmlPath };
  } catch (err) {
    return { error: err.message };
  }
}

async function waitForCaptchaSolved(page, { timeoutMs = CAPTCHA_SOLVE_TIMEOUT_MS } = {}) {
  const deadline = Date.now() + timeoutMs;
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
    // We also peek INSIDE the bframe (probeBframe) — tilesSelected staying
    // at 0 while tileCount > 0 for >15 s is the smoking gun for an ONNX
    // model load failure (extension is alive, model is dead).
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
      const bframeDiag = diag && diag.bframeVisible ? await probeBframe(page) : null;
      if (diag) {
        let line =
          `[captcha] pid=${process.pid} poll T+${elapsed}s` +
          ` — token=${diag.tokenLen}` +
          `, bframeVisible=${diag.bframeVisible}` +
          `, anchorPresent=${diag.anchorPresent}` +
          `, recaptchaIframes=${diag.recaptchaIframes}`;
        if (bframeDiag) {
          line +=
            ` | bframe: tiles=${bframeDiag.tileCount}` +
            `, selected=${bframeDiag.tilesSelected}` +
            `, verifyEnabled=${bframeDiag.verifyEnabled}` +
            `, errorBanner=${bframeDiag.errorBannerVisible}` +
            (bframeDiag.challengeText ? `, challenge="${bframeDiag.challengeText}"` : '');
        }
        console.log(line);
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

  // Capture console + pageerror for diagnostic dump on timeout.
  const consoleBuf = attachBframeConsoleCapture(page);

  const startedAt = Date.now();

  // Fast-fail short-circuit. After this process has already proven once that
  // its ONNX runtime can't load, don't burn 120 s per job. Operator must fix
  // the host (see README.md → Troubleshooting → "CAPTCHA solver stuck after
  // checkbox click") and PM2-restart. Reason is logged so logs explain why
  // the CAPTCHA wasn't even attempted.
  const effectiveTimeout = WASM_FAILURE_DETECTED ? FAST_FAIL_TIMEOUT_MS : CAPTCHA_SOLVE_TIMEOUT_MS;
  if (WASM_FAILURE_DETECTED) {
    console.warn(
      `[captcha] pid=${process.pid} FAST-FAIL mode active (reason: ${WASM_FAILURE_REASON}). ` +
      `Skipping full ${CAPTCHA_SOLVE_TIMEOUT_MS}ms wait — failing in ${FAST_FAIL_TIMEOUT_MS}ms. ` +
      `Fix the host and restart PM2 to clear this state.`
    );
  } else {
    console.log(
      `[captcha] pid=${process.pid} CAPTCHA detected at ${page.url()} — waiting for RektCaptcha to solve (timeout ${effectiveTimeout}ms)`
    );
  }

  const solved = await waitForCaptchaSolved(page, { timeoutMs: effectiveTimeout });
  if (!solved) {
    // Build a focused diagnostic so we can tell, on the broken machine,
    // whether the extension's content scripts even reached the recaptcha
    // iframes, AND whether the model files loaded inside the bframe.
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
            extKeys: Object.keys(window).filter(k => /rekt|captcha/i.test(k)),
          }));
        } catch (e) {
          injected = { error: e.message };
        }
        return { url: url.slice(0, 120), injected };
      }));
      frameDiag = JSON.stringify(probes);
    } catch (_) { /* best-effort */ }

    // Final bframe state + WASM-fetch probe + console history.
    const bframeFinal = await probeBframe(page).catch(() => null);
    const wasmProbe = await probeWasmFetchFromBframe(page).catch(() => null);
    const dump = await dumpTimeoutArtifacts(page).catch(() => null);

    // Decide whether to latch fast-fail mode for subsequent jobs in this
    // process. Strong signals of an unrecoverable host-level failure:
    //   * bframe was visible and rendered tiles, but tilesSelected==0
    //     (model never produced output)
    //   * the bframe's console never logged a `rektcaptcha:` line
    //   * any of the dist/*.wasm fetches failed (file missing or AV-blocked)
    // We require at least TWO signals to latch — a single timeout could be
    // a flaky network or unsolvable challenge variant.
    const rektLogged = (consoleBuf.messages || []).some(m => /rektcaptcha:/i.test(m));
    const tilesNeverSelected = !!(
      bframeFinal && bframeFinal.tileCount > 0 && bframeFinal.tilesSelected === 0
    );
    const wasmFetchFailed = !!(
      wasmProbe && Array.isArray(wasmProbe.wasmFiles) &&
      wasmProbe.wasmFiles.length > 0 &&
      wasmProbe.wasmFiles.every(w => w.error || (w.status && w.status >= 400) || w.size === 0)
    );
    const signals = [
      tilesNeverSelected && 'tiles_never_selected',
      !rektLogged && 'no_rektcaptcha_console_log',
      wasmFetchFailed && 'wasm_fetch_failed',
    ].filter(Boolean);

    if (!WASM_FAILURE_DETECTED && signals.length >= 2) {
      WASM_FAILURE_DETECTED = true;
      WASM_FAILURE_REASON = signals.join('+');
      console.error(
        `[captcha] pid=${process.pid} latching FAST-FAIL mode for this worker process. ` +
        `Signals: ${WASM_FAILURE_REASON}. All subsequent CAPTCHAs in this PID will fail in ${FAST_FAIL_TIMEOUT_MS}ms. ` +
        `Fix: see README.md → Troubleshooting → "CAPTCHA solver stuck after checkbox click", then \`pm2 restart all\`.`
      );
    }

    console.warn(
      `[captcha] pid=${process.pid} TIMEOUT after ${Date.now() - startedAt}ms at ${page.url()} — extension did not solve. ` +
      `Frame diagnostic: ${frameDiag}. ` +
      `Final bframe: ${JSON.stringify(bframeFinal)}. ` +
      `WASM probe: ${JSON.stringify(wasmProbe)}. ` +
      `Console (last 10): ${JSON.stringify((consoleBuf.messages || []).slice(-10))}. ` +
      `PageErrors (last 5): ${JSON.stringify((consoleBuf.errors || []).slice(-5))}. ` +
      `Artifacts: ${JSON.stringify(dump)}. ` +
      `Likely causes: extension not loaded by Chromium, AV blocking ONNX model load, ` +
      `or ONNX-Runtime WASM init failure inside the bframe (try reinstalling with ` +
      `REKTCAPTCHA_BASELINE_WASM=true npm run captcha:reinstall).`
    );
    return { solved: false, reason: 'timeout' };
  }

  console.log(`[captcha] pid=${process.pid} solved in ${Date.now() - startedAt}ms`);

  // Wait for Google's automatic post-solve navigation to complete before
  // returning, so callers don't operate on a destroyed execution context.
  await waitForPostCaptchaSettle(page);

  return { solved: true };
}

module.exports = { handleCaptcha, isCaptchaPresent, safeEvaluate, attachBframeConsoleCapture };
