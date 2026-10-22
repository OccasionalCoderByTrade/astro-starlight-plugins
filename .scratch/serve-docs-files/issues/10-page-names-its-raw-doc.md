# 10: each page names its raw doc, and the page-action bar reads it

**What to build:** `astroServeDocsFiles` adds an Astro middleware (`order: "post"`) that, on Starlight's doc route only, reads `locals.starlightRoute.entry.filePath`, runs the served-file rule on its path relative to the docs directory and, when the raw doc is served, inserts `<link rel="alternate" type="text/markdown" href="...">` with the raw doc's root-absolute, URL-encoded source path before `</head>`. This happens on every such page, whether or not the page-action bar is enabled. The page-action bar's script reads that tag instead of guessing the URL with `HEAD` requests, and leaves the bar out when there's no tag. See ADR 0012 and the term page-action bar in `CONTEXT.md`.

Today's guess fails for non-slug paths (`reference/List Syntax cOp&&Y.md` at `/reference/list-syntax-copy/`) and for source doc extensions other than `.md`/`.mdx`, and the bar points at a 404 on pages whose raw doc isn't served.

**Blocked by:** 09 (the rule's dev/build modes)

**Status:** ready-for-agent

- [ ] Doc route pages with a served raw doc get the link tag, in dev and in the build output, including a non-slug path and a `.markdown` (or other non-`.md`/`.mdx`) source doc
- [ ] No tag on: drafts in a build, ignored docs, `src/pages` routes, the 404 page (custom `404.md` included), and a page whose frontmatter becomes unparseable mid-session in dev (no throw; the watcher already logs it)
- [ ] The page script uses the tag's `href`, resolved against `location.origin` for "Copy raw URL" and the "Ask" prompts; no tag means no page-action bar; the `HEAD` guessing is gone
- [ ] `validateOptions`' `ignorePatterns` throw is removed, along with its tests
- [ ] `peerDependencies` `@astrojs/starlight` raised to `>=0.32.0` (no package version bump)
- [ ] Tests for the middleware through its public surface (doc route vs other routes, served vs not served)
- [ ] Browser check per CLAUDE.md: the bar on a non-slug page, no bar on an ignored doc's page, and the link tag in a built page
- [ ] README: the link tag, when the bar is left out, the removed `ignorePatterns` error, the Starlight 0.32 requirement

`slug:` frontmatter overrides get the right tag as a side effect, since it comes from the entry, but they aren't a supported way of authoring: don't document or test them.

## Ideas, not in scope

- An `llms.txt` at the site root listing every served raw doc, for LLM discoverability.
