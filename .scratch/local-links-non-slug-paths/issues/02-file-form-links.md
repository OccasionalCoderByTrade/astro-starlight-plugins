# 02: File-form links validate and get rewritten to page paths

**What to build:** An author can link to a non-slug doc by its file path (`./List%20Syntax%20cOp%26%26Y`), which their editor can follow. Link validation accepts it, and link normalization rewrites it to the page path, so readers get a working URL. Links that are neither the exact page form nor the exact file form are broken. With link normalization off, a file-form link is broken, with a reason that tells the author what to do. See the spec (`../spec.md`) and ADR 0009.

**Blocked by:** 01 (Pages from non-slug docs resolve)

**Status:** ready-for-agent

- [ ] A file-form link (relative or root-absolute, URL-decoded, matching a source doc's path without extension, or its folder for an `index` doc) passes link validation
- [ ] Link normalization rewrites file-form links to the `encodeURI`'d page path, keeping the author's trailing slash or lack of one and the `?query#fragment` suffix
- [ ] A link that only matches after slugifying (`/reference/LIST-syntax-COPY`) is reported broken
- [ ] With link normalization off, a file-form link whose page path differs is reported broken, and the reason names the page path
- [ ] `skipPatterns` skip a file-form link when a pattern matches either its file form or its page path
- [ ] Page-form links behave exactly as before (relative ones still become root-absolute)
- [ ] Tests written first, through the dev middleware seam
- [ ] A file-form link to the demo doc is added; checked in a browser (dev and build preview), following it lands on the page, with no console errors
- [ ] `npm run lib:build` passes; committed to the current branch
