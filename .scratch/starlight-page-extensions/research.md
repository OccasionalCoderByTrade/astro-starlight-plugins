# Which content files become Starlight pages?

Versions installed: `astro` 7.4.1, `@astrojs/starlight` 0.42.6, `@astrojs/mdx` 8.1.0, `@astrojs/markdown-remark` 7.3.3. `@astrojs/markdoc` is not installed.

## Answer

- The user is half right. Starlight's `docsLoader()` *does* glob all 7 extensions: `**/[^_]*.{markdown,mdown,mkdn,mkd,mdwn,md,mdx}` (+ `mdoc` when the Markdoc integration is present).
- But Astro's content layer only has content entry types for `.md` (core) and `.mdx` (`@astrojs/mdx`, which Starlight adds). A matched file with any other extension gets `No entry type found for <file>` and is skipped. No collection entry, so no page.
- Pages with default config: **`.md` and `.mdx` only**. Plus `.mdoc` if `@astrojs/markdoc` is installed and added.
- The `_` exclusion comes from Starlight's pattern, not from Astro's glob loader. It only applies to the **filename** (last path segment). Files under a `_`-prefixed **directory** (e.g. `_partials/inner.md`) are still loaded and become pages.
- Verified empirically (fixture build, see "Empirical check").

Suggested CLAUDE.md replacement:

```
filename `**/[^_]*.{md,mdx}` semantics (plus `.mdoc` with @astrojs/markdoc). Starlight's
docsLoader also globs .markdown/.mdown/.mkdn/.mkd/.mdwn, but Astro has no content entry
type for them, so they are skipped with a warning and never become pages. The `_` rule
applies to filenames only; `_dir/page.md` is still a page.
```

## 1. Starlight `docsLoader()` / `i18nLoader()` pattern

`node_modules/@astrojs/starlight/dist/loaders.js` (0.42.6):

- L4-12: `docsExtensions = ["markdown","mdown","mkdn","mkd","mdwn","md","mdx"]`.
- L13-17: `i18nExtensions = ["json","yml","yaml"]` (data, not pages).
- L39: pushes `"mdoc"` when an integration named `@astrojs/markdoc` is in the config (docs collection only). Side note: it pushes onto the module-level array, so repeated loads can push duplicates. Harmless in a glob brace list.
- L40-43: `{ base: getCollectionPathFromRoot(collection, ...), pattern: \`**/[^_]*.{${extensions.join(",")}}\` }`.
- L44: a user `generateId` is passed through to `glob()`. No `pattern` option is exposed (`loaders.d.ts` L8-14: only `generateId`).
- Upstream source matches: https://github.com/withastro/starlight/blob/main/packages/starlight/src/loaders.ts (L6 extensions, L52 `mdoc`, L57 pattern).

`_` exclusion: owned by Starlight's pattern (`[^_]*` as the final segment). `**` still matches `_`-prefixed directories.

## 2. Astro glob loader and entry types

Entry type registration:

- `node_modules/astro/dist/vite-plugin-markdown/content-entry-type.js` L3-4: `markdownContentEntryType = { extensions: [".md"], ... }`. Only `.md`.
  - Upstream: https://github.com/withastro/astro/blob/main/packages/astro/src/vite-plugin-markdown/content-entry-type.ts L6 `extensions: ['.md']`.
- `node_modules/astro/dist/core/config/settings.js` L32: `contentEntryTypes: [markdownContentEntryType]`. Data entry types: `.json` (L35), `.yaml/.yml` (L61), `.toml` (L86).
- `node_modules/@astrojs/mdx/dist/index.js` L31-32: `addContentEntryType({ extensions: [".mdx"], ... })` (and L30 `addPageExtension(".mdx")`).
- `node_modules/@astrojs/starlight/dist/index.js` L56: Starlight adds `mdx({ optimize: true })` if the user hasn't.
- Markdoc: https://github.com/withastro/astro/blob/main/packages/integrations/markdoc/src/content-entry-type.ts L30 `extensions: ['.mdoc']`.
- Nothing else in `astro/dist` registers `.markdown/.mdown/.mkdn/.mkd/.mdwn` as a content entry type (grep for `mkdn` only hits `core/constants.js` and `vite-plugin-utils/index.js` L8, a `src/pages` URL helper).

Lookup and skip:

- `node_modules/astro/dist/content/content-layer.js` L83: `entryTypes: getEntryConfigByExtMap([...contentEntryTypes, ...dataEntryTypes])`.
- `node_modules/astro/dist/content/utils.js` L144-152: map from each registered extension to its entry type.
- `node_modules/astro/dist/content/loaders/glob.js`:
  - L198-201: files listed with `tinyglobby(pattern, { cwd: base })`. No extra `_` filter in the loader.
  - L205-212 `configForFile`: last `.`-segment of the filename, looked up as `entryTypes.get(".ext")`. Case-sensitive.
  - L69-73 `syncData`: `if (!entryType) { logger.warn(\`No entry type found for ${entry}\`); return; }`. File is skipped, nothing stored.
  - Same path on dev file changes (L261-271).

## 3. Route generation

- Starlight: `node_modules/@astrojs/starlight/dist/utils/routing/index.js` L23-25: routes = every `getCollection("docs")` entry (drafts filtered in production only). L26-32: one route per entry. No extension filter. So pages = collection entries = files with an entry type.
- Legacy `src/pages` file routing (context only): `node_modules/astro/dist/core/constants.js` L87-94 `SUPPORTED_MARKDOWN_FILE_EXTENSIONS = [".markdown",".mdown",".mkdn",".mkd",".mdwn",".md"]`. Used in `core/config/settings.js` L27-31 (`pageExtensions`) and `core/routing/create-manifest.js` L86-90 (`validPageExtensions`). So in `src/pages/`, all 6 markdown extensions *are* pages (and `_`-prefixed names are skipped, `create-manifest.js` L108/L223). This is likely where the 7-extension idea comes from. It does not apply to content collections.

## 4. MDX / Markdoc

- `@astrojs/mdx`: adds `.mdx` only (see 2).
- `@astrojs/markdoc`: adds `.mdoc` only (see 2). Starlight then adds `mdoc` to its glob (loaders.js L39).

## 5. Bottom line and overrides

| Extension | Globbed by docsLoader | Entry type | Page |
|---|---|---|---|
| `.md` | yes | core | yes |
| `.mdx` | yes | `@astrojs/mdx` | yes |
| `.mdoc` | only with markdoc | `@astrojs/markdoc` | only with markdoc |
| `.markdown` `.mdown` `.mkdn` `.mkd` `.mdwn` | yes | none | no (warning, skipped) |

- Starlight docs agree: "Add new pages to your site by creating `.md` or `.mdx` files in `src/content/docs/`" (https://github.com/withastro/starlight/blob/main/docs/src/content/docs/guides/pages.mdx L16-23).
- Overrides: `docsLoader({ generateId })` only changes ids/slugs, not which files load. To change the pattern, a user must skip `docsLoader()` and use Astro's `glob({ base: "src/content/docs", pattern })` directly in `src/content.config.ts`. Even then, extensions without an entry type are still skipped unless some integration registers one via `addContentEntryType`.

## 6. Where this repo bakes in the 7-extension list

- `src/plugins/utils/workspace-utils.ts:32-40` -- `SOURCE_DOC_EXTENSIONS` (all 7). JSDoc says "The extensions Starlight's docs loader reads source docs from". True of the glob, not of what becomes a page.
- `src/plugins/utils/served-file-rule.ts:50` -- treats files with these extensions as source docs and parses frontmatter for `draft`.
- `src/plugins/astro-serve-docs-files/docs-file-route.ts:24` -- serves all 7 as `text/markdown`. Fine for raw serving.
- `src/plugins/astro-local-links/utils.ts:459` -- `findRawDocLinkPagePath` accepts a raw doc link with any of the 7. Then needs a `sourceDocIndex` hit.
- `src/plugins/astro-local-links/utils.ts:549-552` -- `collectSourceDocFilePaths` indexes files with any of the 7, skipping `_`-prefixed *filenames* only (matches loader). This index may map `.markdown` etc. files to page paths that have no rendered page.
- Tests encoding it: `src/plugins/astro-serve-docs-files/index.test.ts:511` ("any source doc extension Starlight reads in a build"), `docs-file-route.test.ts:142-160`, `raw-doc-alternate-link.test.ts:94-102`, `astro-local-links/on-request.test.ts:306-309`.
- `README.md:336` already states the correct behaviour (only `.md`/`.mdx` get entry types). `README.md:425` lists all 7 for raw serving (fine).
- `src/plugins/starlight-index-sourced-sidebar/utils.ts:27,35,53,93,151-157` and `starlight-index-only-sidebar/utils.ts:19` only handle `.md`/`.mdx` (consistent with the real page set; ignores `.mdoc`).
- `rehype-validate-links.ts`, `remark-gfm-slug.ts`: no extension lists.

## Empirical check

Minimal Starlight fixture (scratchpad, linked to this repo's `node_modules`), one `page-<ext>.<ext>` per extension, plus `_under.md`, `_partials/inner.md`, `sub/_x.md`, `sub/ok.markdown`. `astro build` content sync logged:

```
[WARN] [starlight-docs-loader] No entry type found for page-markdown.markdown
[WARN] [starlight-docs-loader] No entry type found for page-mdown.mdown
[WARN] [starlight-docs-loader] No entry type found for page-mdwn.mdwn
[WARN] [starlight-docs-loader] No entry type found for page-mkd.mkd
[WARN] [starlight-docs-loader] No entry type found for page-mkdn.mkdn
[WARN] [starlight-docs-loader] No entry type found for sub/ok.markdown
```

Data store entries: `_partials/inner.md`, `index.md`, `page-md.md`, `page-mdx.mdx`. So `_under.md` and `sub/_x.md` were excluded, `_partials/inner.md` was included.
