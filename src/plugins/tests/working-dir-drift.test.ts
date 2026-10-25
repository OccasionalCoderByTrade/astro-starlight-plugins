import { readdir, readFile } from "node:fs/promises";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findWorkingDirUses } from "./working-dir-drift.js";

describe("findWorkingDirUses", () => {
  it("reports each line that reads the working directory", () => {
    const workingDirProblems = findWorkingDirUses([
      {
        relativeFilePath: "foo/index.ts",
        source: [
          'const a = "a";',
          "const b = relative(process.cwd(), filePath);",
          "const c = process.cwd ();",
        ].join("\n"),
      },
    ]);
    expect(workingDirProblems).toEqual([
      "foo/index.ts:2 reads process.cwd()",
      "foo/index.ts:3 reads process.cwd()",
    ]);
  });

  it("accepts code that doesn't read the working directory", () => {
    const workingDirProblems = findWorkingDirUses([
      {
        relativeFilePath: "foo/index.ts",
        source: "const displayPath = toDisplayPath(rootDirPath, filePath);",
      },
    ]);
    expect(workingDirProblems).toEqual([]);
  });
});

describe("this package", () => {
  it("has no plugin code that reads the working directory", async () => {
    const pluginsDirPath = fileURLToPath(new URL("..", import.meta.url));
    const relativeFilePaths = (
      await readdir(pluginsDirPath, { recursive: true })
    ).filter(
      (relativeFilePath) =>
        relativeFilePath.endsWith(".ts") &&
        !relativeFilePath.endsWith(".test.ts") &&
        !relativeFilePath.startsWith(`tests${sep}`),
    );
    const files = await Promise.all(
      relativeFilePaths.map(async (relativeFilePath) => ({
        relativeFilePath,
        source: await readFile(join(pluginsDirPath, relativeFilePath), "utf8"),
      })),
    );
    expect(findWorkingDirUses(files)).toEqual([]);
  });
});
