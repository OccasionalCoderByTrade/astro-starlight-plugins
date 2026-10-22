# 09: serve drafts in dev

**What to build:** The served-file rule serves drafts in dev and leaves them out of builds, the same way Starlight renders draft pages in dev and drops them from builds. `createServedFileRule` takes a `serveDrafts` option. `astroServeDocsFiles` sets it from `command === "dev"` in `astro:config:setup` and passes it to the route module through the virtual settings module. The `servedFileRule` it exposes (field and `astro-serve-docs-files:served-file-rule` hook) is fixed to that mode, so `astroLocalLinks` dev validation follows without changes. See the spec (`../spec.md`, story 10 revised) and ADR 0011.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] Dev: a draft raw doc is listed by `getStaticPaths` and served; a raw doc link to it passes dev link validation
- [ ] Build: drafts are still left out of the endpoint, and a raw doc link to one still fails
- [ ] `_`/`.`-prefixed files, `ignorePatterns` and unparseable frontmatter behave as before in both modes
- [ ] In dev, a draft that clashes with a `public/` file fails startup (the build doesn't serve it, so it passes there)
- [ ] Tests through the integration's hooks and the route module, using the existing helpers
- [ ] README `astroServeDocsFiles` section says drafts are served in dev only
