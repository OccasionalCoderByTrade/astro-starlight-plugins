# 04: Entry slugs are page paths

**What to build:** A site author's sidebar entries point at the pages Starlight actually serves. An entry's slug is the frontmatter `slug:` when present. Otherwise it's the source doc's page path, with each segment slugified the way Starlight does it, and a trailing `/index` dropped. So `reference/My Page.md` gets `reference/my-page`. The page-path logic moves out of `astroLocalLinks` into the shared utils, and both sidebar plugins and `astroLocalLinks` use it. The README for both sidebar plugins describes how slugs are made.

See the spec: Implementation Decisions › Shared utils, › Slugs, labels and badges.

**Blocked by:** 03

**Status:** resolved

- [x] A non-slug path (`My Page.md`) gets its page path as the slug, in both sidebar plugins
- [x] A `slug:` frontmatter override is used as the slug, in both sidebar plugins
- [x] Index entries drop a trailing `/index`
- [x] The `astroLocalLinks` tests pass unchanged
- [x] README updated for both sidebar plugins
- [x] `npm run lib:build` and `npm test` pass
