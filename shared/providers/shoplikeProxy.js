const http = require('http');
const https = require('https');
const config = require('../config');

const BASE = 'https://proxy.shoplike.vn/Api';

// Cooldown-aware key pool
// -----------------------
// Each Shoplike API key is one rotating IP slot, gated server-side by a ~60s
// rotation window. Calling getNewProxy on a key inside that window returns the
// SAME live IP it just had — Shoplike's API itself replies with `nextChange`
// (seconds remaining) instead of rotating.
//
// Workers are no longer pinned 1:1 to keys. PM2 worker count tracks CPU cores
// (WORKER_CONCURRENCY); keys are shared via this in-process pool. For each job
// the pool hands out a key whose cooldown has elapsed, marks it in-use, and
// releases it after the proxy call returns. If no key is ready, the caller
// awaits — better to delay a job a few seconds than to reuse the same IP for
// back-to-back impressions.
//
// Scope is per worker process. Cross-worker coordination is not implemented;
// Shoplike's server-side rotation gate is the ultimate source of truth, so the
// worst cross-worker race outcome is two impressions sharing one IP within the
// 60s window — the same behavior the legacy 1:1 pinning could exhibit when a
// single worker ran multiple concurrent jobs.

const ROTATION_WINDOW_MS = 60_000;
const ACQUIRE_POLL_MS = 500;
const ACQUIRE_TIMEOUT_MS = 5 * 60_000; // hard ceiling so a stuck pool can't hang a job forever

const keyState = new Map();

function ensurePool() {
  const keys = config.SHOPLIKE_API_KEYS;
  if (!keys || keys.length === 0) throw new Error('No SHOPLIKE_API_KEYS configured');
  for (const k of keys) {
    if (!keyState.has(k)) {
      // lastRotatedAt = 0 means "ready immediately on first use".
      keyState.set(k, { lastRotatedAt: 0, inUse: false });
    }
  }
  return keys;
}

function readyAt(state) {
  return state.lastRotatedAt + ROTATION_WINDOW_MS;
}

function pickReadyKey(keys, now) {
  let soonestBusyOrCooling = Infinity;
  for (const k of keys) {
    const s = keyState.get(k);
    if (s.inUse) continue;
    if (now >= readyAt(s)) return { key: k };
    if (readyAt(s) < soonestBusyOrCooling) soonestBusyOrCooling = readyAt(s);
  }
  return { key: null, retryAt: soonestBusyOrCooling };
}

async function acquireKey() {
  const keys = ensurePool();
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const now = Date.now();
    const pick = pickReadyKey(keys, now);
    if (pick.key) {
      keyState.get(pick.key).inUse = true;
      return pick.key;
    }
    // Wait for either a release or the next cooldown to elapse.
    const wait = Math.min(
      ACQUIRE_POLL_MS,
      Number.isFinite(pick.retryAt) ? Math.max(50, pick.retryAt - now) : ACQUIRE_POLL_MS
    );
    await sleep(wait);
  }
  throw new Error('Shoplike key pool: timed out waiting for an available key');
}

function releaseKey(key, { didRotate, nextChangeSeconds } = {}) {
  const s = keyState.get(key);
  if (!s) return;
  s.inUse = false;
  if (didRotate) {
    s.lastRotatedAt = Date.now();
  } else if (typeof nextChangeSeconds === 'number' && nextChangeSeconds > 0) {
    // Shoplike says we can rotate again in `nextChangeSeconds`. Anchor our
    // local cooldown to match that view.
    s.lastRotatedAt = Date.now() - (ROTATION_WINDOW_MS - nextChangeSeconds * 1000);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getNewProxy() {
  const key = await acquireKey();
  let body;
  try {
    body = await httpGetJson(`${BASE}/getNewProxy?access_token=${key}`);
  } catch (err) {
    releaseKey(key, { didRotate: false });
    throw err;
  }

  if (body.status === 'success') {
    releaseKey(key, { didRotate: true });
    return parseData(body.data);
  }

  // "Must wait N seconds" — rotation window hasn't elapsed; the key already has
  // a live IP, so reuse it via getCurrentProxy.
  if (body.nextChange !== undefined) {
    try {
      const proxy = await getCurrentProxy(key);
      releaseKey(key, { didRotate: false, nextChangeSeconds: Number(body.nextChange) });
      return proxy;
    } catch (err) {
      releaseKey(key, { didRotate: false, nextChangeSeconds: Number(body.nextChange) });
      throw err;
    }
  }

  releaseKey(key, { didRotate: false });
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
