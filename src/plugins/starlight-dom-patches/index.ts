import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";

const css = String.raw;
const js = String.raw;

export interface DomPatchesOptions {
  /** Hide line number gutters on single-line code blocks. @default false */
  hideSingleLineGutters?: boolean;
  /** Copy rendered heading innerHTML into matching Starlight TOC anchor labels. @default false */
  syncTocLabelsFromHeadings?: boolean;
  /** Limit the height of expanded `<details>` elements and make their content scrollable. @default false */
  limitDetailsElementHeight?: boolean;
  /**
   * Inject a toggle checkbox (after `#starlight__on-this-page`) that reorganises page content
   * into tabs driven by `<h2>` boundaries. Toggle state is persisted to localStorage.
   * @default false
   */
  offerTabbedContent?: boolean;
  /**
   * Inject a "Expand All Dropdowns" toggle checkbox that opens or closes every
   * `<details>` element on the page at once. Only appears on pages that contain
   * at least one visible `<details>` element.
   * @default false
   */
  offerToggleAllDetails?: boolean;
  /**
   * @deprecated Use `limitDetailsElementHeight` instead.
   */
  wrapDetailsContent?: boolean;
}

type ConditionalCssEntry = { enabled?: string; disabled?: string };

const CONDITIONAL_CSS: Partial<
  Record<keyof DomPatchesOptions, ConditionalCssEntry>
> = {
  limitDetailsElementHeight: {
    enabled: css`
      .main-pane details[open] {
        max-width: 100%;
      }

      .main-pane details > summary {
        padding-left: 1.1em;
      }

      .main-pane details[open] > div.details-wrapper {
        overflow: auto;
        max-height: 67vh;
        padding: 0 1em;
      }

      .main-pane details[open] p > img {
        height: auto;
        width: auto;
      }
    `,
    disabled: css`
      .main-pane details {
        padding-left: 1rem;
        padding-right: 1rem;
      }
    `,
  },
};

/**
 * Astro integration that injects a client-side script to apply DOM patches
 * on every page. Each patch can be individually enabled or disabled via options.
 */
export function starlightDomPatches(
  options: DomPatchesOptions = {},
): AstroIntegration {
  const {
    hideSingleLineGutters = false,
    syncTocLabelsFromHeadings = false,
    limitDetailsElementHeight: limitDetailsElementHeightOption = false,
    offerTabbedContent = false,
    offerToggleAllDetails = false,
    wrapDetailsContent,
  } = options;

  if (wrapDetailsContent !== undefined) {
    console.warn(
      "[starlight-dom-patches] `wrapDetailsContent` is deprecated — use `limitDetailsElementHeight` instead.",
    );
  }

  const limitDetailsElementHeight =
    wrapDetailsContent ?? limitDetailsElementHeightOption;

  return {
    name: "starlight-dom-patches",
    hooks: {
      "astro:config:setup": ({ injectScript }) => {
        const currentFile = fileURLToPath(import.meta.url);
        let pageScriptUrl: URL;
        if (currentFile.endsWith(".ts")) {
          pageScriptUrl = new URL("./page-script.ts", import.meta.url);
        } else if (currentFile.endsWith("starlight-dom-patches.js")) {
          pageScriptUrl = new URL(
            "./starlight-dom-patches/page-script.js",
            import.meta.url,
          );
        } else {
          pageScriptUrl = new URL(
            "./plugins/starlight-dom-patches/page-script.js",
            import.meta.url,
          );
        }

        for (const [key, entry] of Object.entries(CONDITIONAL_CSS) as [
          keyof DomPatchesOptions,
          ConditionalCssEntry,
        ][]) {
          const cssString = options[key] ? entry.enabled : entry.disabled;
          if (cssString) {
            injectScript(
              "page",
              js`{ const s = document.createElement("style"); s.textContent = ${JSON.stringify(cssString)}; document.head.appendChild(s); }`,
            );
          }
        }

        const scriptPath = JSON.stringify(fileURLToPath(pageScriptUrl));
        const imports = [
          hideSingleLineGutters ? "hideSingleLineGutters" : null,
          syncTocLabelsFromHeadings ? "syncTocLabelsFromHeadings" : null,
          limitDetailsElementHeight ? "limitDetailsElementHeight" : null,
          offerTabbedContent ? "tabbedH2Content" : null,
          offerToggleAllDetails ? "toggleAllDetails" : null,
        ].filter(Boolean);

        if (imports.length === 0) return;

        const calls = imports.map((fn) => `${fn}();`).join("\n");
        injectScript(
          "page",
          `import { ${imports.join(", ")} } from ${scriptPath};\n${calls}`,
        );
      },
    },
  };
}
