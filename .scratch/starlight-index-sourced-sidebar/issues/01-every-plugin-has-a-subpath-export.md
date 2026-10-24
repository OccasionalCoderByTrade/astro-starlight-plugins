# 01: Every plugin has a subpath export

**What to build:** Following ADR 0013, a site author can import any plugin from its own subpath, so their config only loads that plugin's dependencies. `starlightIndexSourcedSidebar` gets a build entry and a package export. `expressiveCodeEmphasis` already has a build entry and gets its missing export. Internal sibling modules (page scripts, middleware, routes) keep a build entry and get no export. A test fails whenever a plugin's build entry and its package export don't match one-to-one. CLAUDE.md says every plugin must have a subpath export and points at ADR 0013. Every plugin's README usage example uses the subpath import.

See the spec: `.scratch/starlight-index-sourced-sidebar/spec.md` (Implementation Decisions › Exports).

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] `starlight-cannoli-plugins/starlight-index-sourced-sidebar` resolves after `lib:build`, with types
- [x] `starlight-cannoli-plugins/expressive-code-emphasis` resolves after `lib:build`, with types
- [x] Internal sibling modules aren't package exports
- [x] The drift test fails when an entry has no export, or an export has no entry, and passes on the fixed config
- [x] CLAUDE.md's Layout section says every plugin must have a subpath export, citing ADR 0013
- [x] Every plugin's README usage example imports from its subpath
- [x] `npm pack --dry-run` still includes only `dist/`, README, LICENSE and package.json
