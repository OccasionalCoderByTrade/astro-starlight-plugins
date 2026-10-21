import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeFileTree } from "../tests/file-tree.js";
import { syncDocsToPublic } from "./index.js";

const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
});

/** Runs `astro:server:setup` in a project holding `files`, with a no-op file watcher. */
async function runDevSetup(files: Record<string, string>): Promise<string> {
  const rootDirPath = makeFileTree(files);
  process.chdir(rootDirPath);
  const integration = syncDocsToPublic({ preserveDirs: [] });
  const fakeServer = { watcher: { add: () => {}, on: () => {} } };
  const serverSetupHook = integration.hooks["astro:server:setup"] as (
    params: unknown,
  ) => Promise<void>;
  await serverSetupHook({ server: fakeServer });
  return rootDirPath;
}

describe("syncDocsToPublic in dev", () => {
  it("finishes the initial sync before the server starts", async () => {
    const rootDirPath = await runDevSetup({
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

  it("fails to start when a doc's frontmatter can't be parsed", async () => {
    await expect(
      runDevSetup({
        "src/content/docs/broken.md": "---\ntitle: [unclosed\n---\n",
      }),
    ).rejects.toThrow(/broken\.md/);
  });
});
