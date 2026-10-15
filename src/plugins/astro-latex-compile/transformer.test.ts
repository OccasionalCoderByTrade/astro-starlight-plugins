import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Code, Root } from "mdast";
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
        svgUrlPrefix: "/svgs",
        missingTools: new Set(),
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
});
