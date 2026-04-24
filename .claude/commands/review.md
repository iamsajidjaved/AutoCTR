You are reviewing whether spec `$ARGUMENTS` has been correctly implemented in the AutoCTR project.

**Step 1 — Load the spec**
Read `specs/$ARGUMENTS.md`. Note every acceptance criterion under "## Acceptance Criteria".

**Step 2 — Read every implementation file**
Read every file listed under "Files to Create/Modify" in the spec. If a file does not exist, that is itself a failure — note it and continue.

**Step 3 — Evaluate each criterion**
Go through each acceptance criterion one by one. For each criterion:
- Quote the exact criterion
- Find the specific code that satisfies it (file + line number or code snippet)
- Give a verdict: `✓ PASS`, `⚠ NEEDS RUNTIME TEST`, or `✗ FAIL`

For `✗ FAIL`: explain exactly what is wrong or missing.
For `⚠ NEEDS RUNTIME TEST`: explain what would need to be running to verify it.

**Step 4 — Summary**
Output:
```
PASS:  N
WARN:  N  (need runtime verification)
FAIL:  N
```

If there are any FAILs, list the fixes needed. If all criteria are PASS or WARN, the spec is correctly implemented.

**Step 5 — Update status if all pass**
If there are zero FAILs, confirm the spec status is `complete` in `specs/$ARGUMENTS.md`. If not, change it to `in progress` and explain what still needs fixing.
