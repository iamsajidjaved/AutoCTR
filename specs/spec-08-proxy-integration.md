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

### `src/providers/shoplikeProxy.js`

Strategy: maintains a **round-robin key pool** across all concurrent jobs in the process. Each call to `getNewProxy()` picks the next key from `SHOPLIKE_API_KEYS`, rotating through the full pool. This ensures concurrent jobs use different keys and therefore receive different IPs from the API.

```js
// keyIndex rotates per-process: job 1 → key[0], job 2 → key[1], job 3 → key[2], etc.
let keyIndex = 0;

function nextKey() {
  const keys = config.SHOPLIKE_API_KEYS;  // parsed from comma-separated env var
  if (!keys || keys.length === 0) throw new Error('No SHOPLIKE_API_KEYS configured');
  const key = keys[keyIndex % keys.length];
  keyIndex = (keyIndex + 1) % keys.length;
  return key;
}

async function getNewProxy() {
  const key = nextKey();
  // call getNewProxy with this key
  // if "must wait", call getCurrentProxy(key) as fallback
}
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

Add to `.env`:
```
# Comma-separated list of Shoplike API keys (one key = one IP at a time)
# Add more keys to allow more simultaneous unique IPs across concurrent workers
SHOPLIKE_API_KEYS=key1,key2,key3,...
```

Multiple keys enable parallel unique IPs: with 17 keys and 3 concurrent jobs per worker instance, each job gets a distinct IP. Round-robin rotation is used per process (`keyIndex` increments on each call).

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
- [ ] When `getNewProxy` returns a "must wait" error, `getCurrentProxy` is called as fallback for the same key
- [ ] Multiple concurrent jobs use different keys from the pool (round-robin rotation)
- [ ] All Puppeteer sessions launch with `--proxy-server=host:port`
- [ ] `page.authenticate()` is called when `username` is non-empty
- [ ] Job `ip` field in DB stores the proxy host after completion
- [ ] If all providers fail, job is marked `failed` with `error_message = 'proxy_unavailable'`
- [ ] Browser never launches without a proxy configured
- [ ] Adding a second provider requires only a new file + one array entry in `proxyService.js`
- [ ] Removing a key from `SHOPLIKE_API_KEYS` takes effect on next worker restart (no code change needed)
