import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createOnRequest } from "./on-request.js";
import { makeSite, pageHtml } from "./test-site.js";
import type { TLocalLinksSettings } from "./utils.js";

type TSettingsOverrides = Partial<Omit<TLocalLinksSettings, "site">>;

/**
 * The dev middleware over a fresh site holding `files`, and a way to send it requests.
 * `settings` overrides the defaults, which validate with no skip patterns and normalize.
 */
function startDevMiddleware(
  files: Record<string, string> = {
    "src/content/docs/guide/intro.md": "",
    "src/content/docs/guide/next.md": "",
  },
  settings: TSettingsOverrides = {},
) {
  const site = makeSite(files);
  const onRequest = createOnRequest({
    site,
    validate: { skipPatterns: [] },
    normalize: true,
    ...settings,
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

/** Runs one request against a fresh site holding `files`, with `settings` overridden. */
function request(
  pathname: string,
  body: string,
  {
    files,
    settings,
    ...requestOptions
  }: TRequestOptions & {
    files?: Record<string, string>;
    settings?: TSettingsOverrides;
  } = {},
) {
  return startDevMiddleware(files, settings).request(
    pathname,
    body,
    requestOptions,
  );
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

  it("throws on a shadowed doc, naming the source doc and the route that served it", async () => {
    const files = { "src/content/docs/My Guide/Intro.md": "" };

    await expect(
      request("/my-guide/intro/", pageHtml(""), {
        files,
        routePattern: "/my-guide/intro",
      }),
    ).rejects.toThrow(
      /\/my-guide\/intro\/[\s\S]*My Guide\/Intro\.md[\s\S]*\/my-guide\/intro\b[\s\S]*doc route \(\/\[\.\.\.slug\]\)[\s\S]*src\/pages[\s\S]*doc route changed/,
    );
  });

  it("leaves a custom 404 source doc to Starlight's 404 route", async () => {
    const files = { "src/content/docs/404.md": "" };
    const body = pageHtml("not found");

    expect(
      await request("/404/", body, { files, routePattern: "/404" }),
    ).toBe(body);
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

  it("rewrites file-form links to the page path", async () => {
    const files = {
      "src/content/docs/reference/index.md": "",
      "src/content/docs/reference/List Syntax cOp&&Y.md": "",
    };

    const html = await request(
      "/reference/",
      pageHtml(`<a href="./List%20Syntax%20cOp%26%26Y">x</a>`),
      { files },
    );

    expect(html).toContain(`<a href="/reference/list-syntax-copy">x</a>`);
  });

  it("rewrites root-absolute file-form links, keeping the trailing slash and ?query#fragment", async () => {
    const files = {
      "src/content/docs/index.md": "",
      "src/content/docs/Café Notes/Index.md": "",
      "src/content/docs/Café Notes/Part One.md": "",
    };

    const html = await request(
      "/",
      pageHtml(
        `<a href="/Caf%C3%A9%20Notes/Part%20One/?v=1#top">a</a>` +
          `<a href="/Café Notes/Part One#top">b</a>` +
          `<a href="/Caf%C3%A9%20Notes/">c</a>` +
          `<a href="/Caf%C3%A9%20Notes/Index">d</a>` +
          `<a href="/index">e</a>`,
      ),
      { files },
    );

    expect(html).toContain(
      `<a href="/caf%C3%A9-notes/part-one/?v=1#top">a</a>`,
    );
    expect(html).toContain(`<a href="/caf%C3%A9-notes/part-one#top">b</a>`);
    expect(html).toContain(`<a href="/caf%C3%A9-notes/">c</a>`);
    expect(html).toContain(`<a href="/caf%C3%A9-notes">d</a>`);
    expect(html).toContain(`<a href="/">e</a>`);
  });

  it("rewrites a link to a folder's index doc by its file name to the folder's page", async () => {
    const files = {
      "src/content/docs/guide/intro.md": "",
      "src/content/docs/reference/index.md": "",
    };

    const html = await request(
      "/guide/intro/",
      pageHtml(
        `<a href="/reference/index">x</a><a href="../reference/index/">y</a>`,
      ),
      { files },
    );

    expect(html).toContain(`<a href="/reference">x</a>`);
    expect(html).toContain(`<a href="/reference/">y</a>`);
  });

  it("reports a link that only matches once slugified as broken", async () => {
    const files = {
      "src/content/docs/reference/index.md": "",
      "src/content/docs/reference/List Syntax cOp&&Y.md": "",
    };

    await expect(
      request(
        "/reference/",
        pageHtml(
          `<a href="/reference/LIST-syntax-COPY">x</a>` +
            `<a href="./list syntax copy">y</a>`,
        ),
        { files },
      ),
    ).rejects.toThrow(
      /2 broken local links:[\s\S]*LIST-syntax-COPY: no source doc[\s\S]*list syntax copy: no source doc/,
    );
  });

  it("with normalization off, reports file-form links as broken, naming the page path", async () => {
    const files = {
      "src/content/docs/reference/index.md": "",
      "src/content/docs/reference/List Syntax cOp&&Y.md": "",
      "src/content/docs/reference/slug-name.md": "",
    };

    await expect(
      request(
        "/reference/",
        pageHtml(
          `<a href="./List%20Syntax%20cOp%26%26Y">x</a>` +
            `<a href="./slug-name">y</a><a href="./list-syntax-copy">z</a>`,
        ),
        { files, settings: { normalize: false } },
      ),
    ).rejects.toThrow(
      /1 broken local link:[\s\S]*List%20Syntax%20cOp%26%26Y: .*\/reference\/list-syntax-copy\//,
    );
  });

  it("skips a file-form link when a skip pattern matches its file form or its page path", async () => {
    const files = {
      "src/content/docs/reference/index.md": "",
      "src/content/docs/reference/List Syntax cOp&&Y.md": "",
    };
    const body = pageHtml(`<a href="./List%20Syntax%20cOp%26%26Y#x">x</a>`);
    // with normalization off, the link is broken unless a skip pattern matches it
    const requestWithSkipPatterns = (skipPatterns: string[]) =>
      request("/reference/", body, {
        files,
        settings: { validate: { skipPatterns }, normalize: false },
      });

    await expect(requestWithSkipPatterns([])).rejects.toThrow(/1 broken/);
    expect(await requestWithSkipPatterns(["/reference/List%20Syntax*#x"])).toBe(
      body,
    );
    expect(
      await requestWithSkipPatterns(["/reference/list-syntax-copy#x"]),
    ).toBe(body);
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

  it("throws on a page whose page path several source docs share, naming them all", async () => {
    const files = {
      "src/content/docs/guide/Foo.md": "",
      "src/content/docs/guide/foo.md": "",
      "src/content/docs/guide/a b.md": "",
      "src/content/docs/guide/a-b.md": "",
      "src/content/docs/reference.md": "",
      "src/content/docs/reference/index.md": "",
    };
    const body = pageHtml("");

    await expect(request("/guide/foo/", body, { files })).rejects.toThrow(
      /\/guide\/foo\/[\s\S]*guide\/Foo\.md[\s\S]*guide\/foo\.md/,
    );
    await expect(request("/guide/a-b/", body, { files })).rejects.toThrow(
      /\/guide\/a-b\/[\s\S]*guide\/a b\.md[\s\S]*guide\/a-b\.md/,
    );
    await expect(request("/reference/", body, { files })).rejects.toThrow(
      /\/reference\/[\s\S]*reference\.md[\s\S]*reference\/index\.md/,
    );
  });

  it("throws on a page linking to a colliding page path, but renders the others", async () => {
    const files = {
      "src/content/docs/guide/intro.md": "",
      "src/content/docs/guide/next.md": "",
      "src/content/docs/reference.md": "",
      "src/content/docs/reference/index.md": "",
    };

    await expect(
      request("/guide/intro/", pageHtml(`<a href="/reference/">x</a>`), {
        files,
      }),
    ).rejects.toThrow(
      /\/reference\/[\s\S]*reference\.md[\s\S]*reference\/index\.md/,
    );
    expect(
      await request("/guide/next/", pageHtml(`<a href="./intro">x</a>`), {
        files,
      }),
    ).toContain(`<a href="/guide/intro">x</a>`);
  });

  it("throws on a link to a colliding page path even when link validation skips it", async () => {
    const files = {
      "src/content/docs/guide/intro.md": "",
      "src/content/docs/reference.md": "",
      "src/content/docs/reference/index.md": "",
    };
    const collisionPattern = /\/reference\/[\s\S]*reference\/index\.md/;

    await expect(
      request("/guide/intro/", pageHtml(`<a href="?/reference/">x</a>`), {
        files,
      }),
    ).rejects.toThrow(collisionPattern);
    await expect(
      request("/guide/intro/", pageHtml(`<a href="/reference/">x</a>`), {
        files,
        settings: { validate: false },
      }),
    ).rejects.toThrow(collisionPattern);
  });

  it("doesn't throw on a link to a colliding page path outside the content, like the sidebar", async () => {
    const files = {
      "src/content/docs/guide/intro.md": "",
      "src/content/docs/reference.md": "",
      "src/content/docs/reference/index.md": "",
    };

    const html = await request(
      "/guide/intro/",
      pageHtml("", `<a href="/reference/">x</a>`),
      { files },
    );

    expect(html).toContain(`<a href="/reference/">x</a>`);
  });
});
