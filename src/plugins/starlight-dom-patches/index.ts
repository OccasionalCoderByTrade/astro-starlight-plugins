import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";
import { pluginStylesImportScript } from "../utils/plugin-styles.js";
import { siblingModuleUrl } from "../utils/sibling-module-url.js";

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
   * Prepend icons to links based on their destination.
   * Each key enables a specific icon; omitting a key or setting it to `false` disables it.
   */
  decorateExternalLinks?: {
    /** Prepend a YouTube play-button icon to links pointing to youtube.com or youtu.be. */
    youtube?: boolean;
  };
  /**
   * @deprecated Use `limitDetailsElementHeight` instead.
   */
  wrapDetailsContent?: boolean;
}

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
    decorateExternalLinks,
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
        const pageScriptUrl = siblingModuleUrl(
          import.meta.url,
          "starlight-dom-patches",
          "page-script",
        );

        const stylesheetNames = [
          offerTabbedContent || offerToggleAllDetails ? "action-panel" : null,
          offerTabbedContent ? "tabbed-content" : null,
          limitDetailsElementHeight
            ? "details-height-limited"
            : "details-height-unlimited",
          decorateExternalLinks ? "link-icons" : null,
        ].filter((stylesheetName) => stylesheetName !== null);
        injectScript(
          "page-ssr",
          pluginStylesImportScript(
            stylesheetNames.map(
              (stylesheetName) =>
                `plugins/starlight-dom-patches/styles/${stylesheetName}`,
            ),
          ),
        );

        const scriptPath = JSON.stringify(fileURLToPath(pageScriptUrl));
        const imports = [
          hideSingleLineGutters ? "hideSingleLineGutters" : null,
          syncTocLabelsFromHeadings ? "syncTocLabelsFromHeadings" : null,
          limitDetailsElementHeight ? "limitDetailsElementHeight" : null,
          offerTabbedContent ? "tabbedH2Content" : null,
          offerToggleAllDetails ? "toggleAllDetails" : null,
          decorateExternalLinks ? "decorateExternalLinks" : null,
        ].filter(Boolean);

        if (imports.length === 0) return;

        const calls = imports
          .map((functionName) => {
            if (
              functionName === "decorateExternalLinks" &&
              decorateExternalLinks
            ) {
              return `${functionName}(${JSON.stringify(decorateExternalLinks)});`;
            }
            return `${functionName}();`;
          })
          .join("\n");
        injectScript(
          "page",
          `import { ${imports.join(", ")} } from ${scriptPath};\n${calls}`,
        );
      },
    },
  };
}
