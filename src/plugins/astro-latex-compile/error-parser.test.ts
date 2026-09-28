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

  it("falls back to a generic error when the log has none", () => {
    expect(parseLatexErrors("")).toEqual([
      expect.objectContaining({
        severity: "error",
        message: "Unknown LaTeX compilation error",
      }),
    ]);
  });
});
