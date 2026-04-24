Read `specs/$ARGUMENTS.md` and display its full contents.

After the spec content, append this analysis:

---
**Dependency check**
For each spec listed under "Depends on", read that spec file and report its current Status. Then state one of:
- "Ready to implement — all dependencies are complete."
- "Blocked by: spec-XX (status: <status>)" — list each unmet dependency.

**Files that already exist**
Check each path listed under "Files to Create/Modify". For each one, report whether it exists on disk already. This tells you which files will be created fresh vs modified.

**Tip:** Run `/implement $ARGUMENTS` to build this spec.
