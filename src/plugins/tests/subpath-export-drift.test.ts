import { describe, expect, it } from "vitest";
import packageJson from "../../../package.json" with { type: "json" };
import tsupConfig from "../../../tsup.config.js";
import { findSubpathExportDrift } from "./subpath-export-drift.js";

function pluginExport(pluginName: string) {
  return {
    import: `./dist/plugins/${pluginName}.js`,
    types: `./dist/plugins/${pluginName}.d.ts`,
  };
}

const rootExport = { import: "./dist/index.js", types: "./dist/index.d.ts" };

describe("findSubpathExportDrift", () => {
  it("reports a plugin build entry with no package export", () => {
    const driftProblems = findSubpathExportDrift({
      buildEntries: ["index", "plugins/foo", "plugins/bar"],
      packageExports: { ".": rootExport, "./foo": pluginExport("foo") },
    });
    expect(driftProblems).toEqual([
      'build entry "plugins/bar" has no package export "./bar"',
    ]);
  });

  it("reports a package export with no build entry", () => {
    const driftProblems = findSubpathExportDrift({
      buildEntries: ["index", "plugins/foo"],
      packageExports: {
        ".": rootExport,
        "./foo": pluginExport("foo"),
        "./bar": pluginExport("bar"),
      },
    });
    expect(driftProblems).toEqual([
      'package export "./bar" has no build entry "plugins/bar"',
    ]);
  });

  it("reports an export whose files don't point at its build entry's output", () => {
    const driftProblems = findSubpathExportDrift({
      buildEntries: ["index", "plugins/foo"],
      packageExports: { ".": rootExport, "./foo": pluginExport("other") },
    });
    expect(driftProblems).toEqual([
      'package export "./foo" should be {"import":"./dist/plugins/foo.js","types":"./dist/plugins/foo.d.ts"}',
    ]);
  });

  it("reports an internal sibling module that is exported", () => {
    const driftProblems = findSubpathExportDrift({
      buildEntries: ["index", "plugins/foo", "plugins/foo/page-script"],
      packageExports: {
        ".": rootExport,
        "./foo": pluginExport("foo"),
        "./foo/page-script": pluginExport("foo/page-script"),
      },
    });
    expect(driftProblems).toEqual([
      'package export "./foo/page-script" exposes internal module "plugins/foo/page-script"',
    ]);
  });

  it("reports a root re-exported plugin with no build entry", () => {
    const driftProblems = findSubpathExportDrift({
      buildEntries: ["index", "plugins/foo"],
      packageExports: { ".": rootExport, "./foo": pluginExport("foo") },
      rootIndexSource: [
        'export { foo } from "./plugins/foo/index.js";',
        'export { bar } from "./plugins/bar.js";',
      ].join("\n"),
    });
    expect(driftProblems).toEqual([
      'plugin "bar" is re-exported from src/index.ts but has no build entry "plugins/bar"',
    ]);
  });

  it("ignores non-entry exports such as styles, and internal modules with no export", () => {
    const driftProblems = findSubpathExportDrift({
      buildEntries: ["index", "plugins/foo", "plugins/foo/route"],
      packageExports: {
        ".": rootExport,
        "./foo": pluginExport("foo"),
        "./styles/*": "./dist/styles/*",
      },
      rootIndexSource: 'export { foo } from "./plugins/foo/index.js";',
    });
    expect(driftProblems).toEqual([]);
  });
});

describe("this package", () => {
  it("has a subpath export for every plugin build entry and no others", async () => {
    const { readFile } = await import("node:fs/promises");
    const rootIndexSource = await readFile(
      new URL("../../index.ts", import.meta.url),
      "utf8",
    );
    const resolvedTsupConfig = tsupConfig as { entry: Record<string, string> };
    const driftProblems = findSubpathExportDrift({
      buildEntries: Object.keys(resolvedTsupConfig.entry),
      packageExports: packageJson.exports,
      rootIndexSource,
    });
    expect(driftProblems).toEqual([]);
  });
});
