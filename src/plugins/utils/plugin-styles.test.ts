import { describe, expect, it } from "vitest";
import { pluginStylesImportScript } from "./plugin-styles.js";

describe("pluginStylesImportScript", () => {
  it("imports the source SCSS when run from source", () => {
    const importScript = pluginStylesImportScript(
      ["styles/tokens", "plugins/foo/styles"],
      "/repo/src/plugins/utils/plugin-styles.ts",
    );
    expect(importScript).toBe(
      [
        'import "/repo/src/styles/tokens.scss";',
        'import "/repo/src/plugins/foo/styles.scss";',
      ].join("\n"),
    );
  });

  it("imports the compiled CSS when bundled into a plugin entry", () => {
    const importScript = pluginStylesImportScript(
      ["plugins/foo/styles"],
      "/repo/node_modules/pkg/dist/plugins/foo.js",
    );
    expect(importScript).toBe(
      'import "/repo/node_modules/pkg/dist/plugins/foo/styles.css";',
    );
  });

  it("imports the compiled CSS when bundled into a chunk at the dist root", () => {
    const importScript = pluginStylesImportScript(
      ["styles/tokens"],
      "/repo/node_modules/pkg/dist/chunk-ABC123.js",
    );
    expect(importScript).toBe(
      'import "/repo/node_modules/pkg/dist/styles/tokens.css";',
    );
  });

  it("imports the compiled CSS when bundled into a nested internal module", () => {
    const importScript = pluginStylesImportScript(
      ["styles/tokens"],
      "/repo/node_modules/pkg/dist/plugins/foo/dev-middleware.js",
    );
    expect(importScript).toBe(
      'import "/repo/node_modules/pkg/dist/styles/tokens.css";',
    );
  });
});
