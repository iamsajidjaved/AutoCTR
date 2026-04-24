You are debugging an issue in the AutoCTR project. Issue description: $ARGUMENTS

**Step 1 — Map the issue to specs**
Read `CLAUDE.md` and `specs/SPECS.md`. Based on the issue description, identify which spec(s) own the relevant code (e.g., "worker not picking up jobs" → spec-06; "browser crash" → spec-07; "wrong visit counts" → spec-05).

**Step 2 — Read the spec and the implementation**
For each relevant spec:
1. Read the spec file to understand the intended behavior
2. Read every implementation file listed in that spec
3. Note any divergence between spec and implementation

**Step 3 — Investigate**
Spawn a sub-agent using the Agent tool with this focused prompt:

---
You are debugging an issue in AutoCTR (Node.js CTR simulation tool). 
Issue: <issue from $ARGUMENTS>
Relevant files: <list files you found>

Read each file and look for:
1. Logic that contradicts the spec's intended behavior
2. Missing error handling for this failure mode
3. Race conditions or async bugs
4. Environment/config issues (missing env vars, wrong defaults)

Report: root cause hypothesis, the specific line(s) involved, and the exact fix.
---

**Step 4 — Fix or recommend**
If the bug is clear and the fix is small (< 20 lines), apply it directly and explain what changed.
If the fix requires deeper changes, output a numbered action plan:
1. What to change and where
2. Which spec to re-read for correct behavior
3. Whether to run `/review <spec-id>` after fixing
