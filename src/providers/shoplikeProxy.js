const http = require('http');
const https = require('https');
const config = require('../config');

const BASE = 'http://proxy.shoplike.vn/Api';

// Key-selection strategy
// ----------------------
// Each Shoplike API key = one independent rotating IP slot. A key can only be
// rotated every `nextChange` seconds (~60s by default), so two callers hitting
// the same key in quick succession both share whatever IP is currently bound
// to that key — they cannot both get a "new" proxy.
//
// To maximise IP diversity across the worker pool we pin **one key per PM2
// worker process** using `NODE_APP_INSTANCE`, which PM2 cluster mode sets to a
// unique 0-based index per fork. With N keys and M workers:
//   - M <= N : every worker has its own key, so concurrent jobs across workers
//              always use distinct rotating IPs.
//   - M  > N : keys wrap (workers share keys) but each worker is still pinned
//              deterministically — two workers may share an IP, but a worker
//              never bounces between keys mid-job.
//
// Within a single worker, the in-process concurrency limit (MAX_CONCURRENT_JOBS)
// means up to 3 jobs may be running at once; they intentionally share the
// worker's single key (and therefore its current rotating IP) until the next
// rotation window opens. This is the documented Shoplike behaviour.
//
// Falls back to round-robin when NODE_APP_INSTANCE is unset (e.g. running the
// worker directly via `node src/workers/trafficWorker.js` outside PM2).
let rrIndex = 0;

function pickKey() {
  const keys = config.SHOPLIKE_API_KEYS;
  if (!keys || keys.length === 0) throw new Error('No SHOPLIKE_API_KEYS configured');

  const pmInstance = process.env.NODE_APP_INSTANCE;
  if (pmInstance !== undefined && pmInstance !== '') {
    const idx = parseInt(pmInstance, 10);
    if (Number.isInteger(idx) && idx >= 0) {
      return keys[idx % keys.length];
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
  let username = '';
  let password = '';
  if (data.auth && data.auth.includes(':')) {
    [username, password] = data.auth.split(':');
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
