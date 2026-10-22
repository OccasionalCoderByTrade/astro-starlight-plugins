# 02: Rename `syncDocsToPublic` to `astroServeDocsFiles`

**What to build:** A mechanical rename with no change in behaviour. The exported function, integration name, plugin directory, build entry, package subpath export, root re-export, README section and demo `astro.config.mjs` all move to `astroServeDocsFiles` together, as CLAUDE.md requires for a renamed plugin. It's a breaking change for the unreleased 4.0.0. Don't bump the version. See the spec (`../spec.md`) and ADR 0011.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] No remaining references to `syncDocsToPublic` or `astro-sync-docs-to-public` outside ADRs, the spec and changelog-style notes
- [x] The page-action bar's script path logic still resolves in this repo, in the plugin's own build entry and when bundled into the root entry
- [x] `npm run lib:build` and `npm test` pass, and `npm pack --dry-run` shows the renamed entry

## Comments

Resolved on branch `serve-docs-files`. See `git log db93e0d..serve-docs-files`.
