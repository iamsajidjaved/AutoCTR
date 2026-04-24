Read every spec file in `specs/spec-*.md`. For each one, extract the exact `**Status:**` value from the file itself (do not trust the SPECS.md table — it may be stale).

Then output two things:

**1. Full status table**

| ID | Spec | Status | Depends On | Ready? |
|---|---|---|---|---|
| spec-01 | Project Setup | <status> | — | yes/no |
...

"Ready?" = yes if status is `not started` AND all dependencies are `complete`. Otherwise no.

**2. Action summary**

- **Do next:** spec-XX — <name> (lowest-numbered ready spec)
- **In progress:** list any `in progress` specs
- **Blocked:** list specs that are `not started` but have unmet dependencies, with which dependency is missing
- **Done:** count of `complete` specs out of 12

If all 12 are complete: "All specs complete. Project is fully implemented."

Run `/implement spec-XX` to build the next spec.
