'use strict';
// Downloads a fresh copy of the RektCaptcha extension from the Chrome Web Store,
// replaces extensions/rektcaptcha/, and verifies required model files.
//
// Usage:
//   node scripts/reinstall-captcha-extension.js
//   node scripts/reinstall-captcha-extension.js --force-baseline-wasm
//   REKTCAPTCHA_BASELINE_WASM=true node scripts/reinstall-captcha-extension.js
//
// --force-baseline-wasm (or env REKTCAPTCHA_BASELINE_WASM=true): after install,
// overwrite dist/ort-wasm-simd.wasm, dist/ort-wasm-threaded.wasm, and
// dist/ort-wasm-simd-threaded.wasm with a copy of dist/ort-wasm.wasm so that
// whichever variant onnxruntime-web picks based on CPU feature detection, it
// loads the baseline scalar build. Use this on hosts where the SIMD/threaded
// variants fail to load inside the bframe (symptom: extension clicks the
// "I'm not a robot" checkbox but never selects tiles, console shows
// `chrome-extension://<id>/dist/ort-wasm-simd.wasm net::ERR_FILE_NOT_FOUND`
// — see README.md → Troubleshooting → "CAPTCHA solver stuck after checkbox
// click"). Trade-off: ~30-50% slower per solve, max compatibility.
//
// No npm install needed — uses only Node.js built-ins.

const https = require('https');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const EXT_ID = 'bbdhfoclddncoaomddgkaaphcnddbpdh';
const CRX_URL =
  `https://clients2.google.com/service/update2/crx` +
  `?response=redirect&prodversion=120.0.0.0&acceptformat=crx3` +
  `&x=id%3D${EXT_ID}%26uc`;

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEST = path.join(PROJECT_ROOT, 'extensions', 'rektcaptcha');

const REQUIRED_FILES = [
  'manifest.json',
  'background.js',
  'recaptcha.js',
  'recaptcha-visibility.js',
  'rules.json',
  'models/yolov5-seg.ort',
  'models/mask-yolov5-seg.ort',
  'models/nms-yolov5-det.ort',
];

function download(url, maxRedirects = 10) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: '*/*',
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(download(res.headers.location, maxRedirects - 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} downloading from Chrome Web Store`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.setTimeout(90000, () => {
      req.destroy();
      reject(new Error('Download timed out after 90s'));
    });
  });
}

// CRX3 format: "Cr24" (4 bytes) + version uint32LE (4) + header_size uint32LE (4)
// + header_size bytes of protobuf + ZIP data.
// Falls back to scanning for PK magic if the header is unexpected.
function findZipOffset(buf) {
  if (buf.length > 12 && buf.slice(0, 4).toString('ascii') === 'Cr24') {
    const version = buf.readUInt32LE(4);
    if (version === 3) {
      const headerSize = buf.readUInt32LE(8);
      const zipStart = 12 + headerSize;
      if (zipStart < buf.length) return zipStart;
    }
  }
  for (let i = 0; i < Math.min(buf.length - 4, 131072); i++) {
    if (
      buf[i] === 0x50 && buf[i + 1] === 0x4b &&
      buf[i + 2] === 0x03 && buf[i + 3] === 0x04
    ) {
      return i;
    }
  }
  return -1;
}

// Enable the extension's built-in auto-open and auto-solve options.
// The Chrome Web Store build ships with both set to false (!1); patching
// them to true (!0) is required so Puppeteer's temp profiles auto-solve
// without manual popup interaction (spec-09 one-time setup requirement).
function patchAutoSolve(bgPath) {
  let src = fs.readFileSync(bgPath, 'utf8');
  const before = src;
  src = src.replace(/recaptcha_auto_open:!1/g, 'recaptcha_auto_open:!0');
  src = src.replace(/recaptcha_auto_solve:!1/g, 'recaptcha_auto_solve:!0');
  if (src === before) {
    console.log('[reinstall] auto-solve defaults already enabled — no patch needed');
  } else {
    fs.writeFileSync(bgPath, src, 'utf8');
    console.log('[reinstall] Patched background.js: recaptcha_auto_open + recaptcha_auto_solve → true');
  }
}

async function main() {
  const stamp = Date.now();
  const crxFile = path.join(os.tmpdir(), `rektcaptcha-${stamp}.crx`);
  const zipFile = path.join(os.tmpdir(), `rektcaptcha-${stamp}.zip`);
  const extractDir = path.join(os.tmpdir(), `rektcaptcha-extract-${stamp}`);

  try {
    console.log(`[reinstall] Downloading RektCaptcha (${EXT_ID}) from Chrome Web Store...`);
    const crxBuf = await download(CRX_URL);
    console.log(`[reinstall] Downloaded ${crxBuf.length} bytes`);
    fs.writeFileSync(crxFile, crxBuf);

    const zipOffset = findZipOffset(crxBuf);
    if (zipOffset === -1) {
      throw new Error(
        'Could not locate ZIP data in the downloaded CRX. ' +
        'The Chrome Web Store may have returned an unexpected format.'
      );
    }
    const zipBuf = crxBuf.slice(zipOffset);
    console.log(`[reinstall] CRX header: ${zipOffset} bytes  |  ZIP payload: ${zipBuf.length} bytes`);
    fs.writeFileSync(zipFile, zipBuf);

    fs.mkdirSync(extractDir, { recursive: true });
    console.log(`[reinstall] Extracting ZIP to temp dir...`);
    execSync(
      `powershell -NoProfile -NonInteractive -Command ` +
        `"Expand-Archive -LiteralPath '${zipFile}' -DestinationPath '${extractDir}' -Force"`,
      { stdio: 'inherit', timeout: 60000 }
    );

    // Some archives wrap everything in a single root directory — detect and unwrap.
    const extractedItems = fs.readdirSync(extractDir);
    let sourceDir = extractDir;
    if (
      extractedItems.length === 1 &&
      fs.statSync(path.join(extractDir, extractedItems[0])).isDirectory()
    ) {
      sourceDir = path.join(extractDir, extractedItems[0]);
      console.log(`[reinstall] Unwrapping subdirectory: ${extractedItems[0]}`);
    }

    console.log(`[reinstall] Removing old extension at ${DEST} ...`);
    if (fs.existsSync(DEST)) {
      fs.rmSync(DEST, { recursive: true, force: true });
    }
    fs.mkdirSync(path.dirname(DEST), { recursive: true });
    fs.renameSync(sourceDir, DEST);
    console.log(`[reinstall] Installed fresh extension to ${DEST}`);

    const missing = REQUIRED_FILES.filter((f) => !fs.existsSync(path.join(DEST, f)));
    if (missing.length > 0) {
      console.error('[reinstall] WARNING — required files missing after extraction:');
      missing.forEach((f) => console.error(`  missing: ${f}`));
      console.error(
        '[reinstall] The extension may not solve CAPTCHAs. ' +
        'Verify the extension ID is correct and try again.'
      );
      process.exit(1);
    }

    let modelCount = 0;
    try {
      modelCount = fs
        .readdirSync(path.join(DEST, 'models'))
        .filter((f) => f.endsWith('.ort')).length;
    } catch (_) {}

    // The extension ships with recaptcha_auto_open and recaptcha_auto_solve
    // both set to false (!1). Enable them so Puppeteer profiles auto-solve
    // CAPTCHAs without manual popup interaction (required by spec-09).
    patchAutoSolve(path.join(DEST, 'background.js'));

    // Optional: force the baseline WASM build by overwriting all variant
    // names with the baseline file. See header comment for why.
    //
    // We OVERWRITE (not delete) because onnxruntime-web's JS picks the variant
    // name based on CPU feature detection (SIMD, threading, JSEP), so deleting
    // the SIMD variant just causes ERR_FILE_NOT_FOUND when the JS still asks
    // for it. Copying baseline over every variant name guarantees that
    // whichever URL the JS fetches, it gets a working WASM file. Exports are
    // a strict superset relationship — the baseline build's exports satisfy
    // every call the JS makes; only the internal bodies differ (no SIMD
    // opcodes), so the runtime is correct just slower.
    const baselineWasm =
      process.argv.includes('--force-baseline-wasm') ||
      String(process.env.REKTCAPTCHA_BASELINE_WASM || '').toLowerCase() === 'true';
    if (baselineWasm) {
      const distDir = path.join(DEST, 'dist');
      const baselinePath = path.join(distDir, 'ort-wasm.wasm');
      if (!fs.existsSync(baselinePath)) {
        console.error(`[reinstall] FATAL: baseline ort-wasm.wasm missing at ${baselinePath}. Cannot apply --force-baseline-wasm.`);
        process.exit(1);
      }
      // Standard onnxruntime-web variants the JS wrapper may request.
      const VARIANTS = [
        'ort-wasm-simd.wasm',
        'ort-wasm-threaded.wasm',
        'ort-wasm-simd-threaded.wasm',
      ];
      const overwritten = [];
      for (const v of VARIANTS) {
        try {
          fs.copyFileSync(baselinePath, path.join(distDir, v));
          overwritten.push(v);
        } catch (err) {
          console.error(`[reinstall] WARNING: could not copy baseline to ${v}: ${err.message}`);
        }
      }
      console.log(`[reinstall] Baseline-WASM mode: overwrote ${overwritten.length} variant file(s) with baseline content: ${overwritten.join(', ')}`);
    }

    console.log(
      `[reinstall] All required files verified. Models: ${modelCount} .ort files`
    );
    console.log('[reinstall] SUCCESS — run: pm2 restart all');
  } finally {
    for (const f of [crxFile, zipFile]) {
      try { fs.unlinkSync(f); } catch (_) {}
    }
    try {
      if (fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true, force: true });
      }
    } catch (_) {}
  }
}

main().catch((err) => {
  console.error(`[reinstall] FAILED: ${err.message}`);
  process.exit(1);
});
