import { ZOOM_LABELS } from "./zoom-labels.js";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  scrollOffsetAfterZoom,
  zoomIn,
  zoomOut,
} from "./zoom-levels.js";

/**
 * Set inline with `important` on the zoom view's clone, so the block's own
 * classes, which carry over, can't resize, cap or move it: a `w-50` or
 * `min-vw-100` would resolve against the viewport, an `mw-100` would cap the
 * zoom, an `m-0` would stop centering it and a `flex-shrink-1` would squeeze it.
 * A class's CSS `zoom` is already in the on-page size the clone starts from, so
 * applying it again would scale the clone twice.
 * Auto margins center a small diagram without cutting off a scrolled large one.
 */
const ZOOMED_DIAGRAM_BOX_STYLE = {
  zoom: "1",
  "min-width": "0",
  "min-height": "0",
  "max-width": "none",
  "max-height": "none",
  margin: "auto",
  "flex-shrink": "0",
};

const CAPTION_ID = "tex-zoom-view-caption";

type ZoomAction = "in" | "out" | "reset";

/** The zoom level each zoom action moves to from `zoomLevel`. */
const ZOOM_ACTIONS: Record<ZoomAction, (zoomLevel: number) => number> = {
  in: zoomIn,
  out: zoomOut,
  reset: () => MIN_ZOOM,
};

/** The zoom action each key triggers while the zoom view is open. */
const ZOOM_ACTION_BY_KEY: Record<string, ZoomAction> = {
  "+": "in",
  "=": "in",
  "-": "out",
  "0": "reset",
};

interface ZoomView {
  dialog: HTMLDialogElement;
  viewport: HTMLElement;
  caption: HTMLElement;
  zoomOutButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  zoomInButton: HTMLButtonElement;
  /** The clone of the compiled tex diagram on show. */
  diagram?: SVGSVGElement;
  /** The diagram's size on the page, in px, which is 1x. */
  baseSize: { width: number; height: number };
  zoomLevel: number;
}

function toolbarButton({
  action,
  label,
  text,
}: {
  action: ZoomAction | "close";
  label: string;
  text: string;
}): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tex-zoom-view__button";
  button.dataset.zoomAction = action;
  button.setAttribute("aria-label", label);
  button.textContent = text;
  return button;
}

/** The one tex diagram zoom view every zoom button opens, added to the page on first use. */
function createZoomView(): ZoomView {
  const dialog = document.createElement("dialog");
  dialog.className = "tex-zoom-view";

  const toolbar = document.createElement("div");
  toolbar.className = "tex-zoom-view__toolbar";
  const zoomOutButton = toolbarButton({
    action: "out",
    label: ZOOM_LABELS.zoomOut,
    text: "−",
  });
  const resetButton = toolbarButton({
    action: "reset",
    label: ZOOM_LABELS.resetZoom,
    text: "100%",
  });
  resetButton.classList.add("tex-zoom-view__button--level");
  const zoomInButton = toolbarButton({
    action: "in",
    label: ZOOM_LABELS.zoomIn,
    text: "+",
  });
  const closeButton = toolbarButton({
    action: "close",
    label: ZOOM_LABELS.close,
    text: "×",
  });
  closeButton.classList.add("tex-zoom-view__button--close");
  closeButton.autofocus = true;
  toolbar.append(zoomOutButton, resetButton, zoomInButton, closeButton);

  const viewport = document.createElement("div");
  viewport.className = "tex-zoom-view__viewport";

  const caption = document.createElement("p");
  caption.className = "tex-zoom-view__caption";
  caption.id = CAPTION_ID;

  dialog.append(toolbar, viewport, caption);
  document.body.append(dialog);

  const zoomView: ZoomView = {
    dialog,
    viewport,
    caption,
    zoomOutButton,
    resetButton,
    zoomInButton,
    baseSize: { width: 0, height: 0 },
    zoomLevel: MIN_ZOOM,
  };

  dialog.addEventListener("click", (event) => {
    // The viewport fills the dialog, so a click beside the diagram lands on
    // it rather than on the backdrop.
    if (event.target === dialog || event.target === viewport) {
      dialog.close();
      return;
    }
    const action = (event.target as Element).closest<HTMLElement>(
      "[data-zoom-action]",
    )?.dataset.zoomAction;
    if (action === "close") {
      dialog.close();
    } else if (action !== undefined) {
      applyZoomAction(zoomView, action as ZoomAction);
    }
  });

  dialog.addEventListener("keydown", (event) => {
    // Leave the browser's own page zoom alone.
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const action = ZOOM_ACTION_BY_KEY[event.key];
    if (action === undefined) return;
    applyZoomAction(zoomView, action);
    event.preventDefault();
  });

  return zoomView;
}

function applyZoomAction(zoomView: ZoomView, action: ZoomAction): void {
  setZoomLevel(zoomView, ZOOM_ACTIONS[action](zoomView.zoomLevel));
}

/** Resizes the diagram to `zoomLevel`, keeping the center of the visible area in place. */
function setZoomLevel(zoomView: ZoomView, zoomLevel: number): void {
  const { diagram, viewport, baseSize } = zoomView;
  if (!diagram) return;
  const zoomChange = { fromZoom: zoomView.zoomLevel, toZoom: zoomLevel };
  const viewportStyle = getComputedStyle(viewport);
  const scrollBefore = {
    left: viewport.scrollLeft,
    top: viewport.scrollTop,
    width: viewport.clientWidth,
    height: viewport.clientHeight,
  };

  zoomView.zoomLevel = zoomLevel;
  // `important` beats a block class's own `!important` size, such as
  // Bootstrap's `w-50`, which would resolve against the viewport instead.
  // ZOOMED_DIAGRAM_BOX_STYLE does the same for the rest of the clone's box.
  diagram.style.setProperty(
    "width",
    `${baseSize.width * zoomLevel}px`,
    "important",
  );
  diagram.style.setProperty(
    "height",
    `${baseSize.height * zoomLevel}px`,
    "important",
  );
  viewport.scrollTo(
    scrollOffsetAfterZoom(
      {
        scrollOffset: scrollBefore.left,
        viewportSize: scrollBefore.width,
        padding: parseFloat(viewportStyle.paddingLeft),
      },
      zoomChange,
    ),
    scrollOffsetAfterZoom(
      {
        scrollOffset: scrollBefore.top,
        viewportSize: scrollBefore.height,
        padding: parseFloat(viewportStyle.paddingTop),
      },
      zoomChange,
    ),
  );

  const zoomPercentage = `${Math.round(zoomLevel * 100)}%`;
  zoomView.resetButton.textContent = zoomPercentage;
  zoomView.resetButton.setAttribute(
    "aria-label",
    `${ZOOM_LABELS.resetZoom} (${zoomPercentage})`,
  );
  // aria-disabled, not disabled: disabling the focused button would drop
  // focus out of the dialog, and its keyboard shortcuts with it.
  zoomView.zoomOutButton.setAttribute(
    "aria-disabled",
    String(zoomLevel <= MIN_ZOOM),
  );
  zoomView.zoomInButton.setAttribute(
    "aria-disabled",
    String(zoomLevel >= MAX_ZOOM),
  );
}

function openZoomView(zoomView: ZoomView, zoomFrame: HTMLElement): void {
  const diagram = zoomFrame.querySelector<SVGSVGElement>(
    ":scope > svg.tex-compiled",
  );
  if (!diagram || zoomView.dialog.open) return;

  const { width, height } = diagram.getBoundingClientRect();
  // Ids stay as they are: the original's identical definitions are on the page (ADR 0019).
  const clonedDiagram = diagram.cloneNode(true) as SVGSVGElement;
  clonedDiagram.setAttribute("aria-hidden", "true");
  for (const [property, value] of Object.entries(ZOOMED_DIAGRAM_BOX_STYLE)) {
    clonedDiagram.style.setProperty(property, value, "important");
  }
  // Kept until the next open, so the closing animation still shows it.
  zoomView.viewport.replaceChildren(clonedDiagram);
  zoomView.diagram = clonedDiagram;
  zoomView.baseSize = { width, height };
  zoomView.zoomLevel = MIN_ZOOM;

  const captionText = zoomFrame.dataset.caption;
  zoomView.caption.textContent = captionText ?? "";
  zoomView.caption.hidden = captionText === undefined;
  if (captionText !== undefined) {
    zoomView.dialog.removeAttribute("aria-label");
    zoomView.dialog.setAttribute("aria-labelledby", CAPTION_ID);
  } else {
    zoomView.dialog.removeAttribute("aria-labelledby");
    zoomView.dialog.setAttribute("aria-label", ZOOM_LABELS.uncaptionedView);
  }

  zoomView.dialog.showModal();
  setZoomLevel(zoomView, MIN_ZOOM);
}

/**
 * Opens the tex diagram zoom view from any zoom button. One listener on the document covers
 * buttons on pages swapped in by Astro's client router too.
 */
export function initTexZoomView(): void {
  let zoomView: ZoomView | undefined;
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const zoomFrame = event.target
      .closest(".tex-zoom-button")
      ?.closest<HTMLElement>(".tex-zoom-frame");
    if (!zoomFrame) return;
    // A client-routed page swap replaces the body, dropping the dialog.
    if (!zoomView?.dialog.isConnected) zoomView = createZoomView();
    openZoomView(zoomView, zoomFrame);
  });
}
