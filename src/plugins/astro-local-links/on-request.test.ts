import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createOnRequest } from "./on-request.js";
import { makeSite, pageHtml } from "./test-site.js";

/** The dev middleware over a fresh site holding `files`, and a way to send it requests. */
function startDevMiddleware(
  files: Record<string, string> = {
    "src/content/docs/guide/intro.md": "",
    "src/content/docs/guide/next.md": "",
  },
) {
  const site = makeSite(files);
  const onRequest = createOnRequest({
    site,
    validate: { skipPatterns: [] },
    normalize: true,
  });

  /** Runs one request, with `body` as what the page rendered. */
  async function request(
    pathname: string,
    body: string,
    {
      routePattern = "/[...slug]",
      contentType = "text/html",
      status = 200,
    } = {},
  ) {
    const context = {
      url: new URL(`http://localhost${pathname}`),
      routePattern,
    } as Parameters<typeof onRequest>[0];
    const next = async () =>
      new Response(body, { status, headers: { "content-type": contentType } });

    const response = (await onRequest(context, next)) as Response;
    return response.text();
  }
  return { site, request };
}

type TRequestOptions = {
  routePattern?: string;
  contentType?: string;
  status?: number;
};

/** Runs one request against a fresh site holding `files`. */
function request(
  pathname: string,
  body: string,
  {
    files,
    ...requestOptions
  }: TRequestOptions & { files?: Record<string, string> } = {},
) {
  return startDevMiddleware(files).request(pathname, body, requestOptions);
}

describe("dev middleware", () => {
  it("normalizes the links in a Starlight doc page", async () => {
    const html = await request(
      "/guide/intro/",
      pageHtml(`<a href="./next">x</a>`),
    );

    expect(html).toContain(`<a href="/guide/next">x</a>`);
  });

  it("leaves other routes and non-HTML responses alone", async () => {
    const body = pageHtml(`<a href="./next">x</a>`);

    expect(
      await request("/grade-calculator/", body, {
        routePattern: "/grade-calculator",
      }),
    ).toBe(body);
    expect(
      await request("/guide/intro/", body, { contentType: "text/plain" }),
    ).toBe(body);
    expect(await request("/no-such-doc/", body, { status: 404 })).toBe(body);
  });

  it("throws, listing the broken links, so dev shows an error page", async () => {
    await expect(
      request("/guide/intro/", pageHtml(`<a href="./missing">x</a>`)),
    ).rejects.toThrow(/1 broken local link:[\s\S]*\.\/missing/);
  });

  it("finds the source doc of a page from a non-slug path, and accepts page-form links to it", async () => {
    const files = {
      "src/content/docs/reference/List Syntax cOp&&Y.md": "",
      "src/content/docs/My Guide/Intro.md": "",
    };

    const html = await request(
      "/reference/list-syntax-copy/",
      pageHtml(
        `<a href="../my-guide/intro">x</a><a href="/my-guide/intro/">y</a>`,
      ),
      { files },
    );

    expect(html).toContain(`<a href="/my-guide/intro">x</a>`);
    expect(html).toContain(`<a href="/my-guide/intro/">y</a>`);
  });

  it("finds source docs the way Starlight's docs loader does", async () => {
    const files = {
      "src/content/docs/guide/Index.md": "",
      "src/content/docs/guide/notes.markdown": "",
      "src/content/docs/guide/draft.md": "---\ndraft: true\n---\n",
      "src/content/docs/guide/upper.MD": "",
      "src/content/docs/guide/v1.2-notes.mdwn": "",
      "src/content/docs/guide/_partial.md": "",
      "src/content/docs/guide/.hidden.md": "",
    };
    const body = pageHtml("");

    expect(await request("/guide/", body, { files })).toBe(body);
    expect(await request("/guide/notes/", body, { files })).toBe(body);
    expect(await request("/guide/draft/", body, { files })).toBe(body);
    expect(await request("/guide/v12-notes/", body, { files })).toBe(body);
    await expect(request("/guide/_partial/", body, { files })).rejects.toThrow(
      /No source doc for \/guide\/_partial\//,
    );
    await expect(request("/guide/hidden/", body, { files })).rejects.toThrow(
      /No source doc for \/guide\/hidden\//,
    );
    await expect(request("/guide/upper/", body, { files })).rejects.toThrow(
      /No source doc for \/guide\/upper\//,
    );
  });

  it("picks up a source doc added since the last request", async () => {
    const devMiddleware = startDevMiddleware({
      "src/content/docs/guide/intro.md": "",
    });
    const body = pageHtml(`<a href="./later">x</a>`);

    await expect(devMiddleware.request("/guide/intro/", body)).rejects.toThrow(
      /\.\/later/,
    );
    writeFileSync(join(devMiddleware.site.docsDirPath, "guide/Later.md"), "");

    expect(await devMiddleware.request("/guide/intro/", body)).toContain(
      `<a href="/guide/later">x</a>`,
    );
    expect(await devMiddleware.request("/guide/later/", pageHtml(""))).toBe(
      pageHtml(""),
    );
  });
});
