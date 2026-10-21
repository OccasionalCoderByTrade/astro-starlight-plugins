Status: ready-for-agent

# astro-local-links: support source docs with non-slug paths

See ADR 0009 (`docs/adr/0009-file-form-links-are-accepted-and-rewritten-to-page-paths.md`) and the Local links terms in `CONTEXT.md` (page path, non-slug path, file-form link, page-form link).

## Problem Statement

A source doc can have a non-slug path, such as `reference/List Syntax cOp&&Y.md`. Starlight serves it at its page path, `/reference/list-syntax-copy/`, but `astroLocalLinks` assumes every page path is literally a source doc path. The result is:

- The page itself can't be matched to its source doc, so link validation or link normalization throws "No source doc" and fails the build. In dev, the page shows an error instead.
- A page-form link to the doc (`/reference/list-syntax-copy/`) is reported broken, even though it works in the browser.
- A file-form link to the doc (`./List%20Syntax%20cOp%26%26Y`) passes link validation, and the author's editor can follow it. But link normalization rewrites it to `/reference/List Syntax cOp&&Y`, which 404s in the browser.
- The same thing happens when a folder name is a non-slug path segment (`My Guide/intro.md`).

That leaves the author choosing between links their editor can follow and links that work on the site.

## Solution

`astroLocalLinks` knows the page path of every source doc, computed the way Astro does by default. Pages from non-slug docs resolve to their source doc. Link validation accepts a link to a source doc if it is exactly its page-form link or exactly its file-form link. Link normalization rewrites file-form links to page-form links, so authors write links their editor can follow and readers get working URLs. Two source docs that share a page path are an error. There is no warning about non-slug paths themselves; the README recommends slug filenames.

## User Stories

1. As a docs author, I want a source doc with spaces, capitals or punctuation in its filename to build without errors, so that I'm not forced to rename imported or vault-style files.
2. As a docs author, I want a source doc inside a folder with a non-slug name (`My Guide/intro.md`) to build without errors, so that folder names follow the same rules as filenames.
3. As a docs author, I want to link to a non-slug doc by its file path, URL-encoded if needed, so that my editor can follow the link to the file.
4. As a docs author, I want a file-form link to pass link validation when the source doc exists, so that I get the same checking as for any other link.
5. As a docs author, I want link normalization to rewrite my file-form link to the page path, so that readers following it don't hit a 404.
6. As a docs author, I want root-absolute file-form links (`/reference/List%20Syntax`) rewritten too, not only relative ones, so that both styles work.
7. As a docs author, I want the rewritten link to keep my `?query` and `#fragment`, so that deep links still land on the right heading.
8. As a docs author, I want the rewritten link to keep my trailing slash or lack of one, so that normalization changes only what it has to.
9. As a docs author, I want the rewritten link percent-encoded where needed (for example Unicode letters that slugging keeps), so that the href is a valid URL.
10. As a docs author, I want to link to a non-slug doc by its page path (`/reference/list-syntax-copy/`), so that I can write the URL readers actually see.
11. As a docs author, I want a page-form link to a non-slug doc to pass link validation, so that a correct link isn't reported broken.
12. As a docs author, I want a link that only matches after slugifying it (`/reference/LIST-syntax-COPY`) reported as broken, so that I don't publish a link that 404s on a case-sensitive host.
13. As a docs author with link normalization turned off, I want a file-form link reported as broken, with a reason that names the page path, so that I know to link to the page path or turn normalization on.
14. As a docs author, I want `skipPatterns` to skip a file-form link when a pattern matches either its file form or its page path, so that my patterns work however I wrote the link.
15. As a docs author, I want source docs with any extension Starlight loads (`.markdown`, `.mdown`, `.mkdn`, `.mkd`, `.mdwn`, as well as `.md` and `.mdx`) to resolve, so that link validation agrees with what Starlight renders.
16. As a docs author, I want `_`-prefixed files ignored as source docs, so that link validation agrees with Starlight, which doesn't render them.
17. As a docs author, I want draft docs treated as source docs like any other, so that this change doesn't alter how drafts are handled.
18. As a docs author, I want two source docs with the same page path (`Foo.md` and `foo.md`, `a b.md` and `a-b.md`, or `x.md` and `x/index.md`) to fail the build before any page is processed, with both files named, so that I find out which one to rename.
19. As a docs author running dev, I want a collision to error only the pages it affects (the colliding page and pages linking to it), so that the rest of the site stays usable while I fix it.
20. As a docs author running dev, I want a source doc I create or rename while the server runs to be picked up on the next request, so that I don't have to restart dev.
21. As a docs author, I want `Index.md` treated like `index.md` (served at its folder's page path), so that capitalisation doesn't change where a page lives.
22. As a docs author, I want dots in a filename (`v1.2-notes.md`) handled the way Astro handles them (`/v12-notes/`), so that link validation agrees with the served URL.
23. As a docs author, I want the README to explain how non-slug paths work and to recommend slug filenames, so that I know both link forms work and why renaming is still simpler.
24. As a docs author, I want the README to say that frontmatter `slug` and a custom `docsLoader({ generateId })` aren't supported, so that I'm not surprised when those pages fail.
25. As a docs author using pnpm or Yarn PnP, I want the plugin's slugging dependency declared, so that it resolves in a strict package layout.
26. As a maintainer, I want the page paths computed with the same slugger Astro uses, so that they don't drift from what Starlight serves.

## Implementation Decisions

- **Source doc index**: `astroLocalLinks` builds an index from page path to source doc(s), by scanning the docs dir with Starlight's docs glob (every docs extension, `_`-prefixed files excluded, drafts included). A page path is each path segment, extension removed, run through github-slugger's `slug()`, joined with `/`, with a trailing `/index` dropped. That mirrors Astro's default glob loader ID.
- **Index lifetime**: build constructs the index once. Dev rebuilds it on every request the middleware handles, keeping today's behaviour of reading the disk on each request, without watcher invalidation. The index isn't part of the serialized settings the dev middleware reads from its virtual module.
- **Collisions**: a page path with more than one source doc is a collision. In build it throws before any page is processed, listing every collision and its files. In dev it errors only the requests whose own page, or a link target, is a colliding page path. This replaces the existing `x.md` / `x/index.md` ambiguity check, which becomes one case of a collision.
- **Page resolution**: finding a page's source doc looks up the page path in the index, replacing the current literal-path lookup. "No source doc" stays an error.
- **Link validation**: a local link to a doc is valid if its resolved, decoded path is exactly a page path in the index (page form), or exactly a source doc's path without its extension, or its folder for an `index` doc (file form). Matches that need slugifying are broken. With link normalization off, a file-form link whose page path differs from its file path is broken, and the reason names the page path. Links to files in `public/` are checked as before.
- **skipPatterns**: a file-form link is skipped if any pattern matches either its file-form site path or its page path (each with the fragment, as today).
- **Link normalization**: unchanged for page-form links (relative ones become root-absolute). File-form links, relative or root-absolute, are rewritten to the `encodeURI`'d page path. The author's trailing slash or lack of one and the `?query#fragment` suffix are kept. Link normalization's glossary entry already covers this.
- **No non-slug path warning.** See ADR 0009.
- **Dependency**: `github-slugger@^2.0.0` becomes a declared runtime dependency, matching the version Astro uses. `remark-gfm-slug` already imports it without declaring it.
- **Public API**: `AstroLocalLinksOptions` doesn't change. Exported helpers whose signatures change are internal to the plugin and not re-exported from the root.
- **Docs**: the README Local Links section gets a "Non-slug filenames" subsection covering both link forms, normalize's rewrite, the slug-filename recommendation, collisions, and the unsupported `slug` / `generateId` cases.
- **Demo**: add `reference/List Syntax cOp&&Y.md` to the demo site, linked from another reference doc in both forms.

## Testing Decisions

- Tests go through the plugin's existing seams and assert on externally visible behaviour: the HTML that comes back, the hrefs in it, and the errors thrown and what they say. They don't assert on the index's shape or on helper calls.
- **Seam 1, dev middleware (`createOnRequest`)**, the main seam: non-slug page resolution (filename and folder), page-form and file-form validation, fuzzy-match rejection, normalize rewriting (relative and absolute, `encodeURI`, trailing slash, `?#` kept), normalize off reporting with the page path in the reason, `skipPatterns` matching either form, non-md extensions, `_`-prefixed exclusion, `Index.md` and dotted names, a file added between two requests being picked up, and a collision erroring only the affected pages.
- **Seam 2, `astroLocalLinks` `astro:build:done`**: a collision fails before any page is processed, naming both files, and a non-slug page listed in `assets` resolves and is normalized.
- **Slugger parity**: one test asserts that the github-slugger resolved from Astro's package has the same major version as ours, so a split between us and Astro is caught. Astro's `getContentEntryIdAndSlug` can't be imported directly, because Astro's `exports` blocks the deep path.
- Prior art: `on-request.test.ts` and `index.test.ts` (fake hooks, `makeSite` + `pageHtml` from `test-site.ts`). The existing `processPage` / `resolveSourceDoc` tests stay; the ambiguity tests move to seams 1 and 2 as collision tests.
- Work test-first (red, green, refactor) at these seams.
- Browser check after the tests pass: load the demo doc and the doc that links to it in dev and in a build preview, follow both links, and check the console.

## Out of Scope

- Frontmatter `slug`, and a custom `docsLoader({ generateId })`.
- Links that include the extension (`./foo.md`).
- Links to draft docs passing validation in build, where Starlight doesn't render them (existing behaviour).
- Validating `#fragment`s.
- Any warning about non-slug paths.
- Astro's `base` (already rejected at setup).

## Further Notes

- Facts checked against github-slugger 2.0.0: `List Syntax cOp&&Y` → `list-syntax-copy`, `v1.2-notes` → `v12-notes`, `Index` → `index`, `café` → `café`, `a b` and `a-b` → `a-b`, `Foo_Bar` → `foo_bar`.
- Relative links keep resolving against the source doc's folder on disk, as today. A page-form relative link from a doc in a non-slug folder (`../my-guide/other` from `My Guide/intro.md`) then resolves to the page path, and a file-form one (`./other`) resolves to the file path. Both are handled by the rules above.
- Run `npm run lib:build` before committing. Don't bump the version or publish.
