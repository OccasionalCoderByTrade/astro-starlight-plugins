---
status: accepted
---

# LaTeX compile is exported only as an Astro integration

`astro-latex-compile` is built on a remark transformer, but only the `astroLatexCompile` integration is public (from the root and the `./astro-latex-compile` subpath). The transformer relies on things only the integration provides (Astro's frontmatter stripping for error line numbers, `publicDir`/`base` for image URLs, content-layer cache clearing so Starlight re-runs it, and cross-invocation state for orphan cleanup), and every real consumer already uses Astro, so a standalone remark export would only work in Astro anyway, and even there only partially.

## Considered Options

- **Standalone remark export** (documented as `remarkLatexCompile` until 2.14.1, then left reachable by accident as `latexCompileTransformer`/`compileLatexToSvg` on the subpath). Rejected: there are no consumers outside Astro, it can't honour a custom `svgOutputDir`, and it forced internal state fields onto the public options type.
- **Keep it exported but `@deprecated`** for backward compatibility. Rejected in favour of removing it outright in 3.0.0; removing public exports is a breaking change even when they were undocumented.
