const http = require('http');
const https = require('https');
const config = require('../config');

const BASE = 'https://proxy.shoplike.vn/Api';

// Key-selection strategy
// ----------------------
// Each Shoplike API key = one independent rotating IP slot. A key can only be
// rotated every `nextChange` seconds (~60s by default), so two callers hitting
// the same key in quick succession both share whatever IP is currently bound
// to that key — they cannot both get a "new" proxy.
//
// Policy: **strict 1:1 mapping between PM2 workers and API keys**. Each PM2
// worker is pinned to exactly one key via `NODE_APP_INSTANCE` (the unique
// 0-based fork index PM2 cluster mode sets). The number of PM2 worker
// instances is driven by the key count in ecosystem.config.js, so adding a key
// to .env automatically gives you another worker, and a worker started with no
// matching key throws immediately rather than silently sharing a key with
// another worker.
//
// Within a single worker, the in-process concurrency limit (MAX_CONCURRENT_JOBS)
// allows up to 3 jobs to run at once; they intentionally share that worker's
// single key (and therefore its current rotating IP) until the next rotation
// window opens. This matches Shoplike's documented per-key rotation gating.
//
// When NODE_APP_INSTANCE is unset (running the worker directly via
// `node src/workers/trafficWorker.js` outside PM2) we fall back to a
// process-local round-robin counter so dev mode still works.
let rrIndex = 0;

function pickKey() {
  const keys = config.SHOPLIKE_API_KEYS;
  if (!keys || keys.length === 0) throw new Error('No SHOPLIKE_API_KEYS configured');

  const pmInstance = process.env.NODE_APP_INSTANCE;
  if (pmInstance !== undefined && pmInstance !== '') {
    const idx = parseInt(pmInstance, 10);
    if (Number.isInteger(idx) && idx >= 0) {
      if (idx >= keys.length) {
        // Strict 1:1 enforcement — refuse to share keys across PM2 workers.
        throw new Error(
          `PM2 worker instance ${idx} has no Shoplike key (only ${keys.length} key(s) configured). ` +
          `Add another key to SHOPLIKE_API_KEYS or reduce ctr-worker instances in ecosystem.config.js.`
        );
      }
      return keys[idx];
    }
  }

  const key = keys[rrIndex % keys.length];
  rrIndex = (rrIndex + 1) % keys.length;
  return key;
}

async function getNewProxy() {
  const key = pickKey();

  const body = await httpGetJson(`${BASE}/getNewProxy?access_token=${key}`);

  if (body.status === 'success') {
    return parseData(body.data);
  }

  // "Must wait N seconds" — rotation window hasn't elapsed; the key already has
  // a live IP, so reuse it via getCurrentProxy.
  if (body.nextChange !== undefined) {
    return getCurrentProxy(key);
  }

  throw new Error(`ShopLike getNewProxy error: ${body.mess || JSON.stringify(body)}`);
}

async function getCurrentProxy(key) {
  const body = await httpGetJson(`${BASE}/getCurrentProxy?access_token=${key}`);

  if (body.status === 'success') {
    return parseData(body.data);
  }

  throw new Error(`ShopLike getCurrentProxy error: ${body.mess || JSON.stringify(body)}`);
}

function parseData(data) {
  const [host, portStr] = data.proxy.split(':');
  const port = parseInt(portStr, 10);

  // Shoplike's `auth` field has two observed shapes:
  //   1. Legacy / Postman-doc format: a "user:pass" string, or "" for no auth.
  //   2. Current production format:    an object { ip_address, account } where
  //      `account` is the username and the corresponding password is delivered
  //      out-of-band on the dashboard. Empty strings on both sides mean the
  //      proxy is IP-whitelisted (no per-request credentials needed).
  let username = '';
  let password = '';
  if (typeof data.auth === 'string') {
    if (data.auth.includes(':')) {
      [username, password] = data.auth.split(':');
    }
  } else if (data.auth && typeof data.auth === 'object') {
    username = data.auth.account || data.auth.username || '';
    password = data.auth.password || '';
  }

  const url = username
    ? `http://${username}:${password}@${host}:${port}`
    : `http://${host}:${port}`;
  return { host, port, username, password, url };
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error(`ShopLike non-JSON response: ${raw}`)); }
      });
    }).on('error', reject);
  });
}

module.exports = { getNewProxy };
