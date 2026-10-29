---
status: accepted
---

# The tex diagram zoom view clones the inline SVG

When zoom is on for a `tex compile` block, its compiled tex diagram is wrapped in a full-width block, and a zoom button sits at the wrapper's top-right, at the edge of the content column rather than on the diagram's own corner. The button opens one shared native `<dialog>` holding a clone of the page's inline `<svg>`, and zooming resizes the clone's `width` and `height` from the size it has on the page.

The full-width wrapper leaves the `<svg>` and its `class=` exactly as they were, so zoom never changes how an existing diagram lays out: centering classes such as `d-block mx-auto` keep working, and the dark-mode invert still applies to the same element. Cloning the inline `<svg>` keeps `dvi` mode's text selectable in the zoom view, carries over the block's classes and the dark-mode invert, and keeps text crisp at every zoom level. The clone keeps the original's hash-prefixed ids; `url(#…)` references resolve to the original's identical definitions, which are visible whenever the button can be clicked.

## Considered Options

- **A fit-content wrapper**, so the button sits on the diagram's corner. Rejected: layout classes on the `<svg>` stop centering it, and moving them to the wrapper breaks the dark-mode invert (a `bg-white` wrapper stays white).
- **An `<img>` of the SVG in `svgOutputDir`.** Rejected: its text can't be selected, the dark-mode invert and block classes would need restyling, and the file is a cache rather than the published diagram.
- **A morph animation (FLIP)** from the diagram's place on the page into the dialog. Rejected for now: it needs the original hidden during the animation, forced layout reads, a no-animation path on resize and an intercepted Esc. A CSS fade and scale gets most of the effect, and a morph can replace it later without changing markup or options.
- **A custom modal** instead of `<dialog>`. Rejected: `showModal()` already gives Esc to close, focus return, `::backdrop` and an inert page.
