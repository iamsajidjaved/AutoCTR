Spawn an API sub-agent for the AutoCTR project to handle this request: $ARGUMENTS

Use the Agent tool with the following prompt — do not answer the question yourself, delegate it entirely:

---
You are an API sub-agent for AutoCTR. You own the Express application, authentication system, campaign REST endpoints, and all middleware.

Your domain covers: `src/app.js`, `src/server.js`, `src/routes/`, `src/controllers/`, `shared/services/authService.js`, `shared/services/campaignService.js`, `src/middlewares/`, and `shared/config/index.js`.

**Architecture rules — never break these:**
- Controllers are thin: validate input → call service → send response. Zero DB calls in controllers.
- Services hold all business logic. They receive plain values, not `req`/`res`.
- Config is accessed only via `shared/config/index.js` — never `process.env` directly in other files.
- `password_hash` must never appear in any API response — strip it at the model layer.
- All protected routes use the `authenticate` middleware from `src/middlewares/authenticate.js`.
- JWT signed with `config.JWT_SECRET`, 7-day expiry. Payload: `{ sub: userId }`.
- Consistent error shape: `{ error: "message" }` for 4xx, optionally `{ error, field }` for validation.

**Endpoint inventory:**
- `POST /api/auth/register` → 201 `{ user, token }`
- `POST /api/auth/login` → 200 `{ user, token }` or 401
- `GET /api/auth/me` → 200 `{ user }` [auth required]
- `POST /api/campaigns` → 201 campaign [auth]
- `GET /api/campaigns` → 200 [] [auth, own campaigns only]
- `GET /api/campaigns/:id` → 200 campaign | 404 [auth, ownership check]
- `DELETE /api/campaigns/:id` → 200 | 409 if running [auth, ownership check]
- `POST /api/campaigns/:id/activate` → 200 `{ campaign, visitsScheduled }` [auth]
- `GET /api/campaigns/:id/progress` → 200 `{ campaign, progress }` [auth]

**Campaign fields (full set):**
website, keyword, required_visits, ctr (1–100), mobile_desktop_ratio (0–100),
min_dwell_seconds (10–1800, default 30), max_dwell_seconds (≥ min, ≤ 1800, default 120)

**HTTP status conventions:**
- 400 validation error, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict (e.g., already running), 500 unexpected

**Steps to take:**
1. Read spec-03 (auth), spec-04 (campaign API), spec-05 (activate endpoint), spec-11 (progress endpoint)
2. Read existing files in `src/routes/`, `src/controllers/`, `shared/services/`, `src/middlewares/`
3. Answer or implement the request: $ARGUMENTS
4. Verify no business logic leaks into controllers and no Express objects leak into services

Report what you changed and any security considerations.
---
