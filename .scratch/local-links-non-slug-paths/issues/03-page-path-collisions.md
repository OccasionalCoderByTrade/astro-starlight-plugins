# 03: Page path collisions are errors

**What to build:** When two source docs share a page path, the author gets one clear error naming every file involved, so they know which to rename. This covers `Foo.md` + `foo.md`, `a b.md` + `a-b.md`, and `x.md` + `x/index.md`. In build, the error comes before any page is processed. In dev, only the affected pages error, so the rest of the site stays usable. This replaces the existing `x.md` / `x/index.md` ambiguity check. See the spec (`../spec.md`) and ADR 0009.

**Blocked by:** 01 (Pages from non-slug docs resolve)

**Status:** ready-for-agent

- [ ] Build fails before any page is processed, listing every colliding page path and all of its source docs
- [ ] In dev, a request errors only when its own page, or one of its link targets, has a colliding page path; other pages render normally
- [ ] The old `x.md` + `x/index.md` ambiguity check is gone, and that case is reported as a collision; its existing tests move to the dev middleware and `astro:build:done` seams
- [ ] Tests written first, through the dev middleware seam and `astro:build:done`
- [ ] `npm run lib:build` passes; committed to the current branch
