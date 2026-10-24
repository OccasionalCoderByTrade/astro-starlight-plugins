# 06: Startup validation and `maxGroupLevels`

**What to build:** A site author gets a clear startup error (ADR 0008) from either sidebar plugin when the options are wrong. The error names the plugin and the bad value. The errors:
- a `directories` entry outside the docs root
- a `directories` entry that doesn't exist ("directory not found", not "no index")
- the same directory listed twice
- a root directory with no sidebar index

`maxDepthNesting` is renamed to `maxGroupLevels` in both plugins, with no alias. It counts levels of groups including the root group, so `1` means everything is flat under the root group. Leaving it unset means unlimited, and anything other than an integer of at least 1 fails startup. The README for both plugins documents the option and lists the startup errors.

See the spec: User Stories 9-16, 61-62; Implementation Decisions › Options.

**Blocked by:** 03

**Status:** resolved

- [x] Each of the four directory errors throws from `config:setup` with a distinct message, in both plugins
- [x] `maxGroupLevels: 1` flattens everything under the root group, and `2` keeps one level of nested groups
- [x] Unset `maxGroupLevels` nests without limit
- [x] `0`, `1.5` and `-1` throw at startup
- [x] `maxDepthNesting` no longer appears in the code, types or README
- [x] README updated for both sidebar plugins
- [x] `npm run lib:build` and `npm test` pass
