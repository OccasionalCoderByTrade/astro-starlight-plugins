# 10: each page names its raw doc, and the page-action bar reads it

**What to build:** `astroServeDocsFiles` adds an Astro middleware (`order: "post"`) that, on Starlight's doc route only, reads `locals.starlightRoute.entry.filePath`, runs the served-file rule on its path relative to the docs directory and, when the raw doc is served, inserts `<link rel="alternate" type="text/markdown" href="...">` with the raw doc's root-absolute, URL-encoded source path before `</head>`. This happens on every such page, whether or not the page-action bar is enabled. The page-action bar's script reads that tag instead of guessing the URL with `HEAD` requests, and leaves the bar out when there's no tag. See ADR 0012 and the term page-action bar in `CONTEXT.md`.

Today's guess fails for non-slug paths (`reference/List Syntax cOp&&Y.md` at `/reference/list-syntax-copy/`) and for source doc extensions other than `.md`/`.mdx`, and the bar points at a 404 on pages whose raw doc isn't served.

**Blocked by:** 09 (the rule's dev/build modes)

**Status:** resolved

- [x] Doc route pages with a served raw doc get the link tag, in dev and in the build output, including a non-slug path and a `.markdown` (or other non-`.md`/`.mdx`) source doc
- [x] No tag on: drafts in a build, ignored docs, `src/pages` routes, the 404 page (custom `404.md` included), and a page whose frontmatter becomes unparseable mid-session in dev (no throw; the watcher already logs it)
- [x] The page script uses the tag's `href`, resolved against `location.origin` for "Copy raw URL" and the "Ask" prompts; no tag means no page-action bar; the `HEAD` guessing is gone
- [x] `validateOptions`' `ignorePatterns` throw is removed, along with its tests
- [x] `peerDependencies` `@astrojs/starlight` raised to `>=0.32.0` (no package version bump)
- [x] Tests for the middleware through its public surface (doc route vs other routes, served vs not served)
- [x] Browser check per CLAUDE.md: the bar on a non-slug page, no bar on an ignored doc's page, and the link tag in a built page
- [x] README: the link tag, when the bar is left out, the removed `ignorePatterns` error, the Starlight 0.32 requirement

`slug:` frontmatter overrides get the right tag as a side effect, since it comes from the entry, but they aren't a supported way of authoring: don't document or test them.

## Ideas, not in scope

- An `llms.txt` at the site root listing every served raw doc, for LLM discoverability.

## Comments

Done on branch `ticket-10-page-names-its-raw-doc` (off `dev`).

- Deviation in encoding: the `href` keeps reserved characters like `&` raw (HTML-escaped as `&amp;` in the attribute) and only encodes what `encodeURI` does, plus `?` and `#`. Astro decodes request paths with `decodeURI`, so `%26` 404s: `/reference/List%20Syntax%20cOp&&Y.md` is served and `/reference/List%20Syntax%20cOp%26%26Y.md` isn't.
- The middleware is `raw-doc-link.ts` (tested through `createRawDocLinkMiddleware`), shipped as the `plugins/astro-serve-docs-files/raw-doc-link-middleware` tsup entry. Like the existing `route`, `page-script` and `astro-local-links/dev-middleware` entries, it's reached by file URL, not a `package.json` export. It reads the same settings virtual module as the route, which now also carries `rootDirPath`, since `entry.filePath` is relative to the project root.
- `STARLIGHT_DOC_ROUTE` moved into `utils/starlight-selectors.ts`, since two plugins now use it.
- Browser check: the `.markdown` case is covered by unit tests only. This demo's Astro has no content entry type for `.markdown` ("No entry type found for reference/ext-test.markdown"), so Starlight renders no page for it.

Review fixes on branch `review-fixes-10`:

- New `CONTEXT.md` term **raw doc alternate link**, so *raw doc link* keeps meaning an `<a>`. The middleware is now `raw-doc-alternate-link.ts` (`createRawDocAlternateLinkMiddleware`), shipped as the `raw-doc-alternate-link-middleware` tsup entry. README says "page-action bar" instead of "`⋮` dropdown".
- The middleware reads `locals.starlightRoute` in a try/catch with optional chaining, so a user `src/pages/[...slug].astro` or a site without Starlight gets no link and no throw.
- The `href` is prefixed with Astro's `base` (`baseUrlPath` in the settings module, now typed `TServeDocsFilesModuleSettings` in the plugin's `utils.ts`). Checked in dev and preview with `base: "/docs"`.
- `?` and `#` in a name: Astro's `decodeURI` leaves `%3F`/`%23` encoded in `params.path`, so the route read `Why%3F %231.md` and failed with ENOENT (500 in dev, and the whole build failed). The served-file rule now leaves out any path segment holding `?` or `#`, so those files get a page but no raw doc and no raw doc alternate link.
- `.markdown` and the other extra extensions: Starlight 0.42's docs loader globs them, but Astro 7.4's markdown content entry type only registers `.md`, so they get no page. README corrected. Local Links still treats them as having a page path, which is a separate follow-up.
- Smells: `STARLIGHT_DOC_ROUTE` is in `utils/starlight-routes.ts` and imported directly, `serveDrafts` is required in `createServedFileRule`, `index.ts` dedupes its dir-path conversion, and the page script and middleware share the link's `rel`/`type` through `utils.ts`.
