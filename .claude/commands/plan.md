You are adding a new spec to the AutoCTR project. The feature to plan: $ARGUMENTS

**Step 1 — Understand the project**
Read `CLAUDE.md` and `specs/SPECS.md` to understand the existing spec structure and what's already planned.

**Step 2 — Determine spec ID**
Find the highest existing spec number in `specs/SPECS.md`. The new spec gets the next number (e.g., if spec-12 exists, create spec-13).

**Step 3 — Identify dependencies**
Based on what the feature needs, identify which existing specs must be complete before this one can be implemented. Reference specs by ID.

**Step 4 — Create the spec file**
Create `specs/spec-XX-<slug>.md` following this exact format:

```
# spec-XX — <Feature Name>

**Status:** not started
**Depends on:** spec-YY, spec-ZZ  (or: —)
**Blocks:** —

---

## Goal
One paragraph: what exists before this spec, what exists after. Be concrete.

---

## Files to Create/Modify
(list every file path with a ← comment explaining the role)

---

## Implementation Details
(function signatures, SQL, algorithms — enough detail that Claude can implement without guessing)

---

## Acceptance Criteria
- [ ] Each criterion is specific and testable
- [ ] Runtime-testable criteria are included
- [ ] Edge cases are called out explicitly
```

**Step 5 — Register the spec**
Add a row to the table in `specs/SPECS.md`:
`| spec-XX | <Feature Name> | not started | spec-YY |`

**Step 6 — Confirm**
Output: "Created spec-XX: <Feature Name>. Run `/spec spec-XX` to review it."
