import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveTexInputDirs } from "./tex-inputs.js";
import { makeProject } from "./test-project.js";
import { compileLatexToSvg } from "./utils.js";

const hasToolchain = ["pdflatex", "dvisvgm"].every(
  (tool) => spawnSync(tool, ["--version"]).status === 0,
);

const documentWith = (preamble: string, body: string) =>
  [
    "\\documentclass{standalone}",
    preamble,
    "\\begin{document}",
    body,
    "\\end{document}",
  ].join("\n");

describe.skipIf(!hasToolchain)("compileLatexToSvg", () => {
  it("resolves \\input from a tex input dir, including its subdirectories", async () => {
    const rootDirPath = makeProject({
      "src/latex/nested/macros.tex": "\\newcommand{\\greeting}{hello}\n",
    });

    const outcome = await compileLatexToSvg(
      documentWith("\\input{macros}", "\\greeting"),
      join(rootDirPath, "public/svgs"),
      resolveTexInputDirs(rootDirPath, ["src/latex//"]),
    );

    expect(outcome.ok).toBe(true);
    expect(outcome.ok && existsSync(outcome.svgPath)).toBe(true);
  });

  it("can't \\input a file outside the tex input dirs by a path relative to the project root", async () => {
    const rootDirPath = makeProject({
      "src/latex/macros.tex": "\\newcommand{\\greeting}{hello}\n",
    });
    const originalCwd = process.cwd();
    process.chdir(rootDirPath); // Astro runs from the project root
    try {
      const outcome = await compileLatexToSvg(
        documentWith("\\input{src/latex/macros}", "\\greeting"),
        join(rootDirPath, "public/svgs"),
      );

      expect(outcome.ok).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("names the tex input file an error occurred in", async () => {
    const rootDirPath = makeProject({
      "src/latex/macros.tex":
        "\\newcommand{\\broken}{\\undefinedmacro}\n\\broken\n",
    });

    const outcome = await compileLatexToSvg(
      documentWith("", "\\input{macros}"),
      join(rootDirPath, "public/svgs"),
      resolveTexInputDirs(rootDirPath, ["src/latex/"]),
    );

    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.failure).toEqual(
      expect.objectContaining({
        kind: "latex",
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: "Undefined control sequence.",
            filePath: relative(
              process.cwd(),
              join(rootDirPath, "src/latex/macros.tex"),
            ),
            line: 2,
          }),
        ]),
      }),
    );
  });
});
