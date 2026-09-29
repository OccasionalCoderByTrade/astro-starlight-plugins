import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLedger,
  type DocOutputs,
  type TexDiagramLedger,
  type TexDiagramLedgerOptions,
} from "./ledger.js";

let root: string;
let svgDir: string;
let debugDir: string;

const svg = (hash: string) => join(svgDir, `${hash}.svg`);
const touch = (path: string) => writeFileSync(path, "");
const hashes = (...h: string[]): DocOutputs => ({ hashes: h, blockIds: [] });

async function startLedger(overrides: Partial<TexDiagramLedgerOptions> = {}) {
  const ledger = createLedger({
    svgDir,
    debugImageDir: debugDir,
    removeOrphanedSvgs: true,
    command: "dev",
    ...overrides,
  });
  await ledger.start();
  return ledger;
}

/** Renders a doc start to finish, with no other doc in between. */
const record = (
  ledger: TexDiagramLedger,
  docPath: string,
  outputs: DocOutputs,
) => ledger.recordDoc(ledger.beginDoc(docPath), outputs);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tex-diagram-ledger-"));
  svgDir = join(root, "svgs");
  debugDir = join(root, "debug");
  mkdirSync(svgDir);
  mkdirSync(debugDir);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("compiled tex diagrams", () => {
  it("deletes a diagram written this session once its doc stops referencing it", async () => {
    const ledger = await startLedger();
    touch(svg("a"));
    await record(ledger, "A.md", hashes("a"));
    touch(svg("b"));
    await record(ledger, "A.md", hashes("b"));

    expect(existsSync(svg("a"))).toBe(false);
    expect(existsSync(svg("b"))).toBe(true);
  });

  it("keeps a diagram that was on disk at startup, since a cached doc may show it", async () => {
    touch(svg("a"));
    const ledger = await startLedger();
    await record(ledger, "A.md", hashes("a"));
    await record(ledger, "A.md", hashes());

    expect(existsSync(svg("a"))).toBe(true);
  });

  it("keeps a diagram another doc still references", async () => {
    const ledger = await startLedger();
    touch(svg("a"));
    await record(ledger, "A.md", hashes("a"));
    await record(ledger, "B.md", hashes("a"));
    await record(ledger, "A.md", hashes());

    expect(existsSync(svg("a"))).toBe(true);

    await record(ledger, "B.md", hashes());
    expect(existsSync(svg("a"))).toBe(false);
  });

  it("never deletes diagrams when removeOrphanedSvgs is off", async () => {
    const ledger = await startLedger({ removeOrphanedSvgs: false });
    touch(svg("a"));
    await record(ledger, "A.md", hashes("a"));
    await record(ledger, "A.md", hashes());
    await ledger.sweep();

    expect(existsSync(svg("a"))).toBe(true);
  });

  it("sweeps every unreferenced diagram at the end of a build", async () => {
    touch(svg("kept"));
    touch(svg("orphan"));
    touch(join(svgDir, "notes.txt"));
    const ledger = await startLedger({ command: "build" });
    await record(ledger, "A.md", hashes("kept"));
    await ledger.sweep();

    expect(existsSync(svg("kept"))).toBe(true);
    expect(existsSync(svg("orphan"))).toBe(false);
    expect(existsSync(join(svgDir, "notes.txt"))).toBe(true);
  });

  it("does not sweep in dev", async () => {
    touch(svg("orphan"));
    const ledger = await startLedger();
    await ledger.sweep();

    expect(existsSync(svg("orphan"))).toBe(true);
  });

  it("tolerates a missing svg dir", async () => {
    svgDir = join(root, "missing");
    const ledger = await startLedger({ command: "build" });
    await expect(ledger.sweep()).resolves.toBeUndefined();
  });
});

describe("docs rendering at the same time", () => {
  it("holds a dropped diagram while another doc is rendering, then keeps it if that doc references it", async () => {
    const ledger = await startLedger();
    touch(svg("a"));
    await record(ledger, "A.md", hashes("a"));

    // B finds a.svg on disk, then A drops it before B records.
    const b = ledger.beginDoc("B.md");
    await record(ledger, "A.md", hashes());
    expect(existsSync(svg("a"))).toBe(true);

    await ledger.recordDoc(b, hashes("a"));
    expect(existsSync(svg("a"))).toBe(true);
  });

  it("deletes the held diagram once the last rendering doc finishes without it", async () => {
    const ledger = await startLedger();
    touch(svg("a"));
    await record(ledger, "A.md", hashes("a"));

    const b = ledger.beginDoc("B.md");
    await record(ledger, "A.md", hashes());
    await ledger.recordDoc(b, hashes());

    expect(existsSync(svg("a"))).toBe(false);
  });

  it("releases held deletions when a render is abandoned", async () => {
    const ledger = await startLedger();
    touch(svg("a"));
    await record(ledger, "A.md", hashes("a"));

    const b = ledger.beginDoc("B.md");
    await record(ledger, "A.md", hashes());
    await ledger.abandonDoc(b);

    expect(existsSync(svg("a"))).toBe(false);
  });

  it("ignores an older render of a doc that finishes after a newer one", async () => {
    const ledger = await startLedger();
    touch(svg("old"));
    touch(svg("new"));
    const older = ledger.beginDoc("A.md");
    const newer = ledger.beginDoc("A.md");
    await ledger.recordDoc(newer, hashes("new"));
    await ledger.recordDoc(older, hashes("old"));

    expect(existsSync(svg("new"))).toBe(true);

    // A's references are still the newer render's.
    await record(ledger, "A.md", hashes());
    expect(existsSync(svg("new"))).toBe(false);
  });

  it("treats abandoning an already-recorded render as a no-op", async () => {
    const ledger = await startLedger();
    touch(svg("a"));
    const render = ledger.beginDoc("A.md");
    await ledger.recordDoc(render, hashes("a"));
    await ledger.abandonDoc(render);

    expect(existsSync(svg("a"))).toBe(true);
  });
});

describe("debug tex diagram images", () => {
  it("deletes an image once its doc stops producing it", async () => {
    const ledger = await startLedger();
    const [one, two] = [1, 2].map((id) => ledger.debugImagePath("A.md", id)!);
    touch(one);
    touch(two);
    await record(ledger, "A.md", { hashes: [], blockIds: [1, 2] });
    await record(ledger, "A.md", { hashes: [], blockIds: [2] });

    expect(existsSync(one)).toBe(false);
    expect(existsSync(two)).toBe(true);
  });

  it("places images in the debug dir, and none when debug is off", async () => {
    const ledger = await startLedger();
    expect(ledger.debugImagePath("A.md", 1)).toMatch(
      new RegExp(`^${debugDir}/A--1-[0-9a-f]{8}\\.jpg$`),
    );

    const off = await startLedger({ debugImageDir: undefined });
    expect(off.debugImagePath("A.md", 1)).toBeUndefined();
  });

  it("wipes images at the start of a build, leaving other files", async () => {
    touch(join(debugDir, "old.jpg"));
    touch(join(debugDir, "latex-compile.log"));
    await startLedger({ command: "build" });

    expect(existsSync(join(debugDir, "old.jpg"))).toBe(false);
    expect(existsSync(join(debugDir, "latex-compile.log"))).toBe(true);
  });

  it("keeps images from earlier sessions at dev start", async () => {
    touch(join(debugDir, "old.jpg"));
    await startLedger();

    expect(existsSync(join(debugDir, "old.jpg"))).toBe(true);
  });
});

describe("duplicate blockids", () => {
  const dup: DocOutputs = { hashes: [], blockIds: [1, 1] };

  it("warns once per doc that only the last block's image is kept", async () => {
    const ledger = await startLedger();
    await record(ledger, "A.md", dup);
    await record(ledger, "A.md", dup);

    expect(console.warn).toHaveBeenCalledTimes(1);
    const message = vi.mocked(console.warn).mock.calls[0][0];
    expect(message).toContain("A.md");
    expect(message).toContain(
      "only the last one's debug tex diagram image is kept",
    );
  });

  it("still warns with debug off, without mentioning images", async () => {
    const ledger = await startLedger({ debugImageDir: undefined });
    await record(ledger, "A.md", dup);

    expect(console.warn).toHaveBeenCalledTimes(1);
    const message = vi.mocked(console.warn).mock.calls[0][0];
    expect(message).toContain("should be unique");
    expect(message).not.toContain("image");
  });
});
