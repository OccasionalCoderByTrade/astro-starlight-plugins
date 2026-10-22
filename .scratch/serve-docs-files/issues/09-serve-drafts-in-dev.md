# 09: serve drafts in dev

**What to build:** The served-file rule serves drafts in dev and leaves them out of builds, the same way Starlight renders draft pages in dev and drops them from builds. `createServedFileRule` takes a `serveDrafts` option. `astroServeDocsFiles` sets it from `command === "dev"` in `astro:config:setup` and passes it to the route module through the virtual settings module. The `servedFileRule` it exposes (field and `astro-serve-docs-files:served-file-rule` hook) is fixed to that mode, so `astroLocalLinks` dev validation follows without changes. See the spec (`../spec.md`, story 10 revised) and ADR 0011.

**Blocked by:** none

**Status:** resolved

- [x] Dev: a draft raw doc is listed by `getStaticPaths` and served; a raw doc link to it passes dev link validation
- [x] Build: drafts are still left out of the endpoint, and a raw doc link to one still fails
- [x] `_`/`.`-prefixed files, `ignorePatterns` and unparseable frontmatter behave as before in both modes
- [x] In dev, a draft that clashes with a `public/` file fails startup (the build doesn't serve it, so it passes there)
- [x] Tests through the integration's hooks and the route module, using the existing helpers
- [x] README `astroServeDocsFiles` section says drafts are served in dev only

## Comments

Done on branch `ticket-09-serve-drafts-in-dev`. `serveDrafts` defaults to `false` in `createServedFileRule` and is required in the route settings. Unparseable frontmatter still throws when drafts are served, so dev keeps failing at startup on it. `astroLocalLinks` needed no code change. Its dev test fake now builds its rule with `serveDrafts: true` to match dev, and the "rejects a draft raw doc" dev case became an accepted link. The README's Local Links section and its `public/` collision note also say drafts differ between dev and build.
