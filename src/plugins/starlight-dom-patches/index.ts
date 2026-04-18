import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";

export interface DomPatchesOptions {
  /** Hide line number gutters on single-line code blocks. @default false */
  hideSingleLineGutters?: boolean;
  /** Copy rendered heading innerHTML into matching Starlight TOC anchor labels. @default false */
  syncTocLabelsFromHeadings?: boolean;
  /** Wrap `<details>` content (excluding `<summary>`) in a `.details-wrapper` div. @default false */
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
    wrapDetailsContent = false,
  } = options;

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

        const scriptPath = JSON.stringify(fileURLToPath(pageScriptUrl));
        const imports = [
          hideSingleLineGutters ? "hideSingleLineGutters" : null,
          syncTocLabelsFromHeadings ? "syncTocLabelsFromHeadings" : null,
          wrapDetailsContent ? "wrapDetailsContent" : null,
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
