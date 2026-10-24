# 08: More link forms

**What to build:** A site author can write the links they already use on the site, and they become sidebar entries in `starlightIndexSourcedSidebar`:
- **Root-absolute links** (`/guides/setup`) resolve against the docs root, with Astro's `base` stripped first when the link starts with it.
- **Percent-encoded links** (`./my%20page`) are decoded.
- **External links:** any `scheme:` link (`https:`, `mailto:`, `tel:`, `ftp:`) and any protocol-relative `//` link is skipped silently.
- **Reference-style links** (`[Setup][setup]`) count, through their definitions.
- **Missing targets:** a link to a file that doesn't exist logs a warning naming the sidebar index and the link.

JSX and HTML links still don't count, and page-form links are unsupported. The README lists the link forms that count, the ones that don't, and which links warn and which are skipped silently.

This ticket is blocked by 07 only because both change the same resolution step, not because it needs 07's behaviour.

See the spec: User Stories 36-47; Implementation Decisions › Building a group (steps 1-4, 6-7).

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] `/guides/setup` resolves to the doc under the docs root, with `base: "/"` and with `base: "/docs"` (written as `/docs/guides/setup`)
- [ ] `./my%20page` resolves to `my page.md`
- [ ] `tel:` and `ftp:` links give no entry and no warning
- [ ] Reference-style links give entries, in the order the references appear
- [ ] A link to a missing file warns once and adds nothing
- [ ] A link to a PDF adds nothing, with no warning
- [ ] README updated
- [ ] `npm run lib:build` and `npm test` pass
