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

  const buildDone = integration.hooks["astro:build:done"]!;
  await buildDone({
    dir: pathToFileURL(`${distDirPath}/`),
    assets: new Map([
      ["/[...slug]", toUrls(starlightDistRelativeFilePaths)],
      ["/grade-calculator", toUrls(otherRouteDistRelativeFilePaths)],
    ]),
  } as unknown as Parameters<typeof buildDone>[0]);

  return (distRelativeFilePath: string) =>
    readFileSync(join(distDirPath, distRelativeFilePath), "utf-8");
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
});
