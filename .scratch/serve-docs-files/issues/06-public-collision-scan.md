# 06: Fail on served path collisions with `public/`

**What to build:** When a served docs file and a file in `public/` have the same served path, that's a served path collision. It fails dev at startup and fails the build at build start, per ADR 0008. The error lists every clash with both files for each one. As a possible cause, not the assumed one, it adds: "Alternatively, it may be a stale holdover from a previous version of starlight-cannoli-plugins's syncDocsToPublic 3.0.0 plugin." A collision created during a dev session only errors at that URL and doesn't stop the server. See the spec (`../spec.md`), ADR 0011 and **Served path collision** in `CONTEXT.md`.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Startup scan at dev server setup and at build start; one error listing every clash
- [ ] Files the served-file rule leaves out (drafts, ignored, `_`/`.`-prefixed) never count as clashes
- [ ] A collision created mid-session in dev gives an error response at that URL, and the server keeps running
- [ ] Tests through the integration hooks for dev setup and build start
- [ ] README mentions the error alongside the upgrade note
