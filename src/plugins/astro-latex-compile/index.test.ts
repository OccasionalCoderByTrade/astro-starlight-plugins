import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Root } from "mdast";
import type { VFile } from "vfile";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { astroLatexCompile, type LatexCompileOptions } from "./index.js";
import { makeProject } from "./test-project.js";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** Runs `astro:config:setup` the way Astro would, with the hook arguments it uses. */
async function runSetup(
  rootDirPath: string,
  command: string,
  options: Partial<LatexCompileOptions> = {},
) {
  const integration = astroLatexCompile({
    svgOutputDir: "public/tex-svgs",
    ...options,
  });
  const setup = integration.hooks["astro:config:setup"]!;
  const watchedFilePaths: string[] = [];
  const remarkPlugins: unknown[] = [];
  const params = {
    command,
    config: {
      root: pathToFileURL(`${rootDirPath}/`),
      publicDir: pathToFileURL(`${rootDirPath}/public/`),
      cacheDir: pathToFileURL(`${rootDirPath}/.astro/`),
      base: "/",
      markdown: { remarkPlugins: [] },
    },
    createCodegenDir: () => {
      const codegenDirPath = join(
        rootDirPath,
        ".astro/integrations/astro-latex-compile/",
      );
      mkdirSync(codegenDirPath, { recursive: true });
      return pathToFileURL(codegenDirPath);
    },
    injectScript: () => {},
    updateConfig: (update: { markdown?: { remarkPlugins?: unknown[] } }) =>
      remarkPlugins.push(...(update.markdown?.remarkPlugins ?? [])),
    addWatchFile: (filePath: string | URL) =>
      watchedFilePaths.push(String(filePath)),
  } as unknown as Parameters<typeof setup>[0];

  await setup(params);
  return { integration, watchedFilePaths, remarkPlugins };
}

describe("astroLatexCompile", () => {
  it("rejects an invalid debug path for every command, not just dev and build", async () => {
    await expect(
      runSetup(makeProject(), "sync", { debug: { outputDir: "" } }),
    ).rejects.toThrow(/debug\.outputDir/);
  });

  describe("tex input dirs", () => {
    it("fails dev when a tex input dir doesn't exist", async () => {
      await expect(
        runSetup(makeProject(), "dev", { texInputDirs: ["src/latx//"] }),
      ).rejects.toThrow(/src\/latx\/\//);
    });

    it("only warns on build when a tex input dir doesn't exist, since git drops empty dirs", async () => {
      await runSetup(makeProject(), "build", { texInputDirs: ["src/latex//"] });

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("src/latex//"),
      );
    });

    it("names the missing tex input dir when a build without TeX then fails", async () => {
      const rootDirPath = makeProject();
      const { integration, remarkPlugins } = await runSetup(
        rootDirPath,
        "build",
        { texInputDirs: ["src/latex//"] },
      );
      const [remarkPlugin] = remarkPlugins.at(-1) as [
        () => (tree: Root, file: VFile) => Promise<void>,
      ];
      const transform = remarkPlugin();
      vi.stubEnv("PATH", "");
      const tree: Root = {
        type: "root",
        children: [
          {
            type: "code",
            lang: "tex",
            meta: "compile",
            value:
              "\\documentclass{standalone}\n\\begin{document}\nx\n\\end{document}",
          },
        ],
      };
      await transform(tree, { path: join(rootDirPath, "doc.md") } as VFile);

      const buildDone = integration.hooks["astro:build:done"]!;
      await expect(
        buildDone({} as Parameters<typeof buildDone>[0]),
      ).rejects.toThrow(/src\/latex\/\//);
    });

    it("watches every tex input file in dev", async () => {
      const rootDirPath = makeProject({
        "src/latex/macros.tex": "",
        "src/latex/nested/sizes.tex": "",
        "src/latex/macros.aux": "",
      });

      const { watchedFilePaths } = await runSetup(rootDirPath, "dev", {
        texInputDirs: ["src/latex//"],
      });

      expect(watchedFilePaths.sort()).toEqual([
        join(rootDirPath, "src/latex/macros.tex"),
        join(rootDirPath, "src/latex/nested/sizes.tex"),
      ]);
    });

    // Astro clears its content store when the JSON of its config changes, and
    // that is what makes cached docs re-render with the new compiled tex diagrams.
    it("changes the markdown config Astro hashes exactly when a tex input file changes", async () => {
      const rootDirPath = makeProject({
        "src/latex/macros.tex": "\\def\\pad{0.12}",
      });
      const options = { texInputDirs: ["src/latex//"] };
      const markdownConfigJson = async () =>
        JSON.stringify(
          (await runSetup(rootDirPath, "dev", options)).remarkPlugins,
        );

      const initialMarkdownConfigJson = await markdownConfigJson();
      expect(await markdownConfigJson()).toBe(initialMarkdownConfigJson);

      writeFileSync(
        join(rootDirPath, "src/latex/macros.tex"),
        "\\def\\pad{0.2}",
      );
      expect(await markdownConfigJson()).not.toBe(initialMarkdownConfigJson);
    });
  });
});
