# 01: Report shadowed docs in `astro build`

**What to build:** `astro dev` errors on a shadowed doc (a `src/pages` page at a source doc's page path), but `astro build` doesn't: the doc route just never writes that page, so nothing checks it. `astro:build:done` could compare the source doc index against the files each route wrote in `assets`, and fail on any page path that a route other than the doc route served, naming the source doc and that route. See **Doc route** and **Shadowed doc** in `CONTEXT.md`.

**Blocked by:** None (can start immediately)

**Status:** needs-triage

Open questions:

- Drafts are in the source doc index but Starlight writes no page for them in build. Only a page path another route actually wrote should count, so drafts with no output shouldn't fire.
- Astro may already warn about the route conflict in build. Check that first, since that may be enough.
