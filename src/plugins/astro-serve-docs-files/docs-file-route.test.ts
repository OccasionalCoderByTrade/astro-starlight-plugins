import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFileTree } from "../tests/file-tree.js";
import { createDocsFileRoute } from "./docs-file-route.js";

/**
 * The route module's exports for a project holding `files` (path relative to the docs dir
 * → contents), set up as the integration does.
 */
function makeRoute(
  files: Record<string, string | Buffer>,
  ignorePatterns: string[] = [],
  serveDrafts = false,
) {
  const rootDirPath = makeFileTree({});
  const docsDirPath = join(rootDirPath, "src/content/docs");
  for (const [relativeFilePath, contents] of Object.entries(files)) {
    const filePath = join(docsDirPath, relativeFilePath);
    if (relativeFilePath.endsWith("/")) {
      mkdirSync(filePath, { recursive: true });
      continue;
    }
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
  mkdirSync(docsDirPath, { recursive: true });
  return createDocsFileRoute({ docsDirPath, ignorePatterns, serveDrafts });
}

/** Calls the route's `GET` the way Astro does for a request to `relativeFilePath`. */
function requestFile(
  route: ReturnType<typeof makeRoute>,
  relativeFilePath: string,
): Promise<Response> {
  return route.GET({ params: { path: relativeFilePath } });
}

async function listServedPaths(route: ReturnType<typeof makeRoute>) {
  const staticPaths = await route.getStaticPaths();
  return staticPaths.map((staticPath) => staticPath.params.path).sort();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("docs file route", () => {
  it("leaves out and logs a doc whose frontmatter can't be parsed, still listing the rest", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const route = makeRoute({
      "guide/page.md": "---\ntitle: Page\n---\n",
      "guide/broken.md": "---\ntitle: [unclosed\n---\n",
      "guide/figure.png": "png",
    });

    expect(await listServedPaths(route)).toEqual([
      "guide/figure.png",
      "guide/page.md",
    ]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/broken\.md/),
    );
  });

  it("lists exactly the files the served-file rule accepts", async () => {
    const route = makeRoute(
      {
        "index.md": "---\ntitle: Home\n---\n",
        "guide/page.mdx": "---\ntitle: Page\n---\n",
        "guide/draft.md": "---\ndraft: true\n---\n",
        "guide/draft-figure.png": "png",
        "guide/_partial.md": "---\ntitle: Partial\n---\n",
        "_assets/logo.png": "png",
        ".obsidian/workspace.json": "{}",
        "scratch/notes.txt": "scratch",
        "reference/deep/nested/List Syntax.pdf": "pdf",
        "empty-dir/": "",
      },
      ["scratch"],
    );

    expect(await listServedPaths(route)).toEqual([
      "guide/draft-figure.png",
      "guide/page.mdx",
      "index.md",
      "reference/deep/nested/List Syntax.pdf",
    ]);
  });

  it("lists and serves drafts when serveDrafts is on, still leaving out _/. prefixes and ignorePatterns", async () => {
    const draftDoc = "---\ndraft: true\n---\n\n# Work in progress\n";
    const route = makeRoute(
      {
        "guide/page.md": "---\ntitle: Page\n---\n",
        "guide/draft.md": draftDoc,
        "guide/_partial.md": "---\ntitle: Partial\n---\n",
        ".obsidian/workspace.json": "{}",
        "scratch/notes.txt": "scratch",
      },
      ["scratch"],
      true,
    );

    expect(await listServedPaths(route)).toEqual([
      "guide/draft.md",
      "guide/page.md",
    ]);
    expect(await (await requestFile(route, "guide/draft.md")).text()).toBe(
      draftDoc,
    );
  });

  it("returns a raw doc's bytes unchanged, frontmatter included", async () => {
    const rawDoc = "---\ntitle: Page\n---\n\n# Héllo\r\n\n```js\nx\n```\n";
    const route = makeRoute({ "guide/page.md": rawDoc });

    const response = await requestFile(route, "guide/page.md");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(rawDoc);
  });

  it("returns a nested docs asset with a non-slug name byte-for-byte", async () => {
    const assetBytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0x80]);
    const route = makeRoute({ "Ref Docs/A & B/My File (v2).PDF": assetBytes });

    const response = await requestFile(
      route,
      "Ref Docs/A & B/My File (v2).PDF",
    );

    expect(Buffer.from(await response.arrayBuffer())).toEqual(assetBytes);
  });

  it("sets a content type from the file's extension", async () => {
    const route = makeRoute({
      "page.md": "---\ntitle: Page\n---\n",
      "page-two.mdx": "---\ntitle: Page two\n---\n",
      "page-three.markdown": "---\ntitle: Page three\n---\n",
      "page-four.mdwn": "---\ntitle: Page four\n---\n",
      "paper.pdf": "pdf",
      "Figure.PNG": "png",
      "notes.txt": "notes",
      "archive.unknownext": "?",
      Makefile: "all:",
    });
    const contentTypeOf = async (relativeFilePath: string) =>
      (await requestFile(route, relativeFilePath)).headers.get("content-type");

    expect(await contentTypeOf("page.md")).toBe("text/markdown; charset=utf-8");
    expect(await contentTypeOf("page-two.mdx")).toBe(
      "text/markdown; charset=utf-8",
    );
    expect(await contentTypeOf("page-three.markdown")).toBe(
      "text/markdown; charset=utf-8",
    );
    expect(await contentTypeOf("page-four.mdwn")).toBe(
      "text/markdown; charset=utf-8",
    );
    expect(await contentTypeOf("paper.pdf")).toBe("application/pdf");
    expect(await contentTypeOf("Figure.PNG")).toBe("image/png");
    expect(await contentTypeOf("notes.txt")).toBe("text/plain; charset=utf-8");
    expect(await contentTypeOf("archive.unknownext")).toBe(
      "application/octet-stream",
    );
    expect(await contentTypeOf("Makefile")).toBe("application/octet-stream");
  });
});
