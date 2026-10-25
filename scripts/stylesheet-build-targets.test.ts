import { describe, expect, it } from "vitest";
import { stylesheetBuildTargets } from "./stylesheet-build-targets.js";

describe("stylesheetBuildTargets", () => {
  it("compiles each stylesheet under src/plugins and src/styles to the same path under dist", () => {
    expect(
      stylesheetBuildTargets([
        "plugins/foo/styles.scss",
        "styles/components/toggle.scss",
      ]),
    ).toEqual([
      {
        sourceRelativeFilePath: "plugins/foo/styles.scss",
        outputRelativeFilePath: "plugins/foo/styles.css",
      },
      {
        sourceRelativeFilePath: "styles/components/toggle.scss",
        outputRelativeFilePath: "styles/components/toggle.css",
      },
    ]);
  });

  it("skips partials, other file types and stylesheets outside src/plugins and src/styles", () => {
    expect(
      stylesheetBuildTargets([
        "styles/_mixins.scss",
        "plugins/foo/_shared.scss",
        "plugins/foo/index.ts",
        "content/site.scss",
      ]),
    ).toEqual([]);
  });
});
