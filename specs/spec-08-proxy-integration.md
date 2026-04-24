# spec-08 — Proxy Integration

**Status:** complete
**Depends on:** spec-07
**Blocks:** spec-09

---

## Goal
Each job gets a real rotating IP assigned before launching Puppeteer. This spec wires in the first proxy provider (Shop Like Proxy) and establishes a multi-provider architecture so additional providers can be added later without touching Puppeteer code. The IP is stored in `traffic_details` after the job completes.

---

## Files to Create/Modify
```
src/
  services/
    proxyService.js          ← orchestrator: provider selection, fallback logic
  providers/
    shoplikeProxy.js         ← Shop Like Proxy API adapter
  utils/
    proxyParser.js           ← parses host:port and host:port + auth strings
```

---

## Provider: Shop Like Proxy

**Base URL:** `http://proxy.shoplike.vn/Api`

---

### Endpoint 1 — Get New Proxy
```
GET /Api/getNewProxy
  ?access_token=<SHOPLIKE_API_KEY>
  &location=<location_code>      (optional — omit for random)
  &provider=<VNPT|Viettel|FPT>   (optional — omit for random)
```

**Success:**
```json
{
  "status": "success",
  "data": {
    "location": "kh",
    "proxy": "171.213.50.88:5000",
    "auth": "",
    "nextChange": 60,
    "proxyTimeout": 1800
  }
}
```

**Error — key expired/invalid:**
```json
{ "status": "error", "mess": "Key khong ton tai hoac da het han" }
```

**Error — rotation window not elapsed yet (must wait):**
```json
{ "status": "error", "mess": "Con lai 57 giay de get proxy moi", "nextChange": 57, "proxyTimeout": 1800 }
```

---

### Endpoint 2 — Get Current Proxy
```
GET /Api/getCurrentProxy
  ?access_token=<SHOPLIKE_API_KEY>
```

**Has a proxy:**
```json
{
  "status": "success",
  "data": {
    "location": "hcm",
    "proxy": "171.167.112.132:5020",
    "auth": ""
  }
}
```

**No proxy assigned:**
```json
{ "status": "error", "mess": "Khong co proxy" }
```

---

### Endpoint 3 — List Locations (reference only)
```
GET https://proxy.shoplike.vn/Api/location
```
Returns location codes available as the `location` parameter for `getNewProxy`.

Available location codes: `bn`, `db`, `dn`, `hcm`, `hd`, `hd2`, `hd3`, `hn`, `hp`, `ht`, `hue`, `hy`, `kh`, `lc`, `nb`, `nd`, `qn`, `qnh`, `qt`, `tq`, `vp`, `yb`

---

### Response field notes
- `proxy`: `"host:port"` string
- `auth`: `""` when no credentials needed, or `"username:password"` when required
- `nextChange`: seconds until a new proxy can be requested
- `proxyTimeout`: total seconds the current proxy remains valid

---

## `src/providers/shoplikeProxy.js`

Strategy per job: **call `getNewProxy` first; if the rotation window hasn't elapsed (API returns "must wait"), call `getCurrentProxy` to get the already-assigned proxy.**

```js
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

  // "Must wait" — a proxy is already assigned, rotation window hasn't elapsed
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
```

---

## `src/services/proxyService.js`

```js
const shoplike = require('../providers/shoplikeProxy');

// Add additional providers to this array as they are integrated.
// Each provider must export { getNewProxy() } returning { host, port, username, password, url }.
const PROVIDERS = [shoplike];

async function getProxy() {
  let lastError;
  for (const provider of PROVIDERS) {
    try {
      return await provider.getNewProxy();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('All proxy providers failed');
}

module.exports = { getProxy };
```

---

## `src/utils/proxyParser.js`

Utility for any provider that returns a raw `host:port:user:pass` string instead of JSON.

```js
function parse(proxyString) {
  const parts = proxyString.split(':');
  if (parts.length < 2) throw new Error(`Invalid proxy string: ${proxyString}`);
  const [host, portStr, username = '', password = ''] = parts;
  const port = parseInt(portStr, 10);
  const url = username
    ? `http://${username}:${password}@${host}:${port}`
    : `http://${host}:${port}`;
  return { host, port, username, password, url };
}

module.exports = { parse };
```

---

## Wire Proxy into Puppeteer (modify spec-07 `puppeteerService.js`)

In `executeJob`, before launching the browser:

```js
const { getProxy } = require('../services/proxyService');

let proxy;
try {
  proxy = await getProxy();
} catch (err) {
  await updateStatus(job.id, 'failed', { errorMessage: 'proxy_unavailable' });
  return;
}

const browserArgs = [
  `--proxy-server=${proxy.host}:${proxy.port}`,
  '--no-sandbox',
  '--disable-setuid-sandbox',
  // existing stealth / extension args follow
];

// After page creation:
if (proxy.username) {
  await page.authenticate({ username: proxy.username, password: proxy.password });
}
```

Store the IP on completion:
```js
await updateStatus(job.id, 'completed', {
  ip: proxy.host,
  actualDwellSeconds,
  completedAt: new Date(),
});
```

---

## Environment Variables

Add to `.env` and `.env.example`:
```
SHOPLIKE_API_KEY=your_shoplike_access_token_here
```

---

## Proxy Failure Handling
- `getNewProxy` fails with "must wait" → automatically falls back to `getCurrentProxy`
- `getCurrentProxy` also fails (no proxy assigned) → provider throws → `proxyService` tries next provider
- All providers exhausted → job marked `failed` with `error_message = 'proxy_unavailable'`
- Browser never launches without a proxy — would expose the real IP

---

## Adding a Second Provider Later
1. Create `src/providers/newProvider.js` exporting `{ getNewProxy() }` returning the same `{ host, port, username, password, url }` shape
2. Append it to `PROVIDERS` in `proxyService.js`
3. Add its env var to `.env` and `.env.example`
No changes to Puppeteer code are needed.

---

## Acceptance Criteria
- [ ] `proxyService.getProxy()` calls `getNewProxy` on the Shop Like provider first
- [ ] When `getNewProxy` returns a "must wait" error, `getCurrentProxy` is called as fallback
- [ ] All Puppeteer sessions launch with `--proxy-server=host:port`
- [ ] `page.authenticate()` is called when `username` is non-empty
- [ ] Job `ip` field in DB stores the proxy host after completion
- [ ] If all providers fail, job is marked `failed` with `error_message = 'proxy_unavailable'`
- [ ] Browser never launches without a proxy configured
- [ ] Adding a second provider requires only a new file + one array entry in `proxyService.js`
