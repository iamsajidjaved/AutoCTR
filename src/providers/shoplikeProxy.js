const http = require('http');
const https = require('https');
const config = require('../config');

const BASE = 'http://proxy.shoplike.vn/Api';

// Round-robin index — rotates per process so concurrent jobs use different keys
let keyIndex = 0;

function nextKey() {
  const keys = config.SHOPLIKE_API_KEYS;
  if (!keys || keys.length === 0) throw new Error('No SHOPLIKE_API_KEYS configured');
  const key = keys[keyIndex % keys.length];
  keyIndex = (keyIndex + 1) % keys.length;
  return key;
}

async function getNewProxy() {
  const key = nextKey();

  const body = await httpGetJson(`${BASE}/getNewProxy?access_token=${key}`);

  if (body.status === 'success') {
    return parseData(body.data);
  }

  // "Must wait" — rotation window hasn't elapsed; fall back to current proxy for this key
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
