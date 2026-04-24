const http = require('http');
const https = require('https');

const BASE = 'http://proxy.shoplike.vn/Api';

async function getNewProxy() {
  const key = process.env.SHOPLIKE_API_KEY;
  if (!key) throw new Error('SHOPLIKE_API_KEY not set');

  const body = await httpGetJson(`${BASE}/getNewProxy?access_token=${key}`);

  if (body.status === 'success') {
    return parseData(body.data);
  }

  if (body.nextChange !== undefined) {
    return getCurrentProxy();
  }

  throw new Error(`ShopLike getNewProxy error: ${body.mess || JSON.stringify(body)}`);
}

async function getCurrentProxy() {
  const key = process.env.SHOPLIKE_API_KEY;
  if (!key) throw new Error('SHOPLIKE_API_KEY not set');

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
