# 03: local-links checks file targets against the build output dir

**What to build:** In a build, `astroLocalLinks` checks a file-target local link against the output directory `astro:build:done` passes it, not against `public/`. That's the ground truth for what's served: `public/` files, served docs files and anything other integrations write all end up there. The broken raw doc link error changes from saying the copy in `public/` is missing to saying the raw doc isn't served, and it still names the link to use for the page. It works with today's copy-into-`public/` sync, so it doesn't wait on the endpoint. See the spec (`../spec.md`), ADR 0007, ADR 0010 (partly superseded) and ADR 0011.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A link to a file that's in the output dir passes; one that isn't fails, whether or not a copy exists in `public/`
- [ ] Generated paths (`/_image`, `/_astro/`) are still left alone
- [ ] Raw doc link error wording updated; per ADR 0010 raw doc links are still never rewritten
- [ ] Dev validation is unchanged by this ticket (it's handled in 08)
- [ ] Existing `build:done` tests updated and new ones added, using the existing site helpers
- [ ] README Local Links section updated where it says files must be in `public/`
