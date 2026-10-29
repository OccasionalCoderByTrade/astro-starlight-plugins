---
status: accepted
---

# The tex diagram zoom view clones the inline SVG

When zoom is on for a `tex compile` block, its compiled tex diagram is wrapped in a full-width block, and a zoom button sits above the diagram's own top-right corner, found with CSS anchor positioning (at the wrapper's top-right in browsers without `anchor-scope`). The button opens one shared native `<dialog>` holding a clone of the page's inline `<svg>`, and zooming resizes the clone's `width` and `height` from the size it has on the page.

The full-width wrapper leaves the `<svg>` and its `class=` exactly as they were, so zoom never changes how an existing diagram lays out: centering classes such as `d-block mx-auto` keep working, and the dark-mode invert still applies to the same element. The button rises into the gap above the diagram so it covers no more than the diagram's top border. To make room, every compiled tex diagram gets a top gap a little wider than the content gap, with or without zoom and even as the first child of its container, so turning zoom on or off still moves nothing. Cloning the inline `<svg>` keeps `dvi` mode's text selectable in the zoom view, carries over the block's classes and the dark-mode invert, and keeps text crisp at every zoom level. The clone keeps the original's hash-prefixed ids; `url(#…)` references resolve to the original's identical definitions, which are visible whenever the button can be clicked.

## Considered Options

- **The button inside the diagram's corner.** Rejected: it covers part of the diagram, all the time on touch devices.
- **A click on the diagram opens the zoom view**, with the button only for keyboard users. Rejected: a click that ends a text selection in `dvi` mode would open it, and nothing shows that the diagram can be clicked.
- **A fit-content wrapper**, so the button sits on the diagram's corner. Rejected: layout classes on the `<svg>` stop centering it, and moving them to the wrapper breaks the dark-mode invert (a `bg-white` wrapper stays white).
- **An `<img>` of the SVG in `svgOutputDir`.** Rejected: its text can't be selected, the dark-mode invert and block classes would need restyling, and the file is a cache rather than the published diagram.
- **A morph animation (FLIP)** from the diagram's place on the page into the dialog. Rejected for now: it needs the original hidden during the animation, forced layout reads, a no-animation path on resize and an intercepted Esc. A CSS fade and scale gets most of the effect, and a morph can replace it later without changing markup or options.
- **A custom modal** instead of `<dialog>`. Rejected: `showModal()` already gives Esc to close, focus return, `::backdrop` and an inert page.
