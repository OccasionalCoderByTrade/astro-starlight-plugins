# Publishing

1. Bump `version` in `package.json` (or `npm version <patch|minor|major>`).
2. `npm run lib:build`: compiles SCSS, runs tsup into `dist/`, copies `src/styles` to `dist/styles`.
3. `npm pack --dry-run`: check that only `dist/` (plus README, LICENSE, package.json) is included.
4. `npm publish`: `prepublishOnly` rebuilds the library first.

The demo site (`npm run app:build`) is not published. It has no `outDir` set, so Astro also builds into `dist/`. `lib:build` wipes `dist/` first (tsup `clean: true`), so just rerun it after any site build before step 3.
