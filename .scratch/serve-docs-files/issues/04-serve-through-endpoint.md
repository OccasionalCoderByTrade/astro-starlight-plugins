# 04: Serve docs files through a prerendered endpoint

**What to build:** The core tracer bullet. `astroServeDocsFiles` stops touching `public/` and serves every raw doc and docs asset at its path under the docs directory through one injected, prerendered `/[...path]` route. In dev each file is read from source on request, so saved edits show up straight away. In a build Astro writes each one into the output directory byte-for-byte. Pages, the home page and Starlight's 404 keep working. Live adds and deletes in dev aren't handled yet (05). The prototype branch `prototype/docs-asset-endpoint` (commit `d5bacea`) is the primary source. See the spec (`../spec.md`) and ADR 0011.

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] The route module ships as its own build entry, so the injected entrypoint resolves both in this repo and in the published package
- [ ] `getStaticPaths` lists exactly the files the served-file rule accepts; `GET` returns the source bytes unchanged, with a content type from the extension (`text/markdown; charset=utf-8` for `.md`/`.mdx`, `application/octet-stream` as the fallback)
- [ ] Docs and public dirs come from Astro's config (`srcDir`, `publicDir`), not hardcoded paths
- [ ] The full sync, incremental sync, copy step, debounce, and every write to or deletion from `public/` are gone; `preserveDirs` is removed
- [ ] The integration object exposes the resolved served-file rule as a public, documented field
- [ ] The page-action bar options still work against the served raw docs; the `ignorePatterns` conflict check stays
- [ ] An existing `public/` tree is byte-identical after dev setup and a build (test)
- [ ] Route module tests (seam 2): served files listed, bytes unchanged for nested and non-slug paths, content types
- [ ] Demo `astro.config.mjs` uses the new options; the demo's stale synced copies in `public/` are deleted (only `static/` and `favicon.svg` are user-owned)
- [ ] README section rewritten, with a short 4.0.0 upgrade note: rename, `preserveDirs` removed, delete old synced copies from `public/`
- [ ] Checked in a real dev server and build per CLAUDE.md: assets, raw docs, pages, 404s, outputs byte-identical
