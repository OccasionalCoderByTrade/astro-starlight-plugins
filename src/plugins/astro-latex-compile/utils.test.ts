import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  const svgOutputDir = () =>
    join(mkdtempSync(join(tmpdir(), "latex-compile-utils-")), "svgs");

  it("keeps a diagram's text as selectable text by default", async () => {
    const outcome = await compileLatexToSvg(
      documentWith("", "Hello $x$"),
      svgOutputDir(),
    );

    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.svgMarkup).toMatch(/<text[^>]*>Hello<\/text>/);
  });

  it("turns a diagram's text into shapes in pdf compile mode", async () => {
    const outcome = await compileLatexToSvg(
      documentWith("", "Hello $x$"),
      svgOutputDir(),
      { compileMode: "pdf" },
    );

    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.svgMarkup).not.toContain("<text");
  });

  it("gives the same block a different compiled tex diagram per compile mode", async () => {
    const outputDir = svgOutputDir();
    const latexCode = documentWith("", "Hello");

    const dviOutcome = await compileLatexToSvg(latexCode, outputDir);
    const pdfOutcome = await compileLatexToSvg(latexCode, outputDir, {
      compileMode: "pdf",
    });

    expect(dviOutcome.ok && pdfOutcome.ok).toBe(true);
    expect(dviOutcome.ok && pdfOutcome.ok && dviOutcome.hash).not.toBe(
      pdfOutcome.ok && pdfOutcome.hash,
    );
  });

  it("sizes a diagram the same in both compile modes", async () => {
    const outputDir = svgOutputDir();
    const latexCode = [
      "\\documentclass[border=5pt]{standalone}",
      "\\usepackage{tikz}",
      "\\begin{document}",
      "\\begin{tikzpicture}\\draw (0,0) -- (3,1);\\end{tikzpicture}",
      "\\end{document}",
    ].join("\n");
    const sizeOf = (svgMarkup: string) =>
      [/width='([\d.]+)pt'/, /height='([\d.]+)pt'/].map((pattern) =>
        Number(svgMarkup.match(pattern)?.[1]),
      );

    const dviOutcome = await compileLatexToSvg(latexCode, outputDir);
    const pdfOutcome = await compileLatexToSvg(latexCode, outputDir, {
      compileMode: "pdf",
    });

    expect(dviOutcome.ok && pdfOutcome.ok).toBe(true);
    if (!dviOutcome.ok || !pdfOutcome.ok) return;
    const [dviWidth, dviHeight] = sizeOf(dviOutcome.svgMarkup);
    const [pdfWidth, pdfHeight] = sizeOf(pdfOutcome.svgMarkup);
    expect(dviWidth).toBeCloseTo(pdfWidth, 0);
    expect(dviHeight).toBeCloseTo(pdfHeight, 0);
  });

  it("writes a compiled tex diagram whose ids, classes and fonts are scoped to it", async () => {
    const outcome = await compileLatexToSvg(
      documentWith("", "Hello $x$"),
      svgOutputDir(),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const writtenMarkup = readFileSync(outcome.svgPath, "utf-8");
    expect(writtenMarkup).toBe(outcome.svgMarkup);
    expect(writtenMarkup.startsWith("<svg")).toBe(true);
    expect(writtenMarkup).not.toMatch(/\sid='(?!tex-)/);
    expect(writtenMarkup).not.toMatch(/\sclass='(?!tex-)/);
    expect(writtenMarkup).not.toMatch(/font-family:(?!tex-)/);
  });

  it("serves a cache hit with the same markup it compiled", async () => {
    const outputDir = svgOutputDir();
    const latexCode = documentWith("", "Hello");

    const firstOutcome = await compileLatexToSvg(latexCode, outputDir);
    const secondOutcome = await compileLatexToSvg(latexCode, outputDir);

    expect(secondOutcome.ok && secondOutcome.wasCompiled).toBe(false);
    expect(secondOutcome.ok && secondOutcome.svgMarkup).toBe(
      firstOutcome.ok && firstOutcome.svgMarkup,
    );
  });

  it("resolves \\input from a tex input dir, including its subdirectories", async () => {
    const rootDirPath = makeProject({
      "src/latex/nested/macros.tex": "\\newcommand{\\greeting}{hello}\n",
    });

    const outcome = await compileLatexToSvg(
      documentWith("\\input{macros}", "\\greeting"),
      join(rootDirPath, "public/svgs"),
      { texInputDirs: resolveTexInputDirs(rootDirPath, ["src/latex//"]) },
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

  it("can't \\input a file by an absolute path, which the hash wouldn't track", async () => {
    const rootDirPath = makeProject({
      "src/latex/macros.tex": "\\newcommand{\\greeting}{hello}\n",
    });

    const outcome = await compileLatexToSvg(
      documentWith(
        `\\input{${join(rootDirPath, "src/latex/macros")}}`,
        "\\greeting",
      ),
      join(rootDirPath, "public/svgs"),
    );

    expect(outcome.ok).toBe(false);
  });

  it("names the tex input file an error occurred in", async () => {
    const rootDirPath = makeProject({
      "src/latex/macros.tex":
        "\\newcommand{\\broken}{\\undefinedmacro}\n\\broken\n",
    });

    const outcome = await compileLatexToSvg(
      documentWith("", "\\input{macros}"),
      join(rootDirPath, "public/svgs"),
      { texInputDirs: resolveTexInputDirs(rootDirPath, ["src/latex/"]) },
    );

    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.failure).toEqual(
      expect.objectContaining({
        kind: "latex",
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: "Undefined control sequence.",
            filePath: join(rootDirPath, "src/latex/macros.tex"),
            line: 2,
          }),
        ]),
      }),
    );
  });
});
