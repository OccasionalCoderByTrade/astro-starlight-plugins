# 02: Index-sourced sidebar: hook test seam, docs root from `srcDir`, cleanup

**What to build:** A prefactor that makes the rest of the work easy. `starlightIndexSourcedSidebar` reads its docs root from Astro's `srcDir` in `config:setup` (`content/docs/` under it), like `astroLocalLinks` and `astroServeDocsFiles`, so a site with a custom `srcDir` gets its sidebar and nothing depends on the working directory. Tests run the plugin's `config:setup` hook the way Starlight does: a file tree from the file-tree helper, a fake `astroConfig` (`srcDir`, `base`, `integrations`), a `command`, a logger that records warnings and an `updateConfig` that records the sidebar. Prior art is `runSetup` in the `astroLocalLinks` tests. The existing direct tests move onto this seam.

Code cleanup, with no behaviour change:
- the sidebar-building function takes one options object instead of positional params
- names follow the naming rules (`dirPath`, `indexFilePath`, `resolvedFilePath`, and no `absDir`, `relative`, `normalized`, `ext` or `resolved`)
- relative imports end in `.js`
- the unused sidebar type and the unsafe group cast are removed
- each sidebar index is read once, for both its frontmatter and its links

The README and JSDoc describe `indexMarker` as a `{ text, variant }` badge and document `collapsed` (default `true`).

See the spec: Implementation Decisions › Docs root and command context, › Cleanup; Testing Decisions.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] The sidebar builds on a site whose `srcDir` isn't `src/`, run from a different working directory
- [x] All tests go through the `config:setup` hook, including the unreadable-path cases (still skipped as root)
- [x] The sidebar output for the existing cases is unchanged
- [x] No cwd-relative docs root constant remains in the plugin
- [x] The README and JSDoc document `indexMarker` as a badge and document `collapsed`
- [x] `npm run lib:build` and `npm test` pass
