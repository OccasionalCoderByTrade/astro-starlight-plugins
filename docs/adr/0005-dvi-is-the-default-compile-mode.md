---
status: accepted
---

# DVI is the default compile mode

A compiled tex diagram used to be an `<img>` pointing at an SVG that `dvisvgm --pdf` made from pdflatex's PDF. In PDF mode dvisvgm can only draw glyphs as paths, so its text couldn't be selected, copied or found with the browser's search, even after inlining the SVG into the page. To keep text as `<text>`, dvisvgm needs a DVI, so by default pdflatex now runs with `-output-format=dvi` and dvisvgm embeds the fonts as WOFF2 (`--font-format=woff2`). The SVG is inlined into the page instead of linked.

DVI can't hold PNG, JPEG or PDF graphics, and pdfTeX-only primitives don't work in it. A block that needs them sets `mode=pdf` to keep the old route, still inlined but with its text drawn as shapes. Any other `mode` value is a tex compile error. The compile mode is a per-block choice only; there is no site-wide default option.

## Considered Options

- **Keep PDF and only inline the SVG.** Rejected: inlining alone doesn't help, since the PDF route has no text to select.
- **DVI always, with no escape hatch.** Rejected: one block with a PNG would have no way to compile.
- **A plugin option to change the default compile mode.** Rejected for now: per-block `mode=pdf` covers the known cases, and an option is a public API to keep.

## Consequences

- **Hashes change.** A pipeline version and the compile mode are folded into every block's hash. Every existing compiled tex diagram misses once and recompiles, and the same block in the two modes never shares a cached SVG. Bump the pipeline version whenever the written SVGs change shape.
- **Scoping.** Inline SVGs share the page's ids and stylesheet, and dvisvgm reuses names like `f0` and `cmr10` (each compiled tex diagram embedding a different subset of a font). At write time every id, reference, class and `@font-face` family is prefixed with `tex-<hash>-`. The same font is embedded once per compiled tex diagram on a page, which makes pages bigger.
- **The SVG files stay.** They are still written to `svgOutputDir` as a cache, and the ledger and orphan sweep (ADR-0002) work on them unchanged. Pages no longer link to them, so whether they should live under `publicDir` is an open question.
- **Accessibility.** `alt` becomes `role="img"` and `aria-label` on the `<svg>`, matching what `<img alt>` gave screen readers.
- **Page box.** A DVI's own page box is the whole paper, so DVI mode converts with `--bbox=papersize`, which reads the size classes like standalone set and matches the PDF route's size.
- **Sizing.** The injected CSS gives `.tex-compiled` `max-width: 100%; height: auto`, as `<img>` got from the theme. The dark-mode `filter: invert(...)` works on `<svg>` unchanged.
- **Debug tex diagram images.** sharp ignores embedded web fonts, so a debug tex diagram image in DVI mode comes from a second compile with `dvisvgm --no-fonts` (glyphs as paths). This costs an extra pdflatex run per debug block on every render.
- **Copy quality.** Copied text follows how TeX placed glyphs (`x^2` copies as `x2`), the same as KaTeX.
- **Errors.** A DVI-mode failure such as `Unknown graphics extension: .png` shows pdflatex's own message, with no hint to try `mode=pdf`; the README documents the link.
