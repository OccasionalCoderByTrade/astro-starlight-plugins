## Conventions

- Never run `npm publish` or bump a version to the npm package this project implements. I will run those myself when I am ready.
- You should not merge any changes to main. Changes are made in `dev`, or otherwise in separate local feature branches if needed to then be merged to dev on completion.
- Run `npm run lib:build` as a sanity check before committing if the code has changed since the previous commit.

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

## Publishing

1. Bump `version` in `package.json` (or `npm version <patch|minor|major>`). // LLMs shouldn't bump or publish
2. `npm run lib:build`: compiles SCSS, runs tsup into `dist/`, copies `src/styles` to `dist/styles`.
3. `npm pack --dry-run`: check that only `dist/` (plus README, LICENSE, package.json) is included.
4. `npm publish`: `prepublishOnly` rebuilds the library first.

The demo site (`npm run app:build`) is not published -- it has no `outDir` set, so Astro also builds into `dist/`. `lib:build` wipes `dist/` first (tsup `clean: true`), so just rerun it after any site build before step 3.

## Agent skills

### Issue tracker

Local markdown under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical roles, recorded as the issue file's `Status:` value. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
