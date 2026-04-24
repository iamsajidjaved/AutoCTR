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

**Base URL:** `https://proxy.shoplike.vn/Api`

> The API now serves a **301 redirect from HTTP → HTTPS**, and Node's raw
> `http.get` does not follow redirects. The provider must call the HTTPS URL
> directly, otherwise the response body is the 301 HTML page and JSON parsing
> fails ("non-JSON response").

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
    "location": "tb",
    "proxy": "171.245.24.19:13994",
    "auth": { "ip_address": "", "account": "" },
    "nextChange": 300,
    "proxyTimeout": 1800
  }
}
```

> **`auth` field shape changed.** The Postman documentation example shows
> `"auth": ""` (empty string) or `"auth": "user:pass"`. Production responses
> now return an **object** `{ ip_address, account }` where `account` is the
> username and the corresponding password is delivered out-of-band on the
> Shoplike dashboard. Empty strings on both fields mean the proxy is
> IP-whitelisted (no per-request credentials needed). The provider must accept
> both shapes — calling `data.auth.includes(':')` blindly throws on the object
> form and is the root cause of repeated `proxy_unavailable` errors.

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
- `auth`: either `""` / `"username:password"` (legacy) **or** `{ ip_address, account, ... }` (current). Empty fields = no auth.
- `nextChange`: seconds until a new proxy can be requested (currently ~300s in production)
- `proxyTimeout`: total seconds the current proxy remains valid

---

### `src/providers/shoplikeProxy.js`

Strategy: **strict 1:1 mapping between PM2 workers and API keys**. Each PM2
worker is pinned for life to exactly one key via `NODE_APP_INSTANCE` (the
unique 0-based fork index PM2 cluster mode sets). The number of `ctr-worker`
instances is driven by the configured key count in `ecosystem.config.js`, so
adding a key to `.env` automatically scales the pool by one.

Why strict 1:1 (no wrapping)? A single Shoplike key is gated server-side by
`nextChange` (~60s rotation window) — two callers hitting the same key in
rapid succession share whatever IP is currently bound to it. If two PM2
workers shared a key they would also share an IP, defeating the purpose of
running multiple workers. The provider therefore **throws on first proxy
request** if a worker's instance index has no corresponding key, rather than
silently degrading.

Inside a single worker, `MAX_CONCURRENT_JOBS = 3` jobs share that worker's
single key (and its current IP) until the next rotation window opens — this
matches Shoplike's documented per-key rotation gating.

When `NODE_APP_INSTANCE` is unset (e.g. running the worker directly via
`node src/workers/trafficWorker.js` outside PM2), the picker falls back to a
process-local round-robin counter so dev mode still works.

```js
let rrIndex = 0;

function pickKey() {
  const keys = config.SHOPLIKE_API_KEYS;
  if (!keys || keys.length === 0) throw new Error('No SHOPLIKE_API_KEYS configured');

  const pmInstance = process.env.NODE_APP_INSTANCE;
  if (pmInstance !== undefined && pmInstance !== '') {
    const idx = parseInt(pmInstance, 10);
    if (Number.isInteger(idx) && idx >= 0) {
      if (idx >= keys.length) {
        throw new Error(
          `PM2 worker instance ${idx} has no Shoplike key (only ${keys.length} key(s) configured). ` +
          `Add another key to SHOPLIKE_API_KEYS or reduce ctr-worker instances in ecosystem.config.js.`
        );
      }
      return keys[idx];           // pinned: worker idx ↔ keys[idx]
    }
  }

  const key = keys[rrIndex % keys.length];   // dev fallback only
  rrIndex = (rrIndex + 1) % keys.length;
  return key;
}

async function getNewProxy() {
  const key = pickKey();
  // call getNewProxy with this key
  // if response includes nextChange ("must wait"), call getCurrentProxy(key) as fallback
}
```

### `ecosystem.config.js`

Worker count is derived from the key count so the 1:1 invariant cannot drift:

```js
require('dotenv').config();
const SHOPLIKE_KEY_COUNT = (process.env.SHOPLIKE_API_KEYS || '')
  .split(',').map(k => k.trim()).filter(Boolean).length;

if (SHOPLIKE_KEY_COUNT === 0) {
  throw new Error('SHOPLIKE_API_KEYS must contain at least one key — workers cannot start.');
}

module.exports = {
  apps: [
    { name: 'ctr-api',    script: './src/server.js',                instances: 1 },
    {
      name: 'ctr-worker',
      script: './src/workers/trafficWorker.js',
      instances: SHOPLIKE_KEY_COUNT,    // <-- pinned to key count
      exec_mode: 'cluster',
    },
  ],
};
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
