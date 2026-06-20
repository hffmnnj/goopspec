---
name: goop-accept
description: Verify work, confirm acceptance, and archive the milestone
agent: orchestrator
phase: accept
requires: execution_complete
next-step: "After acceptance, archive and start the next milestone with /goop-discuss"
next-command: /goop-discuss
alternatives:
  - command: /goop-execute
    when: "If verification finds issues to fix"
---

# /goop-accept

Run the verification-to-archive lifecycle. The milestone is not complete until the user explicitly accepts.

## Gate check

Call `goop_state({ action: "get" })`. If `allWavesComplete` is not `true` or blockers exist, return `BLOCKED` with:

> Run `/goop-execute` first.

## Load references

```
goop_reference({ name: "phase-gates" })
goop_reference({ name: "security-checklist" })
```

## Steps

1. Read `goop_read_db({ doc_types: ["spec", "blueprint"] })`.
2. Spawn `goop-verifier` to check must-have coverage, artifacts, key links, and quality.
3. Spawn `goop-tester` for test and build verification.
4. Present a verification matrix. Require explicit user acceptance.
5. **PR summary and merge offer** — enumerate all open PRs for this workflow. Run `gh pr list --json number,title,url,baseRefName` filtered to the workflow's wave branches. Present them as a numbered list in merge order (Wave 1 first): PR number, title, URL, and target base branch. Then ask in plain text (NOT the `question` tool):

   > All verifications passed. Want me to merge these PRs in order? (Yes / No — I'll do it myself)

   This is the one place lazy autopilot stops for a literal user reply, because merging is irreversible. Wait for the user's answer before proceeding.
6. On acceptance:
   - Copy workflow docs to `.goopspec/archive/<workflowId>-<timestamp>/`.
   - Verify the copy before deleting originals.
   - Generate `RETROSPECTIVE.md` and extract learnings to memory.
   - Optionally tag git.
   - Update `AGENTS.md` with verified learnings where appropriate.
7. On rejection or issues, return to `/goop-execute` or `/goop-amend`.

## Auto-merge sequence

If the user replies **Yes** to the merge offer:

1. **Merge in order** — for each PR in stack order (Wave 1 first): run `gh pr merge <number> --merge --delete-branch`. Default `--merge` preserves per-wave commit history; `--squash` is an option for a cleaner log.
2. **Confirm re-targeting** — after each merge, run `gh pr view <next-number> --json baseRefName` and confirm GitHub has re-targeted the next PR before proceeding to the next merge.
3. **Log each merge** — append a brief entry via `goop_append_chronicle` after each successful merge.
4. **Failure handling** — if any merge fails (conflict, CI failure, protected branch): stop immediately and report which PR failed and the reason. Leave all remaining PRs open. Never force-merge. Return to the user for resolution.
5. **Post-merge sync** — after all PRs are merged: run `git checkout main && git pull` to sync locally. Confirm the final commit is on `main` and report its hash. Remote branches are deleted via `--delete-branch`; do not delete local branches — that is the user's responsibility.

If the user replies **No**: acknowledge and remind them to merge in stack order (lowest PR number first).

## Anti-patterns

- Accept without verification.
- Archive before confirming the copy.
- Delete original workflow docs without logging each file.
- Force-merge or skip the re-target check between PRs in the merge sequence.
- Start the merge sequence without presenting the PR list and receiving an explicit yes.
