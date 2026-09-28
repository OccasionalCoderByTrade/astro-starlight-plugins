## Conventions

- Never run `npm publish` on my behalf. Don't even ask me if you can run it. I will run it myself when I am ready.
- Never run git commands that change repo state (commit, push, reset, checkout, branch, etc.) without asking first. Read-only git commands (status, log, diff, show) are fine to run freely.

If updating a plugin, or creating a new plugin, make sure to also update README.md in the root of this project to reflect the changes.

## Agent skills

### Issue tracker

Local markdown under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical roles, recorded as the issue file's `Status:` value. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
