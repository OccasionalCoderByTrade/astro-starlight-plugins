import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseLatexErrors } from "./error-parser.js";

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf-8");

describe("parseLatexErrors", () => {
  it("extracts the error message and source line from a pdflatex log", () => {
    const errors = parseLatexErrors(fixture("undefined-macro.pdflatex.txt"));

    expect(errors).toEqual([
      expect.objectContaining({
        severity: "error",
        message: "Undefined control sequence.",
        line: 6,
      }),
    ]);
  });

  it("attributes a -file-line-error error to the tex input file it occurred in", () => {
    const output = [
      "(/project/src/latex/macros.tex",
      "/project/src/latex/macros.tex:2: Undefined control sequence.",
      "\\broken ->\\undefinedmacro",
      "",
      "l.2 \\broken",
    ].join("\n");

    const errors = parseLatexErrors(output, {
      blockFilePath: "/tmp/latex-compile-1/diagram.tex",
    });

    expect(errors).toEqual([
      expect.objectContaining({
        message: "Undefined control sequence.",
        line: 2,
        filePath: "/project/src/latex/macros.tex",
      }),
    ]);
  });

  it("gives a -file-line-error error in the block a line and no file", () => {
    const output = [
      "! LaTeX Error: File `missing.tex' not found.",
      "",
      "Type X to quit or <RETURN> to proceed,",
      "or enter new name. (Default extension: tex)",
      "",
      "Enter file name: ",
      "/tmp/latex-compile-1/diagram.tex:3: Emergency stop.",
      "<read *> ",
      "",
      "l.3 \\input{missing}",
    ].join("\n");

    const errors = parseLatexErrors(output, {
      blockFilePath: "/tmp/latex-compile-1/diagram.tex",
    });

    expect(errors).toEqual([
      expect.objectContaining({
        message: "LaTeX Error: File `missing.tex' not found.",
        line: undefined,
        filePath: undefined,
      }),
      expect.objectContaining({
        message: "Emergency stop.",
        line: 3,
        filePath: undefined,
      }),
    ]);
  });

  it("falls back to a generic error when the log has none", () => {
    expect(parseLatexErrors("")).toEqual([
      expect.objectContaining({
        severity: "error",
        message: "Unknown LaTeX compilation error",
      }),
    ]);
  });
});
