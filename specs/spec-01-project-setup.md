# spec-01 — Project Setup & Folder Structure

**Status:** complete
**Depends on:** —
**Blocks:** spec-02, spec-03, spec-04, spec-05, spec-06, spec-07, spec-08, spec-09, spec-10, spec-11, spec-12

---

## Goal
Initialize the Node.js project with the correct folder structure, dependencies, environment config, and PM2 ecosystem file. After this spec, the project skeleton runs and `npm start` boots an Express server that responds to `GET /health`.

---

## Files to Create
```
package.json
.env.example
.gitignore
ecosystem.config.js
src/
  config/
    index.js          ← centralizes all env var access
  routes/
    index.js          ← mounts all routers
  app.js              ← Express app setup (no listen)
  server.js           ← calls app.listen
  workers/
    .gitkeep
  controllers/
    .gitkeep
  services/
    .gitkeep
  models/
    .gitkeep
  utils/
    .gitkeep
```

---

## Dependencies to Install
```bash
npm init -y
npm install express @neondatabase/serverless dotenv jsonwebtoken bcryptjs uuid cors helmet morgan
npm install --save-dev nodemon
```

---

## Implementation Details

### `src/config/index.js`
Export a frozen config object reading from `process.env`. Every other file imports from here — never `process.env` directly elsewhere.

Required env vars:
- `DATABASE_URL` — Neon connection string
- `JWT_SECRET` — minimum 32 chars
- `PORT` — defaults to 3000
- `NODE_ENV` — development / production
- `PROXY_API_KEY` — for proxy rotation (can be empty for now)
- `REKTCAPTCHA_PATH` — path to unpacked RektCaptcha extension directory (can be empty for now)

Throw a startup error if `DATABASE_URL` or `JWT_SECRET` is missing.

### `src/app.js`
- `helmet()` for security headers
- `cors()` configured for `FRONTEND_URL` env var
- `express.json()`
- `morgan('combined')` for request logging
- Mount `/api` router from `src/routes/index.js`
- `GET /health` → `{ status: 'ok', timestamp: new Date() }`
- 404 handler
- Global error handler (log + `{ error: message }` JSON)

### `ecosystem.config.js`
```js
module.exports = {
  apps: [
    {
      name: 'ctr-api',
      script: './src/server.js',
      instances: 1,
      env: { NODE_ENV: 'development' }
    },
    {
      name: 'ctr-worker',
      script: './src/workers/trafficWorker.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: { NODE_ENV: 'production' }
    }
  ]
};
```
Note: `trafficWorker.js` is created in spec-06. PM2 will error if you start it before that spec — that's expected.

### `.env.example`
```
DATABASE_URL=postgres://...
JWT_SECRET=change_me_to_at_least_32_chars
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:3001
PROXY_API_KEY=
REKTCAPTCHA_PATH=./extensions/rektcaptcha
```

### `.gitignore`
Node standard + `.env` + `extensions/`

---

## Acceptance Criteria
- [ ] `npm install` completes with no errors
- [ ] Copy `.env.example` to `.env`, fill in `DATABASE_URL` and `JWT_SECRET`
- [ ] `node src/server.js` starts without crashing
- [ ] `GET http://localhost:3000/health` returns `{ "status": "ok" }`
- [ ] Unknown routes return 404 JSON (not HTML)
