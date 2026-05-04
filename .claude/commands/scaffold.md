Generate boilerplate for the AutoCTR project. Arguments: $ARGUMENTS

Parse arguments as: `<type> <name>` (e.g., `model campaign`, `service proxy`, `route auth`, `migration add_column`)

**Project conventions to follow:**
- `model <name>` → create `shared/models/<name>Model.js` with async functions using `{ sql }` from `shared/models/db.js`. Export named functions, no class.
- `service <name>` → create `shared/services/<name>Service.js`. Import relevant model(s). Export named async functions. No Express objects — pure logic only.
- `controller <name>` → create `src/controllers/<name>Controller.js`. Import relevant service. Each export is an async Express handler `(req, res, next)`. Thin: validate input, call service, send response. No DB calls.
- `route <name>` → create `src/routes/<name>.js`. Import controller and `authenticate` middleware. Export an Express Router. Add a mount line to `src/routes/index.js`.
- `migration <description>` → create `shared/migrations/NNN_<description>.sql` where NNN is the next migration number (check existing files). Write idempotent SQL using `IF NOT EXISTS` or `IF EXISTS`.

**For each type, generate:**
1. The file with correct structure and placeholder functions/exports
2. A reminder of what the spec says should go in that file (if relevant)
3. Any import statements that are always needed

Keep placeholders as `// TODO: implement` with the function name — don't invent logic.

After creating the file(s), output: "Created <path>. Next: fill in the logic per the spec."
