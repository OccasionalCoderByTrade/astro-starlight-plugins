import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeFileTree } from "../tests/file-tree.js";
import { createRawDocAlternateLinkMiddleware } from "./raw-doc-alternate-link.js";

const PAGE_HTML = "<html><head><title>Page</title></head><body></body></html>";

type TRequestOptions = {
  routePattern?: string;
  /** `entry.filePath` of Starlight's route data, relative to the project root. */
  entryFilePath?: string;
  contentType?: string;
  status?: number;
  serveDrafts?: boolean;
  ignorePatterns?: string[];
  /** Astro's `base`, without a trailing slash. */
  baseUrlPath?: string;
  /** Starlight's locals aren't there at all, as on a site without Starlight. */
  hasNoStarlightLocals?: boolean;
};

/**
 * Runs one request through the middleware for a project holding `files`, with `PAGE_HTML`
 * as what the page rendered. Returns the response's HTML.
 */
async function request(
  files: Record<string, string>,
  {
    routePattern = "/[...slug]",
    entryFilePath,
    contentType = "text/html",
    status = 200,
    serveDrafts = false,
    ignorePatterns = [],
    baseUrlPath = "",
    hasNoStarlightLocals = false,
  }: TRequestOptions = {},
) {
  const rootDirPath = makeFileTree(files);
  const onRequest = createRawDocAlternateLinkMiddleware({
    rootDirPath,
    docsDirPath: join(rootDirPath, "src/content/docs"),
    ignorePatterns,
    serveDrafts,
    sourceDocExtensions: [".md", ".mdx"],
    baseUrlPath,
  });
  const locals = {};
  if (!hasNoStarlightLocals) {
    // Like Starlight's locals, which throw on pages Starlight didn't render
    Object.defineProperty(locals, "starlightRoute", {
      get: () => {
        if (entryFilePath === undefined) {
          throw new Error("starlightRoute read outside a Starlight page");
        }
        return { entry: { filePath: entryFilePath } };
      },
    });
  }
  const context = { routePattern, locals } as Parameters<typeof onRequest>[0];
  const next = async () =>
    new Response(PAGE_HTML, {
      status,
      headers: { "content-type": contentType },
    });

  const response = (await onRequest(context, next)) as Response;
  return response.text();
}

/** The `href` of the page's raw doc alternate link, or undefined when there's none. */
function rawDocHref(html: string): string | undefined {
  return html.match(
    /<link rel="alternate" type="text\/markdown" href="([^"]*)">/,
  )?.[1];
}

describe("raw doc alternate link middleware", () => {
  it("adds a raw doc alternate link to a doc page with a served raw doc, before </head>", async () => {
    const html = await request(
      { "src/content/docs/guide/intro.md": "# Intro" },
      { entryFilePath: "src/content/docs/guide/intro.md" },
    );

    expect(html).toBe(
      PAGE_HTML.replace(
        "</head>",
        '<link rel="alternate" type="text/markdown" href="/guide/intro.md"></head>',
      ),
    );
  });

  it("keeps the raw doc's source path, URL-encoded, for a non-slug path", async () => {
    const html = await request(
      { "src/content/docs/reference/List Syntax cOp&&Y.mdx": "# List" },
      {
        entryFilePath: "src/content/docs/reference/List Syntax cOp&&Y.mdx",
      },
    );

    // Astro decodes a request path with `decodeURI`, so `&` stays raw: `%26` would 404
    expect(rawDocHref(html)).toBe(
      "/reference/List%20Syntax%20cOp&amp;&amp;Y.mdx",
    );
  });

  it("adds no raw doc alternate link for a doc with ? or # in its path, whose raw doc can't be served", async () => {
    const html = await request(
      { "src/content/docs/guide/Why? #1.md": "" },
      { entryFilePath: "src/content/docs/guide/Why? #1.md" },
    );

    expect(html).toBe(PAGE_HTML);
  });

  it.each([
    ["an ignored doc", "src/content/docs/scratch/notes.md"],
    ["a doc under a _ dir", "src/content/docs/_partials/notes.md"],
    ["a draft in a build", "src/content/docs/guide/draft.md"],
  ])(
    "adds no raw doc alternate link for %s, whose raw doc isn't served",
    async (_, entryFilePath) => {
      const html = await request(
        {
          "src/content/docs/scratch/notes.md": "",
          "src/content/docs/_partials/notes.md": "",
          "src/content/docs/guide/draft.md": "---\ndraft: true\n---\n",
        },
        { entryFilePath, ignorePatterns: ["scratch"] },
      );

      expect(html).toBe(PAGE_HTML);
    },
  );

  it("names a draft's raw doc in dev, which serves drafts", async () => {
    const html = await request(
      { "src/content/docs/guide/draft.md": "---\ndraft: true\n---\n" },
      { entryFilePath: "src/content/docs/guide/draft.md", serveDrafts: true },
    );

    expect(rawDocHref(html)).toBe("/guide/draft.md");
  });

  it.each(["/404", "/[...path]", "/about"])(
    "leaves %s pages alone, without reading Starlight's route data",
    async (routePattern) => {
      const html = await request({}, { routePattern });

      expect(html).toBe(PAGE_HTML);
    },
  );

  it("leaves error responses and non-HTML responses alone", async () => {
    const files = { "src/content/docs/guide/intro.md": "" };
    const entryFilePath = "src/content/docs/guide/intro.md";

    expect(await request(files, { entryFilePath, status: 500 })).toBe(
      PAGE_HTML,
    );
    expect(
      await request(files, { entryFilePath, contentType: "text/plain" }),
    ).toBe(PAGE_HTML);
  });

  it("prefixes Astro's base, which the docs file route is served under", async () => {
    const html = await request(
      { "src/content/docs/guide/intro.md": "" },
      {
        entryFilePath: "src/content/docs/guide/intro.md",
        baseUrlPath: "/docs",
      },
    );

    expect(rawDocHref(html)).toBe("/docs/guide/intro.md");
  });

  it.each([
    ["Starlight's route data throws", {}],
    ["there are no Starlight locals", { hasNoStarlightLocals: true }],
  ])(
    "leaves a /[...slug] page alone, without throwing, when %s",
    async (_, requestOptions) => {
      const html = await request(
        { "src/content/docs/guide/intro.md": "" },
        requestOptions,
      );

      expect(html).toBe(PAGE_HTML);
    },
  );

  it("adds no raw doc alternate link, and doesn't throw, when the doc's frontmatter became unparseable", async () => {
    const html = await request(
      { "src/content/docs/guide/broken.md": "---\ntitle: [unclosed\n---\n" },
      { entryFilePath: "src/content/docs/guide/broken.md" },
    );

    expect(html).toBe(PAGE_HTML);
  });
});
