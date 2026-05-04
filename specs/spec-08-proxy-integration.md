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

Strategy: **cooldown-aware shared key pool (N keys : M workers).** PM2 worker
count is sized to host CPU cores (`WORKER_CONCURRENCY`), independent of how
many Shoplike keys are configured. All workers in a single Node process share
an in-process pool of keys; for each job, the pool hands out a key whose ~60s
rotation window has elapsed, marks it in-use, and releases it after the proxy
call returns.

Why a pool? A single Shoplike key is gated server-side by `nextChange` (~60s
rotation window). Two callers hitting the same key in rapid succession share
whatever IP is currently bound to it. With a cooldown-aware pool, the worker
delays a job for a few seconds rather than reusing an IP — preserving CTR
diversity without forcing a 1:1 worker:key mapping.

The pool is **per worker process**. Cross-worker coordination is not
implemented; Shoplike's server-side rotation gate is the ultimate source of
truth, so the worst cross-worker race is two impressions sharing one IP within
the 60s window. If true cross-worker coordination is needed later, promote the
pool into a `proxy_keys` DB table with `claimed_by_worker` + `last_rotated_at`
columns and use the same `FOR UPDATE SKIP LOCKED` pattern as `traffic_details`.

Sketch:

```js
const ROTATION_WINDOW_MS = 60_000;
const keyState = new Map();          // key -> { lastRotatedAt, inUse }

async function acquireKey() {
  // wait until some key has !inUse && now - lastRotatedAt >= ROTATION_WINDOW_MS
  // mark it inUse and return
}

function releaseKey(key, { didRotate, nextChangeSeconds }) {
  // clear inUse; update lastRotatedAt to match Shoplike's view
}

async function getNewProxy() {
  const key = await acquireKey();
  try {
    const body = await callShoplikeGetNewProxy(key);
    if (body.status === 'success') {
      releaseKey(key, { didRotate: true });
      return parseData(body.data);
    }
    if (body.nextChange !== undefined) {
      const proxy = await getCurrentProxy(key);
      releaseKey(key, { didRotate: false, nextChangeSeconds: Number(body.nextChange) });
      return proxy;
    }
    releaseKey(key, { didRotate: false });
    throw new Error(body.mess);
  } catch (err) {
    releaseKey(key, { didRotate: false });
    throw err;
  }
}
```

### `ecosystem.config.js`

Worker count tracks CPU cores (`WORKER_CONCURRENCY`), no longer keys:

```js
const os = require('os');
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY, 10) || os.cpus().length;

module.exports = {
  apps: [
    { name: 'ctr-api',    script: './src/server.js', instances: 1 },
    {
      name: 'ctr-worker',
      script: './src/workers/trafficWorker.js',
      instances: WORKER_CONCURRENCY,    // bounded by host CPU
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

Multiple keys broaden the IP pool: each worker runs one job at a time and the cooldown-aware pool avoids handing out a key whose 60s rotation window hasn't elapsed, so distinct keys yield distinct IPs across consecutive jobs. With fewer keys than workers, jobs may briefly wait on `acquireKey()` until a key is rotation-ready.

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
- [ ] Multiple concurrent jobs use different keys from the pool (cooldown-aware: a key is not reissued until its 60s rotation window has elapsed)
- [ ] All Puppeteer sessions launch with `--proxy-server=host:port`
- [ ] `page.authenticate()` is called when `username` is non-empty
- [ ] Job `ip` field in DB stores the proxy host after completion
- [ ] If all providers fail, job is marked `failed` with `error_message = 'proxy_unavailable'`
- [ ] Browser never launches without a proxy configured
- [ ] Adding a second provider requires only a new file + one array entry in `proxyService.js`
- [ ] Removing a key from `SHOPLIKE_API_KEYS` takes effect on next worker restart (no code change needed)
