# AutoCTR — Claude Agents & Skills

All commands live in `.claude/commands/`. Type `/command-name [args]` in Claude Code.

---

## Workflow Commands

These orchestrate the spec-driven development process.

| Command | Args | What it does |
|---|---|---|
| `/progress` | — | Shows all 12 specs with live status, what's next, what's blocked |
| `/spec` | `spec-XX` | Displays spec in full + dependency readiness + which files exist |
| `/implement` | `spec-XX` | Reads spec, checks deps, writes all code, self-checks criteria, marks complete |
| `/review` | `spec-XX` | Reads implementation, evaluates each acceptance criterion, reports PASS/WARN/FAIL |
| `/plan` | `<description>` | Creates a new spec file from a feature description, assigns next ID, registers in SPECS.md |

**Typical loop:**
```
/progress          → see what's next
/spec spec-02      → read the spec before implementing
/implement spec-02 → build it
/review spec-02    → verify it
/progress          → move to next
```

---

## Domain Sub-Agents

These spawn a **fresh Claude instance** with deep, focused context for one layer of the stack. Use them when you have a question or task that lives entirely within one domain — the sub-agent won't get confused by unrelated parts of the codebase.

| Command | Args | Domain |
|---|---|---|
| `/db` | `<question or task>` | Database: schema, migrations, Neon queries, indexes |
| `/api` | `<question or task>` | Express API: routes, controllers, services, auth middleware |
| `/worker` | `<question or task>` | PM2 workers: polling, traffic distribution, scheduling, completion |
| `/browser` | `<question or task>` | Puppeteer: stealth, device profiles, on-site behavior, CAPTCHA |

**Examples:**
```
/db add a column retry_count to traffic_details
/api why does the activate endpoint return 409 unexpectedly
/worker the scheduler is clustering visits — fix the timestamp spacing
/browser the internal link navigation is following external redirects
```

Sub-agents read relevant spec files and existing implementation files, then answer or write code. They report back with what they changed and any caveats.

---

## Utility Commands

| Command | Args | What it does |
|---|---|---|
| `/scaffold` | `<type> <name>` | Generates boilerplate: `model user`, `service proxy`, `controller campaign`, `route auth`, `migration add_retry_count` |
| `/validate` | — | Spawns parallel sub-agents to check all `complete` specs against their acceptance criteria. Outputs a pass/fail report. |
| `/debug` | `<description>` | Maps issue to specs, reads relevant code, spawns investigation sub-agent, applies small fixes or gives action plan |

**Examples:**
```
/scaffold model trafficDetail
/scaffold migration add_retry_count_to_traffic_details
/validate
/debug worker claims jobs but never marks them completed
/debug puppeteer closes browser before dwell time finishes
```

---

## Sub-Agent Architecture

```
User → /db "add retry column"
         ↓
    Main Claude reads the /db command file
         ↓
    Spawns Agent tool with focused prompt containing:
    - Project DB conventions
    - Full schema summary
    - Relevant spec references
    - The user's request
         ↓
    Sub-agent reads spec-02, existing migration files
    Sub-agent writes the migration SQL
    Sub-agent reports back
         ↓
    Main Claude relays result to user
```

The sub-agent starts fresh — no conversation history — so the command file gives it all context it needs. This keeps each domain agent fast and focused.

---

## When to use what

| Situation | Use |
|---|---|
| Starting a new spec | `/progress` then `/implement spec-XX` |
| Checking if a spec was done right | `/review spec-XX` |
| Adding a column to the DB | `/db add column X to table Y` |
| Fixing a Puppeteer bug | `/browser <bug description>` |
| Adding a new API endpoint | `/api add endpoint for X` |
| Worker isn't picking up jobs | `/debug worker not picking up jobs` |
| Adding a brand new feature | `/plan <feature description>` |
| Getting a quick file skeleton | `/scaffold service myFeature` |
| Checking overall project health | `/validate` |
