## Conventions

- Never run `npm publish` or bump a version to the npm package this project implements. I will run those myself when I am ready.
- You should not merge any changes to main. Changes are made in `dev`, or otherwise in separate local feature branches if needed to then be merged to dev on completion.
- Run `npm run lib:build` as a sanity check before committing if the code has changed since the previous commit.
- Be mindful when developing plugins for Starlight to handle md(x) content files more delicately based on their frontmatter `draft`, `sidebar.hidden`, or filename `**/[^_]*.{md,mdx}` semantics (plus `.mdoc` if Markdoc is installed). The `_` rule only applies to filenames, not folders (eg. `_partials/x.md` still becomes a page).
- File paths in console output and error messages go through `toDisplayPath` (`src/plugins/utils/display-path.ts`): root-relative with `/` separators, absolute when outside the project root. Never relative to `process.cwd()`, which differs under `astro --root`; `src/plugins/tests/working-dir-drift.test.ts` checks this. Option values the user wrote are echoed verbatim.
- Most plugins will be Astro plugins, but they may not necessarily be intended to work as standalone Astro plugins, since they will assume conventions or implement details that rely on Starlight semantics.

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
└── styles/           # shared SCSS: partials, design tokens, shared components, opt-in stylesheets
scripts/build-styles.ts # compiles every non-partial .scss under src/plugins and src/styles into dist/
tsup.config.ts        # build entries, kept in sync with package.json exports
dist/                 # lib build output; app:build also writes here
```

- A plugin's exported API is public; changing it is a breaking change. Every plugin must have its own subpath export (`./<name>` in `package.json` matching the `plugins/<name>` tsup entry), see `docs/adr/0013-every-plugin-has-a-subpath-export.md`. Internal sibling modules (page scripts, middleware, routes) get a tsup entry but no export. `src/plugins/tests/subpath-export-drift.test.ts` checks this.
- New or renamed plugin: update the `tsup.config.ts` `entry`, `package.json` `exports`, `src/index.ts` and `README.md` together.
- Only move code into `utils/` once 2+ plugins need it. Plugin-specific helpers stay in that plugin's `utils.ts`.
- Plugins ship their own styles (`docs/adr/0015-plugins-ship-their-own-compiled-styles.md`): SCSS next to the plugin, wrapped in `mixins.plugin-layer`, imported with `injectScript("page-ssr", pluginStylesImportScript([...]))`. Styles move to `src/styles/components/` only once 2+ plugins emit the class. A plugin never uses a class from an opt-in stylesheet or another plugin; `src/plugins/tests/borrowed-class-drift.test.ts` checks this.

## Verifying in a browser

When a change affects rendered output or dev-mode behaviour (sidebar, LaTeX, link validation, HMR), check it in a browser. Skip this for type, build-config or test-only changes.

- Use a browser MCP (e.g. Playwright) if one is available. Otherwise fall back to `curl` and the build output.
- Dev: run `npx astro dev status` first. If a server is already running, reuse it and leave it running. Otherwise start `npm run app:dev -- --background` (port 5600) and stop it with `npx astro dev stop` before ending the turn.
- Build-only behaviour (e.g. content-layer caching): `npm run app:build`, then `npx astro preview --port 5600 --background`. If a dev server is still on 5600, use `--port 5601` instead. Stop with `npx astro preview stop`.
- A check means loading the affected pages, reading the accessibility snapshot, and checking the console for errors and warnings. Take screenshots only for layout or styling changes.

## Publishing

1. Bump `version` in `package.json` (or `npm version <patch|minor|major>`). // LLMs shouldn't bump or publish
2. `npm run lib:build`: generates the Bootstrap utilities partial, runs tsup into `dist/`, then compiles the shipped SCSS into `dist/` as CSS.
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
