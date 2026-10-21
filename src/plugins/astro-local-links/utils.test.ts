import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeSite, pageHtml } from "./test-site.js";
import { processPage, resolveSourceDoc } from "./utils.js";

const VALIDATE_AND_NORMALIZE = {
  validate: { skipPatterns: [] },
  normalize: true,
};

describe("processPage", () => {
  it("normalizes a relative link against the source doc's dir", () => {
    const site = makeSite({
      "src/content/docs/guide/intro.md": "",
      "src/content/docs/guide/ref/page.md": "",
    });

    const result = processPage(pageHtml(`<a href="./ref/page#usage">x</a>`), {
      sourceDocFilePath: join(site.docsDirPath, "guide/intro.md"),
      site,
      ...VALIDATE_AND_NORMALIZE,
    });

    expect(result.html).toContain(`<a href="/guide/ref/page#usage">x</a>`);
    expect(result.brokenLinks).toEqual([]);
  });

  it("leaves hrefs that aren't local links alone", () => {
    const site = makeSite({ "src/content/docs/guide/intro.md": "" });
    const hrefs = [
      "mailto:a@b.c",
      "tel:+15550100",
      "https://example.com/x",
      "//cdn.example.com/x.js",
      "#section",
      "data:image/png;base64,AAAA",
    ];
    const content = hrefs.map((href) => `<a href="${href}">x</a>`).join("");

    const result = processPage(pageHtml(content), {
      sourceDocFilePath: join(site.docsDirPath, "guide/intro.md"),
      site,
      ...VALIDATE_AND_NORMALIZE,
    });

    for (const href of hrefs) expect(result.html).toContain(`href="${href}"`);
    expect(result.brokenLinks).toEqual([]);
  });

  it("returns the HTML exactly as given when no link changes", () => {
    const site = makeSite({ "src/content/docs/guide/intro.md": "" });
    const html = pageHtml(`<a href="/guide/intro">x</a>`).replace(
      "<head></head>",
      "<head>\n  <meta charset=utf-8>\n</head>",
    );

    const result = processPage(html, {
      sourceDocFilePath: join(site.docsDirPath, "guide/intro.md"),
      site,
      ...VALIDATE_AND_NORMALIZE,
    });

    expect(result.html).toBe(html);
  });
});

describe("processPage link validation", () => {
  /** The hrefs, as written, that `processPage` reports broken in a page linking to each of `hrefs`. */
  function brokenHrefs(files: Record<string, string>, hrefs: string[]) {
    const site = makeSite({ "src/content/docs/guide/intro.md": "", ...files });
    const content = hrefs.map((href) => `<a href="${href}">x</a>`).join("");
    const result = processPage(pageHtml(content), {
      sourceDocFilePath: join(site.docsDirPath, "guide/intro.md"),
      site,
      ...VALIDATE_AND_NORMALIZE,
    });
    return result.brokenLinks.map((brokenLink) => brokenLink.href);
  }

  it("reports a link to a source doc that doesn't exist", () => {
    expect(brokenHrefs({}, ["./missing", "/elsewhere/missing#part"])).toEqual([
      "./missing",
      "/elsewhere/missing#part",
    ]);
  });

  it("accepts links to a source doc, written as x or as a folder's index", () => {
    const files = {
      "src/content/docs/guide/sibling.mdx": "",
      "src/content/docs/reference/index.md": "",
      "src/content/docs/index.mdx": "",
    };
    const hrefs = [
      "./sibling",
      "sibling#part",
      "/reference",
      "/reference/",
      "/reference/index",
      "../reference/index",
      "/",
    ];

    expect(brokenHrefs(files, hrefs)).toEqual([]);
  });

  it("reports a link that matches both x.md and x/index.md", () => {
    const files = {
      "src/content/docs/reference.md": "",
      "src/content/docs/reference/index.md": "",
    };

    expect(brokenHrefs(files, ["/reference"])).toEqual(["/reference"]);
  });

  it("accepts files in public/ and reports doc files that never reached it", () => {
    const files = {
      "public/static/logo.png": "",
      "public/guide/assets/copied.pdf": "",
      "src/content/docs/guide/assets/copied.pdf": "",
      "src/content/docs/guide/assets/not-copied.pdf": "",
    };
    const hrefs = [
      "/static/logo.png",
      "./assets/copied.pdf",
      "./assets/not-copied.pdf",
    ];

    expect(brokenHrefs(files, hrefs)).toEqual(["./assets/not-copied.pdf"]);
  });

  it("only validates links inside the content, but normalizes the whole page", () => {
    const site = makeSite({ "src/content/docs/guide/intro.md": "" });

    const result = processPage(
      pageHtml(`<a href="./missing">x</a>`, `<a href="./chrome-only">y</a>`),
      {
        sourceDocFilePath: join(site.docsDirPath, "guide/intro.md"),
        site,
        ...VALIDATE_AND_NORMALIZE,
      },
    );

    expect(result.brokenLinks.map((brokenLink) => brokenLink.href)).toEqual([
      "./missing",
    ]);
    expect(result.html).toContain(`<a href="/guide/chrome-only">y</a>`);
  });

  it("validates <img src> like <a href>", () => {
    const site = makeSite({ "src/content/docs/guide/intro.md": "" });

    const result = processPage(pageHtml(`<img src="./assets/gone.png">`), {
      sourceDocFilePath: join(site.docsDirPath, "guide/intro.md"),
      site,
      ...VALIDATE_AND_NORMALIZE,
    });

    expect(result.brokenLinks.map((brokenLink) => brokenLink.href)).toEqual([
      "./assets/gone.png",
    ]);
    expect(result.html).toContain(`<img src="/guide/assets/gone.png">`);
  });

  it("skips validation for ? links, data-no-link-check and skipPatterns, then strips the markers", () => {
    const site = makeSite({ "src/content/docs/guide/intro.md": "" });
    const content =
      `<a href="?./draft">a</a>` +
      `<a href="./later" data-no-link-check="">b</a>` +
      `<a href="/csci-320/grade-calculator">c</a>` +
      `<a href="./draft-notes#top">d</a>`;

    const result = processPage(pageHtml(content), {
      sourceDocFilePath: join(site.docsDirPath, "guide/intro.md"),
      site,
      validate: {
        skipPatterns: ["/csci-320/grade-calculator", "**/draft-*"],
      },
      normalize: true,
    });

    expect(result.brokenLinks).toEqual([]);
    expect(result.html).toContain(`<a href="/guide/draft">a</a>`);
    expect(result.html).toContain(`<a href="/guide/later">b</a>`);
    expect(result.html).toContain(`<a href="/csci-320/grade-calculator">c</a>`);
    expect(result.html).toContain(`<a href="/guide/draft-notes#top">d</a>`);
  });

  it("strips the ? marker even when validation is off", () => {
    const site = makeSite({ "src/content/docs/guide/intro.md": "" });

    const result = processPage(pageHtml(`<a href="?./draft">a</a>`), {
      sourceDocFilePath: join(site.docsDirPath, "guide/intro.md"),
      site,
      validate: false,
      normalize: false,
    });

    expect(result.html).toContain(`<a href="./draft">a</a>`);
  });

  it("doesn't validate URLs Astro generates, like optimized images", () => {
    const hrefs = [
      "/_image?href=%2F%40fs%2Fx.png&w=770",
      "/_astro/image.Bx3k.webp",
      "/@fs/home/x/src/content/docs/guide/x.png",
    ];

    expect(brokenHrefs({}, hrefs)).toEqual([]);
  });

  it("decodes percent-encoded links before looking for the target", () => {
    const files = {
      "public/guide/my notes.pdf": "",
      "src/content/docs/guide/café.md": "",
    };

    expect(brokenHrefs(files, ["./my%20notes.pdf", "./caf%C3%A9"])).toEqual([]);
  });

  it("reports a relative link that climbs out of the docs dir", () => {
    expect(brokenHrefs({}, ["../../../outside"])).toEqual(["../../../outside"]);
  });
});

describe("resolveSourceDoc", () => {
  it("finds the source doc of a page, as x.md(x) or x/index.md(x)", () => {
    const site = makeSite({
      "src/content/docs/index.mdx": "",
      "src/content/docs/guide/intro.md": "",
      "src/content/docs/reference/index.md": "",
      "src/content/docs/notes/My Notes.md": "",
    });

    expect(resolveSourceDoc("/", site.docsDirPath)).toBe(
      join(site.docsDirPath, "index.mdx"),
    );
    expect(resolveSourceDoc("/guide/intro/", site.docsDirPath)).toBe(
      join(site.docsDirPath, "guide/intro.md"),
    );
    expect(resolveSourceDoc("/guide/intro", site.docsDirPath)).toBe(
      join(site.docsDirPath, "guide/intro.md"),
    );
    expect(resolveSourceDoc("/reference/", site.docsDirPath)).toBe(
      join(site.docsDirPath, "reference/index.md"),
    );
    expect(resolveSourceDoc("/notes/My%20Notes/", site.docsDirPath)).toBe(
      join(site.docsDirPath, "notes/My Notes.md"),
    );
  });

  it("throws when a page matches both x.md and x/index.md", () => {
    const site = makeSite({
      "src/content/docs/reference.md": "",
      "src/content/docs/reference/index.md": "",
    });

    expect(() => resolveSourceDoc("/reference/", site.docsDirPath)).toThrow(
      /Ambiguous source docs for \/reference\/.*Remove one/s,
    );
  });

  it("throws when a page has no source doc", () => {
    const site = makeSite({});

    expect(() => resolveSourceDoc("/gone/", site.docsDirPath)).toThrow(
      /No source doc for \/gone\//,
    );
  });
});
