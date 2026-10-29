/**
 * Every label of the tex diagram zoom view and the button that opens it,
 * shared by the HTML the core renders and the page script.
 */
export const ZOOM_LABELS = {
  openButton: "Zoom diagram",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  resetZoom: "Reset zoom",
  close: "Close",
  /** The zoom view's name when the block has no `alt` of its own. */
  uncaptionedView: "Zoomed diagram",
} as const;
