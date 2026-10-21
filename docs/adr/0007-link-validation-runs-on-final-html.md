---
status: accepted
---

# Link validation runs on final HTML, scoped to `.sl-markdown-content`

`astroLocalLinks` validates local links on each page's final HTML, not in a rehype plugin. It does this in the same pass that does link normalization: dev middleware in dev, `astro:build:done` in build. Only HTML is fully resolved at that point. A rehype plugin can't see `src={...}` expressions in MDX or the HTML that components render, and those are local links too.

Final HTML also holds Starlight's own UI (sidebar, pagination, head), and validating that gives false positives. So link validation only looks inside Starlight's content wrapper, `.sl-markdown-content`, which holds everything rendered from a source doc. Link normalization still covers the whole page.

## Consequences

A target counts as existing only if it matches a source doc or a file in `public/`. A file that sits next to a source doc in `src/content/docs/` but was never copied into `public/` fails link validation, because its URL would 404. `astroLocalLinks` doesn't know which integration (if any) does that copying. It only relies on `public/` being filled before pages render, which `syncDocsToPublic` does in `astro:build:start` and `astro:server:setup`.

## Considered Options

- **Keep the rehype plugin (`rehypeValidateLinks`).** Rejected: it misses expression attributes and component output, and it ran separately from normalization with its own resolver. The two had already drifted apart (the `?` skip marker was left in the output for normalization to mangle).
- **Validate the whole page.** Rejected: every Starlight UI link, `/_astro/*` asset and `public/` script would need an exclusion.
