Status: resolved

# starlightIndexSourcedSidebar: bring it in line with the rest of the plugins

See ADR 0013 (every plugin has its own subpath export), ADR 0008 (startup faults fail dev and build), ADR 0007 (link validation runs on final HTML) and ADR 0012 (raw docs keep their source path). Terms used here are defined in `CONTEXT.md`: sidebar index, index entry, sub-index link, leaf index, hidden from sidebar, source doc, page path, file-form link, page-form link.

Origin: a code review of the plugin (no spec existed, so the README and JSDoc stood in for one), followed by a grilling session that settled every decision below. The plugin is being prepared for the 4.0.0 release, so breaking changes are allowed.

## Problem Statement

`starlightIndexSourcedSidebar` was written before the project had conventions, and it shows:

- It can only be imported from the package root, so it drags in every other plugin's dependencies, including the optional peers `@astrojs/starlight` and `@expressive-code/core`. `expressiveCodeEmphasis` has the same problem the other way round: it has a build entry but no export.
- The README and JSDoc describe `indexMarker` as a string prepended to the label, but it's a `{ text, variant }` badge. `collapsed` isn't documented at all.
- `.mdoc` source docs are ignored, even when Markdoc is installed.
- A link to a `_`-prefixed file becomes a sidebar entry for a page Starlight never renders, which then fails startup with an unclear error.
- Entry slugs are the raw file path, so `My Page.md` gets a slug Starlight doesn't know, and a `slug:` frontmatter override is ignored.
- `pagefind: false` hides a page from the sidebar, although in Starlight it only keeps the page out of search. The sibling `starlightIndexOnlySidebar` doesn't do this.
- Starlight's own `sidebar.label` and `sidebar.badge` frontmatter are ignored.
- Whether a sub-index expands depends on its file extension: `index.md` expands, `index.mdx` becomes a single entry. Renaming a file silently changes the sidebar.
- Folder links (`./sub/`), root-absolute links (`/guides/setup`) and percent-encoded links (`./my%20page`) are dropped silently, and `tel:` or other `scheme:` links are treated as relative paths.
- Missing link targets are dropped silently, so a typo in a sidebar index goes unnoticed.
- A directory linked from two sidebar indexes appears only under the first.
- The docs root is hardcoded as `./src/content/docs` relative to the working directory, so a site with a custom `srcDir` breaks, and the tests only pass through a fallback that hides the real slug logic.
- Options aren't validated. A missing directory gets a misleading "no index" error.
- `maxDepthNesting` is documented as "root is level 0", which hides what the number means.
- The code duplicates helpers from `starlightIndexOnlySidebar`, uses terse names, takes long positional parameter lists, reads each sidebar index twice, and has an unused type and an unsafe cast.

## Solution

`starlightIndexSourcedSidebar` gets its own subpath export, reads the docs root from Astro's config, and follows the same file semantics as the other plugins: every source doc extension, the `_` filename rule, and hidden from sidebar meaning `draft` or `sidebar.hidden`, in dev and in build. Entries point at the source doc's real page path and use Starlight's sidebar frontmatter for their labels and badges. A sub-index link expands into a nested group whatever the sidebar index's extension, unless the target opts out as a leaf index. More link forms are understood, and links that point at nothing produce a warning instead of vanishing. Bad options and missing directories fail startup with clear errors.

`starlightIndexOnlySidebar` shares the helpers and picks up the same semantics where they apply. The option `maxDepthNesting` becomes `maxGroupLevels` in both plugins. The exports rule from ADR 0013 is applied to every plugin and guarded by a test.

## User Stories

### Packaging

1. As a site author, I want to import `starlightIndexSourcedSidebar` from its own subpath, so that my config doesn't load other plugins' dependencies.
2. As a site author without `@expressive-code/core` installed, I want importing a sidebar plugin to work, so that I don't have to install peers for plugins I don't use.
3. As a site author, I want to import `expressiveCodeEmphasis` from its own subpath, so that it works like every other plugin.
4. As a site author, I want the README examples to show the subpath import, so that I copy the safe form.
5. As a maintainer, I want a test that fails when a plugin's build entry and package export don't match, so that a new plugin can't ship half-wired.
6. As a maintainer, I want internal sibling modules (page scripts, middleware, routes) to stay out of the package exports, so that they don't become public API.
7. As a maintainer, I want CLAUDE.md to say every plugin must have a subpath export, so that agents follow ADR 0013.

### Docs root and options

8. As a site author with a custom `srcDir`, I want the plugin to find my docs under `srcDir`, so that the sidebar builds without depending on the working directory.
9. As a site author, I want a `directories` entry that doesn't exist to fail startup with a "directory not found" error, so that I can tell it apart from a missing sidebar index.
10. As a site author, I want a `directories` entry that resolves outside the docs root (`../x`) to fail startup, so that the plugin never reads files Starlight doesn't render.
11. As a site author, I want the same directory listed twice to fail startup, so that I don't get a duplicated sidebar by accident.
12. As a site author, I want a directory whose sidebar index is missing to fail startup, and the README to say so, so that the failure isn't a surprise.
13. As a site author, I want `maxGroupLevels` to mean "at most N levels of groups, the root group included", so that `1` reads as "only the root group".
14. As a site author, I want leaving `maxGroupLevels` unset to mean unlimited nesting, so that I don't have to pick a large number.
15. As a site author, I want a `maxGroupLevels` that isn't an integer of at least 1 to fail startup, so that a typo doesn't produce an odd sidebar.
16. As a site author upgrading from 3.x, I want the README to list the renamed option and every other breaking change, so that I can migrate.
17. As a site author, I want `indexMarker` documented as a `{ text, variant }` badge, so that the docs match what the plugin accepts.
18. As a site author, I want `collapsed` documented with its default of `true`, so that I know groups start collapsed.

### Which source docs count

19. As a site author with Markdoc installed, I want `.mdoc` sidebar indexes and pages to work like `.md` and `.mdx`, so that every source doc extension is treated the same.
20. As a site author without Markdoc, I want `.mdoc` files to be treated as non-source-doc files, so that the plugin matches what Starlight renders.
21. As a site author, I want a link to a `_`-prefixed file to be left out of the sidebar with a warning, so that I don't get an entry for a page that doesn't exist.
22. As a site author, I want a `_`-prefixed folder to still count (`_partials/x.md` is a page), so that the `_` rule matches Astro's, which only applies to filenames.
23. As a site author, I want a page with `draft: true` to be hidden from sidebar in dev and in build, so that the dev sidebar shows what the built site will show.
24. As a site author, I want a page with `sidebar.hidden: true` to be hidden from sidebar, so that Starlight's own flag works.
25. As a site author, I want `pagefind: false` to only affect search, so that hiding a page from search doesn't also remove it from navigation.
26. As a site author, I want a sidebar index that's hidden from sidebar to take its whole group with it, so that hiding a section is one frontmatter change.
27. As a site author, I want a hidden root sidebar index to drop its root group without an error, so that I can hide a whole section the same way.

### Sub-index links and leaf indexes

28. As a site author, I want a sub-index link to `index.md`, `index.mdx` or `index.mdoc` to expand into a nested group, so that the extension doesn't change the sidebar.
29. As a site author, I want to mark a sidebar index as a leaf index with `indexSourcedSidebar: { leaf: true }` in its frontmatter, so that a landing page full of components shows as a single entry instead of driving navigation.
30. As a site author, I want a leaf index's entry to carry the index marker, so that it still looks like an index.
31. As a site author, I want the leaf key to be ignored on a root sidebar index, so that a listed directory always expands.
32. As a site author, I want `./sub/` to work as a sub-index link to `sub/index.*`, so that I can link folders the way I'm used to.
33. As a site author, I want `./sub/` to warn when `sub/` has no sidebar index, rather than falling back to `sub.md`, so that page-form links aren't half-supported.
34. As a site author upgrading from 3.x, I want the README to say that `index.mdx` sub-indexes now expand, and how to keep the old behaviour with the leaf key, so that my sidebar doesn't change unexpectedly.
35. As a site author, I want groups past `maxGroupLevels` to be flattened into their parent, so that deep trees stay readable.

### Links

36. As a site author, I want relative file-form links (`./page`, `./page.md`) to keep working, so that links my editor can follow are also sidebar entries.
37. As a site author, I want root-absolute links (`/guides/setup`) resolved against the docs root, so that I can link from anywhere in the tree.
38. As a site author on a site with a `base`, I want a root-absolute link that starts with `base` to have it stripped first, so that links I wrote to work on the site also work in the sidebar.
39. As a site author, I want percent-encoded links (`./my%20page`) decoded, so that links to files with spaces work.
40. As a site author, I want links with any URL scheme (`https:`, `mailto:`, `tel:`, `ftp:`) and protocol-relative links treated as external and skipped, so that they're never mistaken for files.
41. As a site author, I want same-page anchors (`#section`) skipped, and query strings and anchors stripped from page links, so that `./page#intro` still points at the page.
42. As a site author, I want reference-style links (`[Setup][setup]`) to count, so that I can keep a long index tidy.
43. As a site author, I want the README to say that JSX and HTML links (`<Card href>`, `<a>`) don't count, so that I know why an MDX component's link is missing.
44. As a site author, I want page-form links (`./my-page/` for `My Page.md`) documented as unsupported, so that I write file-form links instead.
45. As a site author, I want links to non-source-doc files (PDFs, images) that exist skipped without a warning, so that an index can link to attachments.
46. As a site author, I want a link to a missing file to log a warning that names the sidebar index and the link, so that I catch typos.
47. As a site author who also uses `astroLocalLinks`, I want broken links to keep failing there and only warn here, so that link validation stays in one place.

### Slugs, labels and badges

48. As a site author, I want each entry's slug to be the source doc's page path, with each segment slugified the way Starlight does, so that `My Page.md` links to `/my-page/`.
49. As a site author, I want a `slug:` frontmatter override honoured, so that Starlight doesn't fail on an unknown slug.
50. As a site author, I want entries for pages and index entries labelled `sidebar.label`, then `title`, then the filename, so that Starlight's sidebar frontmatter works here too.
51. As a site author, I want a page's `sidebar.badge` shown on its entry, so that Starlight's badges work here too.
52. As a site author, I want the index marker to win over `sidebar.badge` on index entries, so that every index looks the same.
53. As a site author, I want groups labelled from their directory name as before, so that upgrading doesn't change my group labels.

### Duplicates and cycles

54. As a site author, I want a directory or page linked from two sidebar indexes to appear under both, so that the sidebar follows what I wrote.
55. As a site author, I want the same link written twice in one sidebar index to give two entries, so that the plugin never second-guesses the author.
56. As a site author, I want a sub-index link back to an ancestor sidebar index to be skipped with a warning, so that a loop can't hang startup.

### starlightIndexOnlySidebar

57. As a site author using `starlightIndexOnlySidebar`, I want the same `.mdoc`, `_` filename, hidden from sidebar and docs-root rules, so that both sidebar plugins agree.
58. As a site author using `starlightIndexOnlySidebar`, I want its slugs to be page paths with `slug:` honoured, so that non-slug paths work there too.
59. As a site author using `starlightIndexOnlySidebar` with `dirnameDeterminesLabels: false`, I want labels from `sidebar.label`, then `title`, so that it matches the other plugin.
60. As a site author using `starlightIndexOnlySidebar`, I want `sidebar.badge` shown on its page entries, so that badges work there too.
61. As a site author using `starlightIndexOnlySidebar`, I want `maxDepthNesting` renamed to `maxGroupLevels` with the same meaning and validation, so that both plugins share one option name.
62. As a site author using `starlightIndexOnlySidebar`, I want the same startup errors for bad `directories` entries, so that both plugins fail the same way.

### Maintainers

63. As a maintainer, I want the helpers both sidebar plugins need in the shared utils, so that they can't drift apart.
64. As a maintainer, I want the page-path logic from `astroLocalLinks` in the shared utils, so that the sidebars and link validation agree on page paths.
65. As a maintainer, I want tests that run the plugin's `config:setup` hook the way Starlight does, so that they cover what users see, not internals.

## Implementation Decisions

### Exports (ADR 0013)

- Every plugin has a build entry and a matching package export. Add both for `starlightIndexSourcedSidebar`, and add the missing export for `expressiveCodeEmphasis`.
- Internal sibling modules that a plugin loads by URL keep a build entry with no export.
- A test reads the build config and the package exports and checks that the two lists match one-to-one, apart from internal sibling modules.
- CLAUDE.md changes "Plugins may also have their own subpath export" to say every plugin must have one, and points at ADR 0013.
- The README shows the subpath import in each plugin's usage example.

### Shared utils

These move into the shared utils because both sidebar plugins need them, and plugins never import each other:
- the label-from-path-segment helper
- slug normalization (dropping a trailing `/index`)
- finding a directory's sidebar index, for every source doc extension
- the sidebar item types
- the hidden from sidebar check
- the `_` filename check

The page-path logic in `astroLocalLinks` moves to the shared utils too, and both sidebar plugins use it. It turns a docs-relative source doc path into a page path by slugifying each segment. `astroLocalLinks` behaves the same afterwards.

### Docs root and command context

- Both sidebar plugins read the docs root from Astro's `srcDir` in the `config:setup` hook (`content/docs/` under it), as `astroLocalLinks` and `astroServeDocsFiles` do. The cwd-relative constant goes away.
- The source doc extensions come from the existing helper that reads `astroConfig.integrations`, so `.mdoc` counts only when Markdoc is installed.
- `astroConfig.base` is passed down so root-absolute links can have it stripped.
- Warnings go through the logger that Starlight passes to `config:setup`.

### Options

- The public options are `directories` (required), `maxGroupLevels` (optional, unset means unlimited), `indexMarker` (optional `{ text, variant }`), `collapsed` (optional, default `true`) and `linkScope` (optional, `"anywhere"` or `"below"`, default `"anywhere"`).
- `linkScope: "below"` keeps only links inside the linking sidebar index's own directory. Any other link is skipped with a warning. `"anywhere"` keeps links to anywhere in the docs root. `starlightIndexOnlySidebar` doesn't read links, so it doesn't get this option. `maxDepthNesting` is removed with no alias. `starlightIndexOnlySidebar` renames its option the same way and keeps `dirnameDeterminesLabels`.
- `maxGroupLevels` counts levels of groups with the root group included. `1` means everything is flat under the root group. A sub-index link whose group would go past the limit has its entries flattened into the parent group.
- These fail startup with a message naming the plugin and the bad value:
  - a `directories` entry that resolves outside the docs root
  - a `directories` entry that doesn't exist ("directory not found")
  - a directory listed twice
  - a `maxGroupLevels` that isn't an integer of at least 1
  - a `linkScope` that isn't `"anywhere"` or `"below"`
  - a root directory with no sidebar index
- Internally, the sidebar-building function takes one options object (docs root, directory, group level limit, index marker, collapsed, source doc extensions, base, logger) instead of positional parameters.

### Hidden from sidebar

- A source doc is hidden from sidebar when its frontmatter has `draft: true` or `sidebar.hidden: true`. This is the same in dev and build: the dev sidebar shows what the build will show, unlike Starlight's rendering of drafts in dev. `pagefind` plays no part.
- A sidebar index that's hidden from sidebar contributes nothing, so its whole group is left out. A hidden root sidebar index drops its root group without an error.

### Building a group

- A group's entries are, in order: the index entry, then one entry per link in the sidebar index, in the order written.
- Each sidebar index is read once. Its frontmatter and its links both come from that one read.
- Links are found by parsing the body with plain `remark-parse`, whatever the extension. Inline links and reference-style links (resolved through their definitions) count. JSX and HTML elements don't.
- Per link:
  1. Skip it silently if it's external: any `scheme:` prefix, or a protocol-relative `//` link.
  2. Strip the query string and anchor. Skip it silently if nothing is left (a same-page anchor).
  3. Percent-decode it.
  4. If it's root-absolute: strip `base` when the link starts with it, then resolve against the docs root. Otherwise resolve against the sidebar index's directory.
  5. If it points at the directory, or the sidebar index, of the sidebar index it's written in or of any directory above it up to the docs root, warn and skip. From `guides/advanced/index.md` that's `.`, `./`, `..`, `../`, `../index.md`, `../../` and `/`, and `/docs` on a site with base `/docs`. This holds whether or not the directory is in the current chain of sidebar indexes, so a root group for `guides/advanced` never expands `guides/` from a `..` link. A link that goes up and then sideways or down (`../setup.md`, `../../reference/`) is not an ancestor link. With `linkScope: "below"`, also warn and skip any link that isn't inside the sidebar index's own directory. Resolved paths are compared with no trailing separator, so `/guides/` and `guides` are the same directory.
  6. If the result ends in `/` or `/index` (with or without a source doc extension), it's a sub-index link to that directory's sidebar index. If that directory has no sidebar index, warn and skip. There's no fallback to a sibling file. Otherwise, if it carries a source doc extension, use that exact file. If it carries no extension, try each source doc extension. If it carries some other extension and a file with that exact name exists, skip it silently (a docs asset). If no such file exists, try each source doc extension appended to the name, so `./v1.2` reaches `v1.2.md`.
  7. If no file exists, warn and skip. If the filename starts with `_`, warn and skip.
  8. If the target is hidden from sidebar, skip it silently.
- A sub-index link expands into a nested group unless its target's frontmatter has `indexSourcedSidebar: { leaf: true }`. A leaf index becomes a single entry with the index marker. The leaf key is ignored on a root sidebar index.
- Links to a directory above the sidebar index on the filesystem are already skipped at step 5. On top of that, cycle protection follows the current chain of sidebar indexes from the root, which catches loops between sibling directories (`guides/` links `../shared/`, which links `../guides/`). A sub-index link to a sidebar index in that chain is skipped with a warning. The same directory or page may appear under several sidebar indexes, and repeated links in one sidebar index give repeated entries.
- Warnings name the sidebar index file and the link as written.

### Slugs, labels and badges

- An entry's slug is the frontmatter `slug:` when present. Otherwise it's the source doc's page path from the shared helper, with a trailing `/index` dropped.
- Index entries and page entries are labelled `sidebar.label`, then `title`, then the label made from the filename. A group, the root group included, is labelled from its directory name.
- A page entry shows its `sidebar.badge`. An index entry shows the index marker when one is set, and otherwise its `sidebar.badge`.

### Cleanup

- Names follow the user's naming rules. Paths say what kind of path they are (`dirPath`, `indexFilePath`, `resolvedFilePath`), and terse names like `absDir`, `relative`, `normalized`, `ext` and `resolved` go.
- Relative imports use the `.js` extension, like the newer plugins.
- The unused sidebar type and the unsafe group cast in the hook are removed. The hook keeps the groups it gets back without casting.
- The plugin's JSDoc matches the README.

### Docs

- The README section is rewritten to cover: the subpath import, every option with its default, hidden from sidebar, leaf indexes, the link forms that count and the ones that don't, which links warn and which are skipped silently, which faults fail startup, slugs and labels, and a "Breaking changes in 4.0.0" list.
- The breaking changes are:
  - `maxDepthNesting` renamed to `maxGroupLevels`
  - `pagefind: false` no longer hides entries
  - `index.mdx` sub-indexes now expand
  - slugs are page paths
  - labels prefer `sidebar.label`
  - bad options fail startup
  - the `indexMarker` docs are corrected
- The `starlightIndexOnlySidebar` README section gets the rename, the new label and badge behaviour, and the startup errors.

## Testing Decisions

- Tests check behaviour users see, not internals. The seam for each sidebar plugin is its Starlight `config:setup` hook, run the way Starlight runs it: a file tree from the existing file-tree test helper, a fake `astroConfig` whose `srcDir`, `base` and `integrations` point at it, a `command`, a logger that records warnings and an `updateConfig` that records the sidebar. Assertions are on the sidebar passed to `updateConfig`, the recorded warnings and thrown errors. Prior art: the `runSetup` helper in the `astroLocalLinks` tests.
- The existing tests that call the sidebar-building functions directly move onto the hook seam, including the unreadable-path cases that use the existing lock helpers and are skipped when running as root.
- Cases for `starlightIndexSourcedSidebar`:
  - a nested happy path
  - `maxGroupLevels` flattening, including `1`
  - leaf indexes, and the leaf key ignored on a root
  - `.mdx` and `.mdoc` sidebar indexes, with and without Markdoc in `integrations`
  - hidden from sidebar in dev and build
  - `pagefind: false` not hiding
  - `_` files warning, and `_` folders counting
  - missing targets warning
  - `./sub/` with and without a sidebar index
  - root-absolute links with and without `base`
  - percent-encoded links
  - `scheme:` links
  - reference-style links
  - non-slug paths and `slug:` overrides
  - `sidebar.label` and `sidebar.badge`, and the index marker winning on index entries
  - duplicates and ancestor cycles
  - each startup error
  - a custom `srcDir`
- Cases for `starlightIndexOnlySidebar` cover only what changes there: slugs, labels and badges, `.mdoc`, `_` files, the docs root from `srcDir`, the renamed option and the startup errors.
- The page-path helper moving to the shared utils is covered by the existing `astroLocalLinks` tests, with no new tests at that level.
- The exports drift test is the only other new seam. It reads the build config and the package exports.

## Out of Scope

- Page-form links in sidebar indexes.
- JSX and HTML links in sidebar indexes.
- Showing drafts in the dev sidebar.
- Taking group labels from the sidebar index's `title`.
- An alias for `maxDepthNesting`.
- Renaming `directories`, `indexMarker`, `collapsed` or `dirnameDeterminesLabels`.
- Other `starlightIndexOnlySidebar` behaviour, such as its "Overview" labels and how it scans the filesystem.
- The old fixture-based harness in the shared test folder that nothing calls.
- Bumping the version or publishing.

## Further Notes

- Hidden from sidebar deliberately differs from Starlight's draft rendering in dev and from `astroServeDocsFiles` (ADR 0012). The README says so, so nobody "fixes" it later.
- Warnings rather than failures for broken links keep link validation in `astroLocalLinks`, which fails broken links on final HTML (ADR 0007). A site without `astroLocalLinks` still sees the warnings.
- The leaf key lives in raw frontmatter that the plugin reads itself, so it doesn't need an extension to Starlight's frontmatter schema.
