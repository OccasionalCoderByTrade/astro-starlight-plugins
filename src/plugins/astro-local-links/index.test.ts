import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { astroLocalLinks, type AstroLocalLinksOptions } from "./index.js";
import { makeSite, pageHtml } from "./test-site.js";

/** Runs `astro:config:setup` the way Astro would, with the hook arguments it uses. */
async function runSetup(
  rootDirPath: string,
  command: string,
  options: AstroLocalLinksOptions = {},
  astroBasePath = "/",
  integrations: { name: string }[] = [],
) {
  const integration = astroLocalLinks(options);
  const setup = integration.hooks["astro:config:setup"]!;
  const middlewareEntrypoints: unknown[] = [];
  const params = {
    command,
    config: {
      root: pathToFileURL(`${rootDirPath}/`),
      srcDir: pathToFileURL(`${rootDirPath}/src/`),
      publicDir: pathToFileURL(`${rootDirPath}/public/`),
      base: astroBasePath,
      build: { assets: "_astro" },
      integrations,
    },
    addMiddleware: (middleware: { entrypoint: unknown }) =>
      middlewareEntrypoints.push(middleware.entrypoint),
    updateConfig: () => {},
  } as unknown as Parameters<typeof setup>[0];

  await setup(params);
  return { integration, middlewareEntrypoints };
}

/** Writes `htmlByDistRelativeFilePath` into `<root>/dist` and runs `astro:build:done` with them as Starlight's doc pages. */
async function runBuildDone(
  integration: ReturnType<typeof astroLocalLinks>,
  rootDirPath: string,
  htmlByDistRelativeFilePath: Record<string, string>,
  otherRouteDistRelativeFilePaths: string[] = [],
) {
  const distDirPath = join(rootDirPath, "dist");
  for (const [distRelativeFilePath, html] of Object.entries(
    htmlByDistRelativeFilePath,
  )) {
    mkdirSync(dirname(join(distDirPath, distRelativeFilePath)), {
      recursive: true,
    });
    writeFileSync(join(distDirPath, distRelativeFilePath), html);
  }
  const toUrls = (distRelativeFilePaths: string[]) =>
    distRelativeFilePaths.map((distRelativeFilePath) =>
      pathToFileURL(join(distDirPath, distRelativeFilePath)),
    );
  const starlightDistRelativeFilePaths = Object.keys(
    htmlByDistRelativeFilePath,
  ).filter(
    (distRelativeFilePath) =>
      !otherRouteDistRelativeFilePaths.includes(distRelativeFilePath),
  );

  await runBuildDoneWithAssets(
    integration,
    distDirPath,
    new Map([
      ["/[...slug]", toUrls(starlightDistRelativeFilePaths)],
      ["/grade-calculator", toUrls(otherRouteDistRelativeFilePaths)],
    ]),
  );

  return (distRelativeFilePath: string) =>
    readFileSync(join(distDirPath, distRelativeFilePath), "utf-8");
}

/** Runs `astro:build:done` with `assets` as given, mapping each route pattern to the files it wrote. */
async function runBuildDoneWithAssets(
  integration: ReturnType<typeof astroLocalLinks>,
  distDirPath: string,
  assets: Map<string, URL[]>,
) {
  const buildDone = integration.hooks["astro:build:done"]!;
  await buildDone({
    dir: pathToFileURL(`${distDirPath}/`),
    assets,
  } as unknown as Parameters<typeof buildDone>[0]);
}

describe("astroLocalLinks", () => {
  it("throws at setup when Astro's base is set", async () => {
    const site = makeSite();

    await expect(
      runSetup(site.rootDirPath, "build", {}, "/docs"),
    ).rejects.toThrow(/base.*not supported/);
  });

  it("adds its dev middleware in dev only", async () => {
    const site = makeSite();

    const dev = await runSetup(site.rootDirPath, "dev");
    const build = await runSetup(site.rootDirPath, "build");

    expect(dev.middlewareEntrypoints).toHaveLength(1);
    expect(build.middlewareEntrypoints).toHaveLength(0);
  });

  it("normalizes links in Starlight's doc pages on build:done, leaving other routes alone", async () => {
    const site = makeSite({
      "src/content/docs/guide/intro.md": "",
      "src/content/docs/guide/next.md": "",
    });
    const { integration } = await runSetup(site.rootDirPath, "build");

    const readDist = await runBuildDone(
      integration,
      site.rootDirPath,
      {
        "guide/intro/index.html": pageHtml(`<a href="./next">x</a>`),
        "grade-calculator/index.html": pageHtml(`<a href="./next">x</a>`),
      },
      ["grade-calculator/index.html"],
    );

    expect(readDist("guide/intro/index.html")).toContain(
      `<a href="/guide/next">x</a>`,
    );
    expect(readDist("grade-calculator/index.html")).toContain(
      `<a href="./next">x</a>`,
    );
  });

  it("fails build:done once, listing every broken link across pages", async () => {
    const site = makeSite({
      "src/content/docs/guide/intro.md": "",
      "src/content/docs/reference/index.md": "",
    });
    const { integration } = await runSetup(site.rootDirPath, "build");

    const buildDone = runBuildDone(integration, site.rootDirPath, {
      "guide/intro/index.html": pageHtml(`<a href="./missing-one">x</a>`),
      "reference/index.html": pageHtml(`<img src="./missing-two.png">`),
    });

    await expect(buildDone).rejects.toThrow(
      /2 broken local links[\s\S]*guide\/intro\.md[\s\S]*\.\/missing-one[\s\S]*reference\/index\.md[\s\S]*\.\/missing-two\.png/,
    );
  });

  it("fails build:done on a raw doc link to a draft, saying it isn't served and naming the page link", async () => {
    const site = makeSite({
      "src/content/docs/reference/index.md": "",
      "src/content/docs/reference/auto-list-syntax.md":
        "---\ndraft: true\n---\n",
      "public/reference/auto-list-syntax.md": "",
    });
    const { integration } = await runSetup(site.rootDirPath, "build");

    const buildDone = runBuildDone(integration, site.rootDirPath, {
      "reference/index.html": pageHtml(`<a href="./auto-list-syntax.md">x</a>`),
    });

    await expect(buildDone).rejects.toThrow(
      /\.\/auto-list-syntax\.md: raw doc link, but \/reference\/auto-list-syntax\.md isn't served\. To link to the page, use \.\/auto-list-syntax\.[\s\S]*is a raw doc link/,
    );
  });

  it("passes build:done on a raw doc link to a raw doc in the output dir, leaving its extension", async () => {
    const site = makeSite({
      "src/content/docs/reference/index.md": "",
      "src/content/docs/reference/auto-list-syntax.md": "",
      "dist/reference/auto-list-syntax.md": "",
    });
    const { integration } = await runSetup(site.rootDirPath, "build");

    const readDist = await runBuildDone(integration, site.rootDirPath, {
      "reference/index.html": pageHtml(`<a href="./auto-list-syntax.md">x</a>`),
      "reference/auto-list-syntax/index.html": pageHtml(""),
    });

    expect(readDist("reference/index.html")).toContain(
      `<a href="/reference/auto-list-syntax.md">x</a>`,
    );
  });

  it("leaves generated paths alone on build:done, though nothing is at them", async () => {
    const site = makeSite({ "src/content/docs/guide/intro.md": "" });
    const { integration } = await runSetup(site.rootDirPath, "build");

    const buildDone = runBuildDone(integration, site.rootDirPath, {
      "guide/intro/index.html": pageHtml(
        `<img src="/_image?href=x.png"><img src="/_astro/logo.abc.png">`,
      ),
    });

    await expect(buildDone).resolves.toBeDefined();
  });

  it("passes build:done on a link to a file in the output dir, though it isn't in public/", async () => {
    const site = makeSite({
      "src/content/docs/guide/intro.md": "",
      "src/content/docs/guide/notes.pdf": "",
      "dist/guide/notes.pdf": "",
    });
    const { integration } = await runSetup(site.rootDirPath, "build");

    const buildDone = runBuildDone(integration, site.rootDirPath, {
      "guide/intro/index.html": pageHtml(`<a href="./notes.pdf">x</a>`),
    });

    await expect(buildDone).resolves.toBeDefined();
  });

  it("fails build:done on a link to a file missing from the output dir, though it's in public/", async () => {
    const site = makeSite({
      "src/content/docs/guide/intro.md": "",
      "public/guide/notes.pdf": "",
    });
    const { integration } = await runSetup(site.rootDirPath, "build");

    const buildDone = runBuildDone(integration, site.rootDirPath, {
      "guide/intro/index.html": pageHtml(`<a href="./notes.pdf">x</a>`),
    });

    await expect(buildDone).rejects.toThrow(
      /1 broken local link[\s\S]*\.\/notes\.pdf/,
    );
  });

  it("does nothing on build:done with validation and normalization off", async () => {
    const site = makeSite({ "src/content/docs/guide/intro.md": "" });
    const { integration } = await runSetup(site.rootDirPath, "build", {
      validate: false,
      normalize: false,
    });

    const readDist = await runBuildDone(integration, site.rootDirPath, {
      "guide/intro/index.html": pageHtml(`<a href="./missing">x</a>`),
    });

    expect(readDist("guide/intro/index.html")).toContain(
      `<a href="./missing">x</a>`,
    );
  });

  it("finds the source doc of a page from a non-slug path on build:done", async () => {
    const site = makeSite({
      "src/content/docs/reference/List Syntax cOp&&Y.md": "",
      "src/content/docs/guide/intro.md": "",
    });
    const { integration } = await runSetup(site.rootDirPath, "build");

    const readDist = await runBuildDone(integration, site.rootDirPath, {
      "reference/list-syntax-copy/index.html": pageHtml(
        `<a href="../guide/intro">x</a>`,
      ),
      "guide/intro/index.html": pageHtml(
        `<a href="/reference/list-syntax-copy/">y</a>`,
      ),
    });

    expect(readDist("reference/list-syntax-copy/index.html")).toContain(
      `<a href="/guide/intro">x</a>`,
    );
  });

  it("fails build:done before processing any page, listing every page path collision", async () => {
    const site = makeSite({
      "src/content/docs/guide/intro.md": "",
      "src/content/docs/guide/Foo.md": "",
      "src/content/docs/guide/foo.md": "",
      "src/content/docs/reference.md": "",
      "src/content/docs/reference/index.md": "",
    });
    const { integration } = await runSetup(site.rootDirPath, "build");
    const introHtml = pageHtml(`<a href="./foo">x</a>`);

    const buildDone = runBuildDone(integration, site.rootDirPath, {
      "guide/intro/index.html": introHtml,
    });

    await expect(buildDone).rejects.toThrow(
      /2 page path collisions[\s\S]*\/guide\/foo\/[\s\S]*guide\/Foo\.md[\s\S]*guide\/foo\.md[\s\S]*\/reference\/[\s\S]*reference\.md[\s\S]*reference\/index\.md/,
    );
    expect(
      readFileSync(
        join(site.rootDirPath, "dist/guide/intro/index.html"),
        "utf-8",
      ),
    ).toBe(introHtml);
  });

  it("fails build:done before processing any page, listing every shadowed doc and the route that served it", async () => {
    const site = makeSite({
      "src/content/docs/guide/intro.md": "",
      "src/content/docs/My Guide/Intro.md": "",
      "src/content/docs/reference.md": "",
    });
    const { integration } = await runSetup(site.rootDirPath, "build");
    const distDirPath = join(site.rootDirPath, "dist");
    const introHtml = pageHtml(`<a href="./next">x</a>`);
    mkdirSync(join(distDirPath, "guide/intro"), { recursive: true });
    writeFileSync(join(distDirPath, "guide/intro/index.html"), introHtml);
    const toUrl = (distRelativeFilePath: string) =>
      pathToFileURL(join(distDirPath, distRelativeFilePath));

    const buildDone = runBuildDoneWithAssets(
      integration,
      distDirPath,
      new Map([
        ["/[...slug]", [toUrl("guide/intro/index.html")]],
        ["/my-guide/intro", [toUrl("my-guide/intro/index.html")]],
        ["/reference", [toUrl("reference")]],
        ["/grade-calculator", [toUrl("grade-calculator/index.html")]],
      ]),
    );

    await expect(buildDone).rejects.toThrow(
      /2 shadowed docs[\s\S]*\/my-guide\/intro\/[\s\S]*My Guide\/Intro\.md[\s\S]*\/my-guide\/intro\b[\s\S]*\/reference[\s\S]*reference\.md[\s\S]*served it/,
    );
    expect(
      readFileSync(join(distDirPath, "guide/intro/index.html"), "utf-8"),
    ).toBe(introHtml);
  });

  it("leaves the serve plugin's endpoint out of the shadowed doc check, still reporting other routes", async () => {
    const site = makeSite({
      "src/content/docs/guide/intro.md": "",
      "src/content/docs/reference/bar.md": "",
    });
    const distDirPath = join(site.rootDirPath, "dist");
    const toUrl = (distRelativeFilePath: string) =>
      pathToFileURL(join(distDirPath, distRelativeFilePath));
    const assets = () =>
      new Map([
        ["/[...slug]", []],
        ["/[...path]", [toUrl("reference/bar")]],
        ["/guide/intro", [toUrl("guide/intro/index.html")]],
      ]);
    const { integration: integrationWithServePlugin } = await runSetup(
      site.rootDirPath,
      "build",
      {},
      "/",
      [{ name: "astro-serve-docs-files" }],
    );
    const { integration: integrationWithoutServePlugin } = await runSetup(
      site.rootDirPath,
      "build",
    );

    const buildDoneWithServePlugin = runBuildDoneWithAssets(
      integrationWithServePlugin,
      distDirPath,
      assets(),
    );
    await expect(buildDoneWithServePlugin).rejects.toThrow(
      /1 shadowed doc,[\s\S]*\/guide\/intro\b/,
    );
    await expect(buildDoneWithServePlugin).rejects.not.toThrow(
      /\[\.\.\.path\]/,
    );
    await expect(
      runBuildDoneWithAssets(
        integrationWithoutServePlugin,
        distDirPath,
        assets(),
      ),
    ).rejects.toThrow(
      /2 shadowed docs[\s\S]*\/reference\/bar[\s\S]*\[\.\.\.path\]/,
    );
  });

  it("fails build:done on a shadowed draft, though Starlight wrote no page for it", async () => {
    const site = makeSite({
      "src/content/docs/guide/intro.md": "",
      "src/content/docs/guide/wip.md": "---\ndraft: true\n---\n",
    });
    const { integration } = await runSetup(site.rootDirPath, "build");

    const buildDone = runBuildDone(
      integration,
      site.rootDirPath,
      {
        "guide/intro/index.html": pageHtml(""),
        "guide/wip/index.html": pageHtml(""),
      },
      ["guide/wip/index.html"],
    );

    await expect(buildDone).rejects.toThrow(
      /1 shadowed doc,[\s\S]*\/guide\/wip\/[\s\S]*guide\/wip\.md/,
    );
  });

  it("leaves a custom 404 source doc to Starlight's 404 route on build:done", async () => {
    const site = makeSite({
      "src/content/docs/guide/intro.md": "",
      "src/content/docs/404.md": "",
    });
    const { integration } = await runSetup(site.rootDirPath, "build");
    const distDirPath = join(site.rootDirPath, "dist");
    mkdirSync(join(distDirPath, "guide/intro"), { recursive: true });
    writeFileSync(join(distDirPath, "guide/intro/index.html"), pageHtml(""));

    const buildDone = runBuildDoneWithAssets(
      integration,
      distDirPath,
      new Map([
        [
          "/[...slug]",
          [pathToFileURL(join(distDirPath, "guide/intro/index.html"))],
        ],
        ["/404", [pathToFileURL(join(distDirPath, "404.html"))]],
      ]),
    );

    await expect(buildDone).resolves.toBeUndefined();
  });

  it("fails build:done when Starlight's doc route is missing, listing the routes it found", async () => {
    const site = makeSite({ "src/content/docs/guide/intro.md": "" });
    const { integration } = await runSetup(site.rootDirPath, "build");

    const buildDone = runBuildDoneWithAssets(
      integration,
      join(site.rootDirPath, "dist"),
      new Map([
        ["/404", []],
        ["/grade-calculator", []],
      ]),
    );

    await expect(buildDone).rejects.toThrow(
      /\/\[\.\.\.slug\][\s\S]*not found[\s\S]*\/404, \/grade-calculator/,
    );
  });

  it("fails build:done when Starlight wrote no doc pages though source docs exist, as with prerender off", async () => {
    const site = makeSite({ "src/content/docs/guide/intro.md": "" });
    const { integration } = await runSetup(site.rootDirPath, "build");

    const buildDone = runBuildDoneWithAssets(
      integration,
      join(site.rootDirPath, "dist"),
      new Map([["/[...slug]", []]]),
    );

    await expect(buildDone).rejects.toThrow(/no doc pages[\s\S]*prerender/);
  });

  it("passes build:done on a site with no source docs but a custom 404", async () => {
    const site = makeSite({ "src/content/docs/404.md": "" });
    const { integration } = await runSetup(site.rootDirPath, "build");

    const buildDone = runBuildDoneWithAssets(
      integration,
      join(site.rootDirPath, "dist"),
      new Map([["/[...slug]", []]]),
    );

    await expect(buildDone).resolves.toBeUndefined();
  });
});
