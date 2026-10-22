import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFileTree } from "../tests/file-tree.js";
import {
  astroServeDocsFiles,
  type AstroServeDocsFilesOptions,
} from "./index.js";

const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
});

type WatcherHandler = (event: string, filePath: string) => void;

/**
 * Runs `astro:server:setup` in a project holding `files`, with a fake file watcher.
 * `saveDocsFile` writes a file under the docs dir and fires the watcher for it.
 */
async function runDevSetup(
  files: Record<string, string>,
  options: Partial<AstroServeDocsFilesOptions> = {},
) {
  const rootDirPath = makeFileTree(files);
  process.chdir(rootDirPath);
  const integration = astroServeDocsFiles({ preserveDirs: [], ...options });
  const watcherHandlers: WatcherHandler[] = [];
  const fakeServer = {
    watcher: {
      add: () => {},
      on: (_eventName: string, handler: WatcherHandler) => {
        watcherHandlers.push(handler);
      },
    },
  };
  const serverSetupHook = integration.hooks["astro:server:setup"] as (
    params: unknown,
  ) => Promise<void>;
  await serverSetupHook({ server: fakeServer });

  const docsDirPath = join(process.cwd(), "src/content/docs");
  const saveDocsFile = (relativeFilePath: string, contents: string) => {
    const filePath = join(docsDirPath, relativeFilePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
    for (const handler of watcherHandlers) handler("add", filePath);
  };
  return { rootDirPath, saveDocsFile };
}

/** Waits past the incremental sync's debounce for its writes to land. */
const waitForIncrementalSync = () =>
  new Promise((resolveWait) => setTimeout(resolveWait, 300));

describe("astroServeDocsFiles in dev", () => {
  it("finishes the initial sync before the server starts", async () => {
    const { rootDirPath } = await runDevSetup({
      "src/content/docs/guide/page.md": "---\ntitle: Page\n---\n",
      "src/content/docs/guide/draft.md": "---\ndraft: true\n---\n",
      "src/content/docs/guide/diagram.pdf": "pdf",
    });

    expect(existsSync(join(rootDirPath, "public/guide/page.md"))).toBe(true);
    expect(existsSync(join(rootDirPath, "public/guide/diagram.pdf"))).toBe(
      true,
    );
    expect(existsSync(join(rootDirPath, "public/guide/draft.md"))).toBe(false);
  });

  it("still copies a docs asset next to a draft, and a sidebar-hidden doc", async () => {
    const { rootDirPath } = await runDevSetup({
      "src/content/docs/guide/draft.md": "---\ndraft: true\n---\n",
      "src/content/docs/guide/draft-figure.png": "png",
      "src/content/docs/guide/hidden.md":
        "---\ntitle: Hidden\nsidebar:\n  hidden: true\n---\n",
    });

    expect(existsSync(join(rootDirPath, "public/guide/draft-figure.png"))).toBe(
      true,
    );
    expect(existsSync(join(rootDirPath, "public/guide/hidden.md"))).toBe(true);
  });

  it("leaves out _-prefixed files and everything under a _-prefixed dir", async () => {
    const { rootDirPath } = await runDevSetup({
      "src/content/docs/guide/_partial.md": "---\ntitle: Partial\n---\n",
      "src/content/docs/guide/_assets/logo.png": "png",
      "src/content/docs/guide/page.md": "---\ntitle: Page\n---\n",
    });

    expect(existsSync(join(rootDirPath, "public/guide/page.md"))).toBe(true);
    expect(existsSync(join(rootDirPath, "public/guide/_partial.md"))).toBe(
      false,
    );
    expect(existsSync(join(rootDirPath, "public/guide/_assets"))).toBe(false);
  });

  it("leaves out .-prefixed files and everything under a .-prefixed dir", async () => {
    const { rootDirPath } = await runDevSetup({
      "src/content/docs/.DS_Store": "junk",
      "src/content/docs/.obsidian/workspace.json": "{}",
      "src/content/docs/page.md": "---\ntitle: Page\n---\n",
    });

    expect(existsSync(join(rootDirPath, "public/page.md"))).toBe(true);
    expect(existsSync(join(rootDirPath, "public/.DS_Store"))).toBe(false);
    expect(existsSync(join(rootDirPath, "public/.obsidian"))).toBe(false);
  });

  it("leaves out files matching ignorePatterns, and everything under a matching dir", async () => {
    const { rootDirPath } = await runDevSetup(
      {
        "src/content/docs/guide/notes.txt": "scratch",
        "src/content/docs/scratch/figure.png": "png",
        "src/content/docs/guide/figure.png": "png",
      },
      { ignorePatterns: ["**/*.txt", "scratch"] },
    );

    expect(existsSync(join(rootDirPath, "public/guide/figure.png"))).toBe(true);
    expect(existsSync(join(rootDirPath, "public/guide/notes.txt"))).toBe(false);
    expect(existsSync(join(rootDirPath, "public/scratch"))).toBe(false);
  });

  it("fails to start when a doc's frontmatter can't be parsed", async () => {
    await expect(
      runDevSetup({
        "src/content/docs/broken.md": "---\ntitle: [unclosed\n---\n",
      }),
    ).rejects.toThrow(/broken\.md/);
  });

  it("applies the same exclusions to files saved during the session", async () => {
    const { rootDirPath, saveDocsFile } = await runDevSetup({
      "src/content/docs/page.md": "---\ntitle: Page\n---\n",
    });

    saveDocsFile("guide/new.md", "---\ntitle: New\n---\n");
    saveDocsFile("guide/draft.md", "---\ndraft: true\n---\n");
    saveDocsFile("guide/_partial.md", "---\ntitle: Partial\n---\n");
    saveDocsFile(".obsidian/workspace.json", "{}");
    await waitForIncrementalSync();

    expect(existsSync(join(rootDirPath, "public/guide/new.md"))).toBe(true);
    expect(existsSync(join(rootDirPath, "public/guide/draft.md"))).toBe(false);
    expect(existsSync(join(rootDirPath, "public/guide/_partial.md"))).toBe(
      false,
    );
    expect(existsSync(join(rootDirPath, "public/.obsidian"))).toBe(false);
  });

  it("only logs, naming the file, when a doc saved during the session has unparseable frontmatter", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { saveDocsFile } = await runDevSetup({
      "src/content/docs/page.md": "---\ntitle: Page\n---\n",
    });

    saveDocsFile("broken.md", "---\ntitle: [unclosed\n---\n");
    await waitForIncrementalSync();

    expect(String(consoleErrorSpy.mock.calls.flat().join(" "))).toMatch(
      /broken\.md/,
    );
  });
});
