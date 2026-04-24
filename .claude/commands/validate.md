You are validating the AutoCTR implementation. Check every spec marked `complete` and verify the code actually satisfies its acceptance criteria.

**Step 1 — Find implemented specs**
Read all `specs/spec-*.md` files. Collect specs where Status is `complete`.

**Step 2 — For each complete spec, spawn a focused sub-agent**
Use the Agent tool to launch one sub-agent per complete spec. Each sub-agent receives this prompt (fill in the spec ID and criteria):

---
Read `specs/<spec-id>.md`. Then read every file listed in "Files to Create/Modify".
For each acceptance criterion, give: criterion text | PASS / WARN / FAIL | one-line evidence.
Return a JSON-like summary: { specId, pass: N, warn: N, fail: N, failures: ["..."] }
---

Run all sub-agents in parallel for speed.

**Step 3 — Aggregate results**
Collect all sub-agent responses and output one consolidated report:

```
VALIDATION REPORT — AutoCTR
============================
spec-01  ✓  5/5 pass
spec-02  ✓  5/5 pass
spec-03  ⚠  4/5 pass, 1 needs runtime test
spec-04  ✗  3/5 pass, 2 FAIL
  - FAIL: [criterion text]
  - FAIL: [criterion text]

Total: X/Y criteria verified, Z need runtime testing, W failures
```

**Step 4 — Recommend fixes**
For each failing spec, output: "Run `/review <spec-id>` to get the detailed fix list."
