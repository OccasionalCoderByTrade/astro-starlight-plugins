---
status: accepted
---

# Compiled tex diagrams are sized in em

dvisvgm sizes a compiled tex diagram in pt, so 10pt LaTeX text (the default of `article` and `standalone`) shows at about 13.3px, whatever the page around it does. Starlight's body text inherits the reader's browser font size, which is 16px by default but not for everyone. Compiled tex diagrams looked smaller than the text next to them, and didn't follow a reader who raised their browser font size.

So when a compiled tex diagram is inlined, its root `<svg>`'s `width` and `height` are rewritten from pt to em, with 10pt as 1em. 10pt LaTeX text then matches the surrounding text at any browser font size, and in smaller contexts such as asides it shrinks with them. The `viewBox` is untouched, so the whole compiled tex diagram scales evenly: text, line widths and spacing alike. The SVG in `svgOutputDir` keeps its pt dimensions, so no hash changes and nothing recompiles.

The 10pt base is fixed. A block whose class sets `12pt` renders 1.2× the body text, as it would next to 10pt text in a PDF. Wide compiled tex diagrams still shrink to the content column (`max-width: 100%`), which they now reach sooner.

## Considered Options

- **A fixed scale factor** (`dvisvgm --zoom=1.2`, or multiplying the pt dimensions). Rejected: 1.2 is only right for a 16px browser font size.
- **CSS `zoom` on `.tex-compiled`.** Rejected: also a fixed factor, and `max-width: 100%` resolves before the zoom, so wide compiled tex diagrams could overflow.
- **Reading each block's `\documentclass` size option** to map that size to 1em. Rejected: it breaks on custom classes, `\LoadClass` and `\fontsize`, for a case the fixed base already handles sensibly.
- **Scaling only the text** (injecting `12pt` into the class). Rejected: it edits the user's document, not every class takes the option, and TeX reflows text while TikZ coordinates stay fixed, so labels can overlap shapes.
