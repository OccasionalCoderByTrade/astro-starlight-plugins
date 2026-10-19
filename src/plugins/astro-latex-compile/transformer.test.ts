import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Code, Html, Root } from "mdast";
import type { VFile } from "vfile";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLedger } from "./ledger.js";
import { writeDebugImage } from "./tex-compile-error.js";
import { latexCompileTransformer } from "./transformer.js";

vi.mock("./tex-compile-error.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./tex-compile-error.js")>()),
  writeDebugImage: vi.fn(async () => {}),
}));

// Not LaTeX documents, so each block fails without TeX installed and still
// writes a debug tex diagram image of its tex compile error.
const block = (line: number, value: string): Code => ({
  type: "code",
  lang: "tex",
  meta: "compile blockid=1",
  value,
  position: {
    start: { line, column: 1 },
    end: { line: line + 2, column: 4 },
  },
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const hasToolchain = ["pdflatex", "dvisvgm"].every(
  (tool) => spawnSync(tool, ["--version"]).status === 0,
);

const documentWith = (body: string) =>
  `\\documentclass{standalone}\n\\begin{document}\n${body}\n\\end{document}`;

const compileBlock = (meta: string, value: string): Code => ({
  type: "code",
  lang: "tex",
  meta: `compile ${meta}`.trim(),
  value,
});

/** Runs the transformer over `blocks` and returns the html each one became. */
async function renderBlocks(
  blocks: Code[],
  options: { svgClassname?: string } = {},
): Promise<string[]> {
  const rootDirPath = mkdtempSync(join(tmpdir(), "latex-compile-transformer-"));
  const ledger = createLedger({
    svgDir: join(rootDirPath, "svgs"),
    removeOrphanedSvgs: false,
    command: "dev",
  });
  await ledger.start();
  const transform = latexCompileTransformer(
    { svgOutputDir: "unused", ...options },
    {
      missingTools: new Set(),
      texCompileErrors: [],
      exitOnMissingToolchain: false,
      ledger,
      rootDirPath,
      texInputDirs: [],
    },
  );
  const tree: Root = { type: "root", children: blocks };
  await transform(tree, { path: join(rootDirPath, "doc.md") } as VFile);
  return tree.children.map((node) => (node as Html).value);
}

const attributeValues = (markup: string, attribute: string) =>
  [...markup.matchAll(new RegExp(`\\s${attribute}='([^']+)'`, "g"))].map(
    (match) => match[1],
  );

describe("latexCompileTransformer", () => {
  it("writes the debug tex diagram image only for the last block sharing a blockid", async () => {
    const root = mkdtempSync(join(tmpdir(), "latex-compile-transformer-"));
    const ledger = createLedger({
      svgDir: join(root, "svgs"),
      debugImageDir: join(root, "debug"),
      removeOrphanedSvgs: false,
      command: "dev",
    });
    await ledger.start();
    const transform = latexCompileTransformer(
      { svgOutputDir: "unused" },
      {
        missingTools: new Set(),
        texCompileErrors: [],
        exitOnMissingToolchain: false,
        ledger,
        rootDirPath: root,
        texInputDirs: [],
      },
    );
    const docPath = join(root, "doc.md");
    const tree: Root = {
      type: "root",
      children: [block(1, "first"), block(5, "second")],
    };

    await transform(tree, { path: docPath } as VFile);

    expect(writeDebugImage).toHaveBeenCalledTimes(1);
    const [, location, path] = vi.mocked(writeDebugImage).mock.calls[0];
    expect(location).toMatch(/doc\.md:5$/);
    expect(path).toBe(ledger.debugImagePath(docPath, 1));
  });

  it("shows a tex compile error for an unknown compile mode", async () => {
    const [html] = await renderBlocks([
      compileBlock("mode=svg", documentWith("Hello")),
    ]);

    expect(html).not.toContain("<svg");
    expect(html).toContain("mode=svg");
  });

  it("shows a tex compile error for a mode meta with no value", async () => {
    const [html] = await renderBlocks([
      compileBlock("mode", documentWith("Hello")),
    ]);

    expect(html).not.toContain("<svg");
    expect(html).toContain("mode=dvi");
  });

  describe.skipIf(!hasToolchain)("with TeX installed", () => {
    it("inlines the compiled tex diagram as an svg element", async () => {
      const [html] = await renderBlocks([
        compileBlock('alt="A greeting"', documentWith("Hello")),
      ]);

      expect(html).toMatch(
        /^<svg class="tex-compiled" role="img" aria-label="A greeting"[\s>]/,
      );
      expect(html).toMatch(/<text[^>]*>Hello<\/text>/);
    });

    it("applies svgClassname, unless the block's class meta overrides it", async () => {
      const [defaultHtml, overriddenHtml] = await renderBlocks(
        [
          compileBlock("", documentWith("Hello")),
          compileBlock('class="wide framed"', documentWith("Hello")),
        ],
        { svgClassname: "site-diagram" },
      );

      expect(defaultHtml).toMatch(/^<svg class="tex-compiled site-diagram"/);
      expect(overriddenHtml).toMatch(/^<svg class="tex-compiled wide framed"/);
    });

    it("escapes the alt text", async () => {
      const [html] = await renderBlocks([
        compileBlock("alt=\"x < y & 'z'\"", documentWith("Hello")),
      ]);

      expect(html).toContain("aria-label=\"x &lt; y &amp; 'z'\"");
    });

    it("draws text as shapes for a block in pdf compile mode", async () => {
      const [html] = await renderBlocks([
        compileBlock("mode=pdf", documentWith("Hello")),
      ]);

      expect(html).toMatch(/^<svg class="tex-compiled"/);
      expect(html).not.toContain("<text");
    });

    it("gives two diagrams on one page no ids or classes in common", async () => {
      const [firstHtml, secondHtml] = await renderBlocks([
        compileBlock("", documentWith("Hello $x$")),
        compileBlock("", documentWith("Goodbye $y$")),
      ]);

      for (const attribute of ["id", "class"]) {
        const firstValues = new Set(attributeValues(firstHtml, attribute));
        const sharedValues = attributeValues(secondHtml, attribute).filter(
          (value) => firstValues.has(value),
        );
        expect(sharedValues).toEqual([]);
      }
    });
  });
});
