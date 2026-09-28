## Conventions

- Never run `npm publish` on my behalf. Don't even ask me if you can run it. I will run it myself when I am ready.
- Never run git commands that change repo state (commit, push, reset, checkout, branch, etc.) without asking first. Read-only git commands (status, log, diff, show) are fine to run freely.

If updating a plugin, or creating a new plugin, make sure to also update README.md in the root of this project to reflect the changes.

## Layout

```
src/
├── index.ts          # root export; every plugin is re-exported here
├── plugins/          # one plugin per child dir or .ts file; plugins never import each other
│   ├── utils/        # code shared by 2+ plugins
│   └── tests/        # test harnesses, not a plugin
├── content/          # demo/docs site, not shipped
├── middleware.ts     # demo site
└── styles/           # copied to dist/styles on lib:build (shipped as ./styles export)
tsup.config.ts        # build entries, kept in sync with package.json exports
dist/                 # lib build output; app:build also writes here
```

- A plugin's exported API is public; changing it is a breaking change. Plugins may also have their own subpath export.
- New or renamed plugin: update the `tsup.config.ts` `entry`, `package.json` `exports`, `src/index.ts` and `README.md` together.
- Only move code into `utils/` once 2+ plugins need it. Plugin-specific helpers stay in that plugin's `utils.ts`.

## Agent skills

### Issue tracker

Local markdown under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical roles, recorded as the issue file's `Status:` value. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
