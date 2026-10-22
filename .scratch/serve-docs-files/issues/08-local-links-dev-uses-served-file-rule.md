# 08: local-links in dev accepts what the serve plugin serves

**What to build:** In dev, `astroLocalLinks` finds `astroServeDocsFiles` by name in `config.integrations` and reads the served-file rule it exposes. A file-target local link then passes if the file is in `public/`, or if it exists under the docs directory and the rule accepts it. So dev and build agree on what's served, including `ignorePatterns`. Without the serve plugin installed, only `public/` counts. Neither plugin imports the other. See the spec (`../spec.md`) and ADR 0011.

**Blocked by:** 04

**Status:** resolved

- [x] With the serve integration present: a link to a served docs asset or raw doc passes; one to an ignored, draft or `_`-prefixed file fails
- [x] Without it: only `public/` files pass, as before
- [x] Files the user put in `public/` still pass either way
- [x] Tests through the dev request handler and `astro:config:setup`, using the existing helpers
- [x] README Local Links section says how dev validation finds served docs files

## Comments

Resolved on branch `serve-docs-files`. See `git log db93e0d..serve-docs-files`.
