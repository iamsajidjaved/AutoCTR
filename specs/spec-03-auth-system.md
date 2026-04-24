# spec-03 — Authentication System (JWT)

**Status:** not started
**Depends on:** spec-02
**Blocks:** spec-04, spec-12

---

## Goal
Implement JWT-based register/login/me endpoints. After this spec, users can register, receive a JWT, and use it to access protected routes. All subsequent specs use the `authenticate` middleware from this spec.

---

## Files to Create/Modify
```
src/
  models/
    userModel.js
  services/
    authService.js
  controllers/
    authController.js
  middlewares/
    authenticate.js
  routes/
    auth.js
    index.js          ← mount /auth router here
```

---

## Implementation Details

### `src/models/userModel.js`
```js
findByEmail(email)        → user row or null
findById(id)              → user row or null
create({ email, passwordHash })  → new user row
```

### `src/services/authService.js`
```js
register({ email, password })
  → validate email format, password length >= 8
  → check email not already taken (409 if so)
  → bcrypt.hash(password, 12)
  → userModel.create(...)
  → return { user, token }  (token = signJwt(user.id))

login({ email, password })
  → find user by email (401 if not found)
  → bcrypt.compare (401 if mismatch)
  → return { user, token }

signJwt(userId)
  → jwt.sign({ sub: userId }, config.JWT_SECRET, { expiresIn: '7d' })
```

### `src/middlewares/authenticate.js`
- Read `Authorization: Bearer <token>` header
- Verify with `jwt.verify`
- Load user from DB by `sub`
- Attach to `req.user`
- Return 401 on any failure (no stack traces to client)

### Routes (`src/routes/auth.js`)
```
POST /api/auth/register  → { user: { id, email, role }, token }
POST /api/auth/login     → { user: { id, email, role }, token }
GET  /api/auth/me        → [authenticated] { user: { id, email, role } }
```

### Error Handling
- Never expose password_hash in any response — strip it at model layer
- Return consistent `{ error: "message" }` shape for all 4xx errors
- 400 for validation, 401 for bad credentials, 409 for duplicate email

---

## Acceptance Criteria
- [ ] `POST /api/auth/register` creates user, returns token
- [ ] Duplicate email returns 409
- [ ] `POST /api/auth/login` with correct creds returns token
- [ ] Wrong password returns 401
- [ ] `GET /api/auth/me` with valid token returns user
- [ ] `GET /api/auth/me` with no/invalid token returns 401
- [ ] `password_hash` never appears in any API response
