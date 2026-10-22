# 01: Report shadowed docs in `astro build`

**What to build:** `astro dev` errors on a shadowed doc (a `src/pages` page at a source doc's page path), but `astro build` doesn't: the doc route just never writes that page, so nothing checks it. `astro:build:done` could compare the source doc index against the files each route wrote in `assets`, and fail on any page path that a route other than the doc route served, naming the source doc and that route. See **Doc route** and **Shadowed doc** in `CONTEXT.md`.

**Blocked by:** None (can start immediately)

**Status:** resolved

Decisions:

- Astro already logs a `PrerenderRouteConflict` warning in build (`prerenderConflictBehavior`, default `'warn'`), but it doesn't name the source doc and it doesn't fail the build. Dev throws, and ADR-0008 says per-page faults fail at `astro:build:done`, so `astroLocalLinks` adds its own check. The README mentions Astro's warning, and that with `'error'` Astro fails first.
- The check throws whatever `prerenderConflictBehavior` is set to, `'ignore'` included. To serve a page in place of a doc, delete the doc or `_`-prefix it.
- Every URL in `assets` from a route other than the doc route and `/404` counts: pages, endpoints, `redirects`, i18n fallbacks. `.html` files map to page paths like `toPagePathname`; other files are compared as they are.
- Drafts count. The source doc index doesn't know about drafts, so a draft only fires when another route actually wrote its page path. That matches dev, which renders drafts.
- One error lists every shadowed doc (page path, source docs, shadowing route), reusing `formatShadowedDocError`'s wording in a counted list like `formatPagePathCollisionsError`. It's thrown right after the page path collision check, before link processing.
- Dev matches build: the middleware runs the shadow check before its `!response.ok` and non-HTML early returns, so redirects and endpoints at a doc's page path throw too. Error responses (4xx/5xx) are still skipped.
- Same gate as now: the check runs whenever `validate` or `normalize` is on.
