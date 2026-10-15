import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { parseLatexErrors } from "./error-parser.js";
import {
  renderConsole,
  renderHtml,
  writeDebugImage,
  type TexCompileFailure,
} from "./tex-compile-error.js";

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf-8");

// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

const source = fixture("undefined-macro.tex");
const latexFailure: TexCompileFailure = {
  kind: "latex",
  errors: parseLatexErrors(fixture("undefined-macro.pdflatex.txt")),
  source,
};

describe("renderConsole", () => {
  it("reports each LaTeX error with its line, followed by the numbered source", () => {
    const out = stripAnsi(renderConsole(latexFailure, "docs/a.md:12"));

    expect(out).toContain("[astro-latex-compile] docs/a.md:12");
    expect(out).toContain("Error (line 6): Undefined control sequence.");
    expect(out).toContain("LaTeX source:");
    expect(out).toContain("[6]:   \\undefinedmacro");
  });

  it("names the missing tool", () => {
    const out = renderConsole(
      { kind: "toolchain-missing", tool: "dvisvgm" },
      "docs/a.md:12",
    );
    expect(out).toContain("dvisvgm not found on PATH");
  });
});

describe("renderHtml", () => {
  const parse = (html: string) =>
    new JSDOM(html).window.document.body.firstElementChild!;

  it("shows the location, the errors, and highlights the failing source line", () => {
    const el = parse(renderHtml(latexFailure, "docs/a.md:12", source));

    expect(el.textContent).toContain("docs/a.md:12");
    expect(el.textContent).toContain(
      "Error (line 6): Undefined control sequence.",
    );
    const highlighted = [...el.querySelectorAll("code > span")].filter((s) =>
      s.getAttribute("style")?.includes("--cannoli-error-low"),
    );
    expect(highlighted.map((s) => s.textContent)).toEqual([
      "6 │   \\undefinedmacro",
    ]);
  });

  it("names the tex input file of an error in it, and highlights no block line", () => {
    const failure: TexCompileFailure = {
      kind: "latex",
      errors: [
        {
          message: "Undefined control sequence.",
          line: 2,
          filePath: "src/latex/macros.tex",
          context: [],
          severity: "error",
        },
      ],
      source: "\\documentclass{standalone}\n\\input{macros}\n\\begin{document}",
    };

    const el = parse(renderHtml(failure, "docs/a.md:12", failure.source));

    expect(el.textContent).toContain(
      "Error (src/latex/macros.tex:2): Undefined control sequence.",
    );
    const highlightedLines = [...el.querySelectorAll("code > span")].filter(
      (lineElement) =>
        lineElement.getAttribute("style")?.includes("--cannoli-error-low"),
    );
    expect(highlightedLines).toEqual([]);
  });

  it("shows the block source for failures without LaTeX errors", () => {
    const el = parse(
      renderHtml(
        { kind: "invalid-block", reason: "Not a LaTeX document." },
        "docs/a.md:12",
        "<b>hi</b>",
      ),
    );

    expect(el.textContent).toContain("Not a LaTeX document.");
    expect(el.querySelector("code")!.textContent).toContain("<b>hi</b>");
  });

  it("shows the message of an unexpected error", () => {
    const el = parse(
      renderHtml(
        { kind: "unexpected", message: "EACCES: permission denied" },
        "docs/a.md:12",
        "",
      ),
    );

    expect(el.textContent).toContain(
      "Unexpected error: EACCES: permission denied",
    );
  });

  it("shows multi-line tool output one line per row", () => {
    const el = parse(
      renderHtml(
        {
          kind: "conversion",
          output: "PDF error: bad xref\ntrailer missing\n",
        },
        "docs/a.md:12",
        "",
      ),
    );

    const summaryRows = [...el.children[1].children].map((d) => d.textContent);
    expect(summaryRows).toEqual([
      "PDF to SVG conversion failed.",
      "Error: PDF error: bad xref",
      "trailer missing",
    ]);
  });
});

describe("writeDebugImage", () => {
  it("writes a JPEG to the given path, creating its directory", async () => {
    const jpgPath = join(
      mkdtempSync(join(tmpdir(), "tex-compile-error-")),
      "nested",
      "a--1-deadbeef.jpg",
    );

    await writeDebugImage(latexFailure, "docs/a.md:12", jpgPath);

    const bytes = readFileSync(jpgPath);
    expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  });
});
