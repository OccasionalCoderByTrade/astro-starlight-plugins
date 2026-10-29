/** The zoom level the tex diagram zoom view opens at: the size on the page. */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
const ZOOM_STEP = 1.25;

/** How many steps up from `MIN_ZOOM` `zoomLevel` is, allowing for float error. */
function stepsUp(zoomLevel: number): number {
  return Math.log(zoomLevel) / Math.log(ZOOM_STEP);
}

/** The next zoom level up, capped at `MAX_ZOOM`. */
export function zoomIn(zoomLevel: number): number {
  const nextStep = Math.floor(stepsUp(zoomLevel) + 1e-9) + 1;
  return Math.min(ZOOM_STEP ** nextStep, MAX_ZOOM);
}

/**
 * The next zoom level down, floored at `MIN_ZOOM`. From `MAX_ZOOM`, it goes
 * back to the level below it on the way up.
 */
export function zoomOut(zoomLevel: number): number {
  const previousStep = Math.ceil(stepsUp(zoomLevel) - 1e-9) - 1;
  return Math.max(ZOOM_STEP ** previousStep, MIN_ZOOM);
}

/**
 * The scroll offset along one axis that keeps the point at the center of the
 * visible area in place when the zoom level changes. `viewportSize` is the
 * scroll container's size before the change, and `newViewportSize` after it,
 * when the container grows or shrinks with the diagram. `padding` is the
 * container's padding before the diagram. The browser clamps an offset past
 * the end; this clamps one before the start.
 */
export function scrollOffsetAfterZoom(
  {
    scrollOffset,
    viewportSize,
    newViewportSize = viewportSize,
    padding,
  }: {
    scrollOffset: number;
    viewportSize: number;
    newViewportSize?: number;
    padding: number;
  },
  { fromZoom, toZoom }: { fromZoom: number; toZoom: number },
): number {
  const centerAtBaseSize =
    (scrollOffset + viewportSize / 2 - padding) / fromZoom;
  return Math.max(centerAtBaseSize * toZoom + padding - newViewportSize / 2, 0);
}
