import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeSite, pageHtml } from "./test-site.js";
import {
  buildSourceDocIndex,
  formatBrokenLinksError,
  processPage,
  resolveSourceDoc,
} from "./utils.js";

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
      sourceDocIndex: buildSourceDocIndex(site),
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
      sourceDocIndex: buildSourceDocIndex(site),
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
      sourceDocIndex: buildSourceDocIndex(site),
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
      sourceDocIndex: buildSourceDocIndex(site),
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
        sourceDocIndex: buildSourceDocIndex(site),
        site,
        ...VALIDATE_AND_NORMALIZE,
      },
    );

    expect(result.brokenLinks.map((brokenLink) => brokenLink.href)).toEqual([
      "./missing",
    ]);
    expect(result.html).toContain(`<a href="/guide/chrome-only">y</a>`);
  });

  it("skips link validation and normalization for local links inside a <template>", () => {
    const site = makeSite({ "src/content/docs/guide/intro.md": "" });

    const result = processPage(
      pageHtml(`<template><a href="./missing">x</a></template>`),
      {
        sourceDocFilePath: join(site.docsDirPath, "guide/intro.md"),
        sourceDocIndex: buildSourceDocIndex(site),
        site,
        ...VALIDATE_AND_NORMALIZE,
      },
    );

    expect(result.brokenLinks).toEqual([]);
    expect(result.html).toContain(`<a href="./missing">x</a>`);
  });

  it("validates <img src> like <a href>", () => {
    const site = makeSite({ "src/content/docs/guide/intro.md": "" });

    const result = processPage(pageHtml(`<img src="./assets/gone.png">`), {
      sourceDocFilePath: join(site.docsDirPath, "guide/intro.md"),
      sourceDocIndex: buildSourceDocIndex(site),
      site,
      ...VALIDATE_AND_NORMALIZE,
    });

    expect(result.brokenLinks.map((brokenLink) => brokenLink.href)).toEqual([
      "./assets/gone.png",
    ]);
    expect(result.html).toContain(`<img src="/guide/assets/gone.png">`);
  });

  it("reports a link to a page that only a .markdown file would have, since Starlight renders none", () => {
    const site = makeSite({
      "src/content/docs/guide/intro.md": "",
      "src/content/docs/guide/notes.markdown": "",
    });

    const result = processPage(pageHtml(`<a href="./notes">x</a>`), {
      sourceDocFilePath: join(site.docsDirPath, "guide/intro.md"),
      sourceDocIndex: buildSourceDocIndex(site),
      site,
      ...VALIDATE_AND_NORMALIZE,
    });

    expect(result.brokenLinks.map((brokenLink) => brokenLink.href)).toEqual([
      "./notes",
    ]);
  });

  it("accepts a link to a .mdoc source doc's page when Markdoc is set up", () => {
    const site = makeSite(
      {
        "src/content/docs/guide/intro.md": "",
        "src/content/docs/guide/notes.mdoc": "",
      },
      [".md", ".mdx", ".mdoc"],
    );

    const result = processPage(pageHtml(`<a href="./notes">x</a>`), {
      sourceDocFilePath: join(site.docsDirPath, "guide/intro.md"),
      sourceDocIndex: buildSourceDocIndex(site),
      site,
      ...VALIDATE_AND_NORMALIZE,
    });

    expect(result.brokenLinks).toEqual([]);
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
      sourceDocIndex: buildSourceDocIndex(site),
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
      sourceDocIndex: buildSourceDocIndex(site),
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

  it("reports a raw doc link to a raw doc that isn't served, naming the page link to use instead", () => {
    const site = makeSite({
      "src/content/docs/guide/intro.md": "",
      "src/content/docs/guide/auto-list-syntax.md": "",
    });

    const result = processPage(
      pageHtml(`<a href="./auto-list-syntax.md#usage">x</a>`),
      {
        sourceDocFilePath: join(site.docsDirPath, "guide/intro.md"),
        sourceDocIndex: buildSourceDocIndex(site),
        site,
        ...VALIDATE_AND_NORMALIZE,
      },
    );

    expect(result.brokenLinks).toEqual([
      {
        href: "./auto-list-syntax.md#usage",
        reason:
          "raw doc link, but /guide/auto-list-syntax.md isn't served. " +
          "To link to the page, use ./auto-list-syntax#usage.",
        isRawDocLink: true,
      },
    ]);
    expect(result.html).toContain(
      `<a href="/guide/auto-list-syntax.md#usage">x</a>`,
    );
  });

  it("names the page path for a raw doc link when its extensionless link would be broken", () => {
    const site = makeSite({
      "src/content/docs/guide/intro.md": "",
      "src/content/docs/guide/List Syntax.md": "",
      "src/content/docs/guide/auto-list-syntax.md": "",
      "src/content/docs/reference/index.md": "",
    });
    const content =
      `<a href="./List%20Syntax.md">a</a>` +
      `<a href="./auto-list-syntax.md">b</a>` +
      `<a href="../reference/index.md">c</a>`;

    const result = processPage(pageHtml(content), {
      sourceDocFilePath: join(site.docsDirPath, "guide/intro.md"),
      sourceDocIndex: buildSourceDocIndex(site),
      site,
      validate: { skipPatterns: [] },
      normalize: false,
    });

    expect(result.brokenLinks.map((brokenLink) => brokenLink.reason)).toEqual([
      "raw doc link, but /guide/List Syntax.md isn't served. " +
        "To link to the page, use /guide/list-syntax.",
      "raw doc link, but /guide/auto-list-syntax.md isn't served. " +
        "To link to the page, use ./auto-list-syntax.",
      "raw doc link, but /reference/index.md isn't served. " +
        "To link to the page, use /reference.",
    ]);
  });

  it("accepts a raw doc link copied into public/, and treats a .md that names no source doc as a public file", () => {
    const files = {
      "src/content/docs/guide/synced.md": "",
      "public/guide/synced.md": "",
      "src/content/docs/guide/_partial.md": "",
    };

    const site = makeSite({ "src/content/docs/guide/intro.md": "", ...files });
    const result = processPage(
      pageHtml(
        `<a href="./synced.md">a</a><a href="./notes.md">b</a><a href="./_partial.md">c</a>`,
      ),
      {
        sourceDocFilePath: join(site.docsDirPath, "guide/intro.md"),
        sourceDocIndex: buildSourceDocIndex(site),
        site,
        ...VALIDATE_AND_NORMALIZE,
      },
    );

    expect(result.brokenLinks).toEqual([
      {
        href: "./notes.md",
        reason: "no source doc or public file at /guide/notes.md",
      },
      {
        href: "./_partial.md",
        reason: "no source doc or public file at /guide/_partial.md",
      },
    ]);
  });

  it("only counts a link as a raw doc link when it names a source doc's file, extension case included", () => {
    const site = makeSite({
      "src/content/docs/guide/intro.md": "",
      "src/content/docs/guide/sibling.md": "",
      "src/content/docs/reference/index.md": "",
    });

    const result = processPage(
      pageHtml(`<a href="./sibling.MD">a</a><a href="/reference.md">b</a>`),
      {
        sourceDocFilePath: join(site.docsDirPath, "guide/intro.md"),
        sourceDocIndex: buildSourceDocIndex(site),
        site,
        ...VALIDATE_AND_NORMALIZE,
      },
    );

    expect(result.brokenLinks).toEqual([
      {
        href: "./sibling.MD",
        reason: "no source doc or public file at /guide/sibling.MD",
      },
      {
        href: "/reference.md",
        reason: "no source doc or public file at /reference.md",
      },
    ]);
  });

  it("reports a relative link that climbs out of the docs dir", () => {
    expect(brokenHrefs({}, ["../../../outside"])).toEqual(["../../../outside"]);
  });
});

describe("formatBrokenLinksError", () => {
  it("explains raw doc links once, after every broken link", () => {
    const rawDocLinkFields = {
      reason: "raw doc link, but /guide/a.md isn't served.",
      isRawDocLink: true,
    };

    const error = formatBrokenLinksError(
      [
        {
          sourceDocFilePath: "/site/src/content/docs/guide/b.md",
          brokenLinks: [{ href: "./a.md", ...rawDocLinkFields }],
        },
        {
          sourceDocFilePath: "/site/src/content/docs/guide/c.md",
          brokenLinks: [
            { href: "./a.md", ...rawDocLinkFields },
            { href: "./missing", reason: "no source doc or public file" },
          ],
        },
      ],
      "/site",
    );

    expect(error.match(/is a raw doc link/g)).toHaveLength(1);
    expect(error).toMatch(
      /- \.\/missing: no source doc or public file\n\nA link /,
    );
    expect(error).toContain("isn't served");
    expect(error).toContain("astroServeDocsFiles");
  });

  it("leaves out the raw doc link explanation when no broken link is one", () => {
    const error = formatBrokenLinksError(
      [
        {
          sourceDocFilePath: "/site/src/content/docs/guide/b.md",
          brokenLinks: [{ href: "./missing", reason: "no source doc" }],
        },
      ],
      "/site",
    );

    expect(error).not.toContain("raw doc link");
    expect(error).toContain("\nsrc/content/docs/guide/b.md\n");
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
    const sourceDocIndex = buildSourceDocIndex(site);

    expect(resolveSourceDoc("/", sourceDocIndex, site.rootDirPath)).toBe(
      join(site.docsDirPath, "index.mdx"),
    );
    expect(
      resolveSourceDoc("/guide/intro/", sourceDocIndex, site.rootDirPath),
    ).toBe(join(site.docsDirPath, "guide/intro.md"));
    expect(
      resolveSourceDoc("/guide/intro", sourceDocIndex, site.rootDirPath),
    ).toBe(join(site.docsDirPath, "guide/intro.md"));
    expect(
      resolveSourceDoc("/reference/", sourceDocIndex, site.rootDirPath),
    ).toBe(join(site.docsDirPath, "reference/index.md"));
    expect(
      resolveSourceDoc("/notes/my-notes/", sourceDocIndex, site.rootDirPath),
    ).toBe(join(site.docsDirPath, "notes/My Notes.md"));
  });

  it("throws when a page has no source doc", () => {
    const site = makeSite({});
    const sourceDocIndex = buildSourceDocIndex(site);

    expect(() =>
      resolveSourceDoc("/gone/", sourceDocIndex, site.rootDirPath),
    ).toThrow(/No source doc for \/gone\//);
  });
});

describe("buildSourceDocIndex", () => {
  it("slugifies with the same github-slugger major version as Astro", () => {
    const require = createRequire(import.meta.url);
    const astroRequire = createRequire(require.resolve("astro/package.json"));
    const majorVersion = (packageJson: { version: string }) =>
      packageJson.version.split(".")[0];

    expect(majorVersion(require("github-slugger/package.json"))).toBe(
      majorVersion(astroRequire("github-slugger/package.json")),
    );
  });
});
