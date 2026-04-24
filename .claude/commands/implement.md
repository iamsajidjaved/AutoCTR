You are implementing a single spec for the AutoCTR project (Google CTR simulation tool: Node.js + Neon PostgreSQL + PM2 workers + Puppeteer).

Spec to implement: `specs/$ARGUMENTS.md`

**Step 1 — Read before touching anything**
Read `specs/$ARGUMENTS.md` in full. Then read every file listed under "Files to Create/Modify" that already exists on disk. Do not skip this — the spec may be adding to existing files.

**Step 2 — Check dependencies**
Look at the "Depends on" field. For each listed spec, read its Status line. If any dependency is `not started` or `in progress`, stop immediately and tell me:
> "Blocked: spec-XX must be complete first."
Do not write a single line of code until all dependencies are `complete`.

**Step 3 — Implement**
Build every file listed in the spec's "Files to Create/Modify" section:
- Match function signatures and return shapes exactly as written in the spec
- Use the folder structure from CLAUDE.md (`models/` for queries, `services/` for logic, `controllers/` for thin handlers, `workers/` for PM2 processes)
- Write zero comments unless the spec explicitly includes them
- Do not add features, abstractions, or error handling beyond what the spec describes
- If the spec says "stub" for something, write exactly that stub — do not implement the real version

**Step 4 — Self-check**
After writing all files, read each one back. For every acceptance criterion in the spec, write a one-line verdict:
- `✓ met` — criterion is satisfied by the code as written
- `⚠ needs manual test` — criterion requires running the app (e.g., "server starts", "endpoint returns 200")
- `✗ missed` — criterion is not satisfied — fix it before marking complete

Only mark the spec complete if there are zero `✗ missed` items.

**Step 5 — Update status**
Edit `specs/$ARGUMENTS.md`: change `**Status:** not started` to `**Status:** complete`
Edit `specs/SPECS.md`: find the matching row and change `not started` to `complete`
