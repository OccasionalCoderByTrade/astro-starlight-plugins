# 07: Fail on served path collisions with other routes, reported once

**What to build:** A build fails when the endpoint and any other route (a Starlight page, a `src/pages` route, another integration's route) write the same output file. Examples: an extensionless `reference/bar` next to `reference/bar.md`, a `reference/index.html` next to `reference/index.md`, or a docs `zap/index.html` next to `src/pages/zap.astro`. Astro on its own only warns about some of these and misses the rest; a prototype run found it dropping a Starlight page with only a warning, and silently replacing a `src/pages` page. The plugin reads Astro's `assets` map in `astro:build:done`, so it works for every `build.format` without predicting output paths. With both plugins installed, `astroLocalLinks`'s shadowed doc check stops counting the endpoint as the route serving a source doc, so the clash is reported once, by this error, and not also as a misleading shadowed doc naming `/[...path]`. See the spec (`../spec.md`), ADR 0011 and **Served path collision** / **Shadowed doc** in `CONTEXT.md`.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] `astro:build:done` fails, listing every output file the endpoint shares with another route and naming both routes
- [ ] Passes when nothing is shared (test with a fake `assets` map)
- [ ] `astroLocalLinks` recognises the serve plugin's endpoint (by the route it injects) and leaves it out of the shadowed doc check; real shadowed docs (e.g. a `src/pages` page at a doc's page path) are still reported
- [ ] Checked in a real build: a stray `index.html` and an extensionless file next to a source doc each fail the build with this error only
- [ ] Neither plugin imports the other
