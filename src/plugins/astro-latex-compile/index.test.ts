import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseFrontmatter, unified } from "@astrojs/markdown-remark";
import { satteri } from "@astrojs/markdown-satteri";
import type { AstroIntegration } from "astro";
import { parseFragment, serialize } from "parse5";
import remarkMath from "remark-math";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { astroLatexCompile, type LatexCompileOptions } from "./index.js";
import { writeDebugImage } from "./tex-compile-error.js";
import { makeProject } from "./test-project.js";

// Isolates the tex compile error's debug tex diagram image from the TeX
// toolchain that would draw it.
vi.mock("./tex-compile-error.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./tex-compile-error.js")>()),
  writeDebugImage: vi.fn(async () => {}),
}));

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const hasToolchain = ["pdflatex", "dvisvgm"].every(
  (tool) => spawnSync(tool, ["--version"]).status === 0,
);

type TMarkdownProcessor =
  ReturnType<typeof unified> | ReturnType<typeof satteri>;
type TConfigSetupOptions = Parameters<
  NonNullable<AstroIntegration["hooks"]["astro:config:setup"]>
>[0];
type TConfigDoneOptions = Parameters<
  NonNullable<AstroIntegration["hooks"]["astro:config:done"]>
>[0];
type TBuildDoneOptions = Parameters<
  NonNullable<AstroIntegration["hooks"]["astro:build:done"]>
>[0];

type TSiteOptions = {
  command?: "dev" | "build" | "sync";
  latexCompileOptions?: Partial<LatexCompileOptions>;
  /** Project files, as relative path → contents. */
  files?: Record<string, string>;
};

/**
 * Runs `astro:config:setup` the way Astro would, with the hook arguments the
 * integration uses, against a fresh project. `markdownConfig` is the site's
 * `markdown` config.
 */
async function runConfigSetup(
  markdownConfig: Record<string, unknown>,
  { command = "build", latexCompileOptions = {}, files }: TSiteOptions = {},
) {
  const rootDirPath = makeProject(files);
  const integration = astroLatexCompile({
    svgOutputDir: "public/tex-svgs",
    ...latexCompileOptions,
  });
  const watchedFilePaths: string[] = [];
  const updateConfig = vi.fn();
  const config = {
    root: pathToFileURL(`${rootDirPath}/`),
    publicDir: pathToFileURL(`${rootDirPath}/public/`),
    cacheDir: pathToFileURL(`${rootDirPath}/.astro/`),
    base: "/",
    markdown: markdownConfig,
  };
  await integration.hooks["astro:config:setup"]!({
    command,
    config,
    createCodegenDir: () => {
      const codegenDirPath = join(
        rootDirPath,
        ".astro/integrations/astro-latex-compile/",
      );
      mkdirSync(codegenDirPath, { recursive: true });
      return pathToFileURL(codegenDirPath);
    },
    injectScript: () => {},
    updateConfig,
    addWatchFile: (filePath: string | URL) =>
      watchedFilePaths.push(String(filePath)),
  } as unknown as TConfigSetupOptions);
  return {
    rootDirPath,
    integration,
    updateConfig,
    watchedFilePaths,
    runConfigDone: (doneMarkdownConfig: Record<string, unknown>) =>
      integration.hooks["astro:config:done"]!({
        config: { ...config, markdown: doneMarkdownConfig },
      } as unknown as TConfigDoneOptions),
    runBuildDone: () =>
      integration.hooks["astro:build:done"]!({} as TBuildDoneOptions),
  };
}

/**
 * A site on `processor`: runs both config hooks, then renders docs through
 * the processor the way Astro's content layer does.
 */
async function createSite(
  processor: TMarkdownProcessor,
  siteOptions: TSiteOptions = {},
) {
  const configHooks = await runConfigSetup({ processor }, siteOptions);
  await configHooks.runConfigDone({ processor });
  const renderer = await processor.createRenderer({ syntaxHighlight: false });
  return {
    ...configHooks,
    /** Writes `source` to `relativeFilePath`, then renders it. */
    async renderDoc(relativeFilePath: string, source: string): Promise<string> {
      const filePath = join(configHooks.rootDirPath, relativeFilePath);
      writeFileSync(filePath, source);
      // Astro strips frontmatter before handing the body to the processor.
      const { content: body } = parseFrontmatter(source);
      const { code } = await renderer.render(body, {
        fileURL: pathToFileURL(filePath),
      });
      return code;
    },
    /**
     * Writes `source` to `relativeFilePath`, then compiles it as MDX, returning
     * the JS module. `optimize` is `@astrojs/mdx`'s option of the same name.
     */
    async compileMdxDoc(
      relativeFilePath: string,
      source: string,
      { optimize = false }: { optimize?: boolean } = {},
    ): Promise<string> {
      const filePath = join(configHooks.rootDirPath, relativeFilePath);
      writeFileSync(filePath, source);
      const { content: body, frontmatter } = parseFrontmatter(source);
      const mdxRenderer = await processor.createMdxRenderer!(
        { syntaxHighlight: false },
        { optimize },
      );
      const { code } = await mdxRenderer.process(body, filePath, frontmatter);
      return code;
    },
  };
}

const documentWith = (body: string) =>
  `\\documentclass{standalone}\n\\begin{document}\n${body}\n\\end{document}`;

const texCompileBlock = (meta: string, value: string) =>
  `\`\`\`tex compile ${meta}\n${value}\n\`\`\`\n`;

/** Fails without TeX installed too, since TeX never runs on it. */
const NOT_A_LATEX_DOCUMENT = "\\tikz \\draw (0,0) -- (1,1);";

/** `count` blank lines, to put the next block on a known line. */
const blankLines = (count: number) => "\n".repeat(count);

const attributeValues = (markup: string, attribute: string) =>
  [...markup.matchAll(new RegExp(`\\s${attribute}=["']([^"']+)["']`, "g"))].map(
    (match) => match[1],
  );

const processorFactories: [string, () => TMarkdownProcessor][] = [
  ["unified", () => unified({ remarkPlugins: [remarkMath] })],
  ["satteri", () => satteri()],
];

describe.each(processorFactories)(
  "with the %s processor",
  (processorName, createProcessor) => {
    it("shows a tex compile error for an unknown compile mode", async () => {
      const site = await createSite(createProcessor());

      const html = await site.renderDoc(
        "doc.md",
        texCompileBlock("mode=svg", documentWith("Hello")),
      );

      expect(html).not.toContain("<svg");
      expect(html).toContain("mode=svg");
    });

    it("shows a tex compile error for a zoom meta that isn't true or false", async () => {
      const site = await createSite(createProcessor());

      const html = await site.renderDoc(
        "doc.md",
        texCompileBlock("zoom=maybe", documentWith("Hello")),
      );

      expect(html).not.toContain("<svg");
      expect(html).toContain("zoom=maybe");
    });

    it("shows a tex compile error without a zoom button, even when the site turns zoom on", async () => {
      const site = await createSite(createProcessor(), {
        latexCompileOptions: { zoom: true },
      });

      const html = await site.renderDoc(
        "doc.md",
        texCompileBlock("zoom mode=svg", documentWith("Hello")),
      );

      expect(html).toContain("mode=svg");
      expect(html).not.toContain("tex-zoom");
    });

    it("shows a tex compile error for a mode meta with no value", async () => {
      const site = await createSite(createProcessor());

      const html = await site.renderDoc(
        "doc.md",
        texCompileBlock("mode", documentWith("Hello")),
      );

      expect(html).not.toContain("<svg");
      expect(html).toContain("mode=dvi");
    });

    it("reports a tex compile error at the block's line in the source, frontmatter included", async () => {
      const site = await createSite(createProcessor());

      const html = await site.renderDoc(
        "doc.md",
        `---\ntitle: Doc\n---\n${blankLines(3)}${texCompileBlock("", NOT_A_LATEX_DOCUMENT)}`,
      );

      expect(html).toContain("doc.md:7");
      await expect(site.runBuildDone()).rejects.toThrow(
        /doc\.md:7: .*not a LaTeX document/,
      );
    });

    it("shows a tex compile error in an mdx doc, at the block's line in the source", async () => {
      const site = await createSite(createProcessor());

      const mdxModule = await site.compileMdxDoc(
        "doc.mdx",
        `---\ntitle: Doc\n---\n${blankLines(1)}${texCompileBlock("", "{x} *y*")}`,
      );

      expect(mdxModule).toContain("LaTeX Compilation Error");
      expect(mdxModule).toContain("doc.mdx:5");
      expect(mdxModule).toContain("{x} *y*");
    });

    it("writes the debug tex diagram image only for the last block sharing a blockid", async () => {
      const site = await createSite(createProcessor(), {
        latexCompileOptions: { debug: true },
      });

      await site.renderDoc(
        "doc.md",
        texCompileBlock("blockid=1", "first") +
          blankLines(1) +
          texCompileBlock("blockid=1", "second"),
      );

      expect(writeDebugImage).toHaveBeenCalledOnce();
      const [, location] = vi.mocked(writeDebugImage).mock.calls[0];
      expect(location).toMatch(/doc\.md:5$/);
    });

    describe("on build", () => {
      it("fails the build, listing every tex compile error by location", async () => {
        const site = await createSite(createProcessor());

        await site.renderDoc(
          "a.md",
          blankLines(11) + texCompileBlock("", NOT_A_LATEX_DOCUMENT),
        );
        await site.renderDoc(
          "b.md",
          blankLines(39) + texCompileBlock("", NOT_A_LATEX_DOCUMENT),
        );

        const rejection = site.runBuildDone();
        await expect(rejection).rejects.toThrow(/2 tex compile errors/);
        await expect(rejection).rejects.toThrow(
          /a\.md:12: .*not a LaTeX document/,
        );
        await expect(rejection).rejects.toThrow(
          /b\.md:40: .*not a LaTeX document/,
        );
      });

      it("reports a missing toolchain and the other tex compile errors together", async () => {
        const site = await createSite(createProcessor());
        vi.stubEnv("PATH", "");

        await site.renderDoc(
          "doc.md",
          texCompileBlock("", documentWith("x")) +
            blankLines(1) +
            texCompileBlock("", NOT_A_LATEX_DOCUMENT),
        );

        const rejection = site.runBuildDone();
        await expect(rejection).rejects.toThrow(/pdflatex not found on PATH/);
        await expect(rejection).rejects.toThrow(/1 tex compile error:/);
        await expect(rejection).rejects.toThrow(
          /doc\.md:8: .*not a LaTeX document/,
        );
      });

      it("fails the build when rendering a doc throws outside any one block", async () => {
        const site = await createSite(createProcessor());
        // Reporting the block's tex compile error throws, past the point
        // where a block's own errors are confined to it.
        vi.mocked(console.error).mockImplementationOnce(() => {
          throw new Error("stderr is closed");
        });

        await expect(
          site.renderDoc(
            "broken.md",
            texCompileBlock("", NOT_A_LATEX_DOCUMENT),
          ),
        ).rejects.toThrow(/stderr is closed/);

        await expect(site.runBuildDone()).rejects.toThrow(
          /broken\.md: Unexpected error: /,
        );
      });

      it("keeps orphaned tex diagrams when the build fails", async () => {
        const site = await createSite(createProcessor(), {
          files: { "public/tex-svgs/0123456789abcdef.svg": "<svg></svg>" },
          latexCompileOptions: { removeOrphanedSvgs: true },
        });

        await site.renderDoc(
          "doc.md",
          texCompileBlock("", NOT_A_LATEX_DOCUMENT),
        );

        await expect(site.runBuildDone()).rejects.toThrow();
        expect(
          existsSync(
            join(site.rootDirPath, "public/tex-svgs/0123456789abcdef.svg"),
          ),
        ).toBe(true);
      });

      it("passes a build with no tex compile blocks", async () => {
        const site = await createSite(createProcessor());

        await site.renderDoc("doc.md", "# Just prose\n");

        await expect(site.runBuildDone()).resolves.toBeUndefined();
      });
    });

    describe.skipIf(!hasToolchain)("with TeX installed", () => {
      it("inlines the compiled tex diagram as an svg element", async () => {
        const site = await createSite(createProcessor());

        const html = await site.renderDoc(
          "doc.md",
          texCompileBlock('alt="A greeting"', documentWith("Hello")),
        );

        expect(html).toMatch(
          /^<svg class="tex-compiled" role="img" aria-label="A greeting"[\s>]/,
        );
        expect(html).toMatch(/<text[^>]*>Hello<\/text>/);
      });

      it("sizes the inlined compiled tex diagram in em", async () => {
        const site = await createSite(createProcessor());

        const html = await site.renderDoc(
          "doc.md",
          texCompileBlock("", documentWith("Hello")),
        );

        const rootTag = html.match(/^<svg\b[^>]*>/)?.[0] ?? "";
        expect(rootTag).toMatch(/\swidth=['"][\d.]+em['"]/);
        expect(rootTag).toMatch(/\sheight=['"][\d.]+em['"]/);
      });

      it("inlines the compiled tex diagram in an mdx doc, with its markup kept as is", async () => {
        const site = await createSite(createProcessor());

        const mdxModule = await site.compileMdxDoc(
          "doc.mdx",
          `export const greeting = "hi";\n\n${texCompileBlock(
            'alt="A greeting"',
            documentWith("Hello $x^{2}$ *y*"),
          )}`,
        );

        expect(mdxModule).toContain("tex-compiled");
        expect(mdxModule).toContain("A greeting");
        // The font CSS stays one string, not Markdown paragraphs.
        expect(mdxModule).toMatch(/(children|"set:html"): "[^"]*@font-face\{/);
        expect(mdxModule).not.toMatch(/components\.(p|em)\b/);
      });

      it("keeps the compiled tex diagram's font CSS in an optimized mdx doc", async () => {
        const site = await createSite(createProcessor());

        const mdxModule = await site.compileMdxDoc(
          "doc.mdx",
          texCompileBlock("", documentWith("Hello $x$")),
          { optimize: true },
        );

        expect(mdxModule).toContain("@font-face{");
        // Not moved into an attribute, where the browser would never read it.
        expect(mdxModule).not.toMatch(/<style[^>]*set:html/);
      });

      it("applies svgClassname, unless the block's class meta overrides it", async () => {
        const site = await createSite(createProcessor(), {
          latexCompileOptions: { svgClassname: "site-diagram" },
        });

        const defaultHtml = await site.renderDoc(
          "default.md",
          texCompileBlock("", documentWith("Hello")),
        );
        const overriddenHtml = await site.renderDoc(
          "overridden.md",
          texCompileBlock('class="wide framed"', documentWith("Hello")),
        );

        expect(defaultHtml).toMatch(/^<svg class="tex-compiled site-diagram"/);
        expect(overriddenHtml).toMatch(
          /^<svg class="tex-compiled wide framed"/,
        );
      });

      it("escapes the alt text", async () => {
        const site = await createSite(createProcessor());

        const html = await site.renderDoc(
          "doc.md",
          texCompileBlock("alt=\"x < y & 'z'\"", documentWith("Hello")),
        );

        // The processor may re-serialize the attribute, so any valid escaping counts.
        expect(html).toMatch(
          /aria-label="x (<|&lt;|&#x3C;) y (&amp;|&#x26;) ('|&#x27;)z('|&#x27;)"/,
        );
      });

      describe("zoom", () => {
        it("wraps the compiled tex diagram with a zoom button when the site turns zoom on", async () => {
          const site = await createSite(createProcessor(), {
            latexCompileOptions: { zoom: true },
          });

          const html = await site.renderDoc(
            "doc.md",
            texCompileBlock("", documentWith("Hello")),
          );

          expect(html).toMatch(
            /^<div class="tex-zoom-frame"><svg class="tex-compiled"/,
          );
          expect(html).toMatch(
            /<\/svg><button type="button" class="tex-zoom-button" aria-label="Zoom diagram"[^>]*>.*<\/button><\/div>\s*$/s,
          );
        });

        it("captions the zoom view with the alt text only when the block sets one", async () => {
          const site = await createSite(createProcessor(), {
            latexCompileOptions: { zoom: true },
          });

          const captionedHtml = await site.renderDoc(
            "captioned.md",
            texCompileBlock("alt=\"x < y & 'z'\"", documentWith("Hello")),
          );
          const uncaptionedHtml = await site.renderDoc(
            "uncaptioned.md",
            texCompileBlock("", documentWith("Hello")),
          );

          // The processor may re-serialize the attribute, so any valid escaping counts.
          expect(captionedHtml).toMatch(
            /^<div class="tex-zoom-frame" data-caption="x (<|&lt;|&#x3C;) y (&amp;|&#x26;) ('|&#x27;)z('|&#x27;)">/,
          );
          expect(uncaptionedHtml).toMatch(/^<div class="tex-zoom-frame">/);
        });

        it("leaves the zoom view uncaptioned for an empty alt", async () => {
          const site = await createSite(createProcessor(), {
            latexCompileOptions: { zoom: true },
          });

          const html = await site.renderDoc(
            "doc.md",
            texCompileBlock('alt=""', documentWith("Hello")),
          );

          expect(html).toMatch(/^<div class="tex-zoom-frame">/);
        });

        it("keeps the zoom button in an mdx doc", async () => {
          const site = await createSite(createProcessor(), {
            latexCompileOptions: { zoom: true },
          });

          const mdxModule = await site.compileMdxDoc(
            "doc.mdx",
            texCompileBlock('alt="A greeting"', documentWith("Hello")),
          );

          expect(mdxModule).toContain("tex-zoom-frame");
          expect(mdxModule).toContain("tex-zoom-button");
          expect(mdxModule).toMatch(/"data-caption": "A greeting"/);
        });

        it("lets a block's zoom meta override the site's zoom option", async () => {
          const zoomOffSite = await createSite(createProcessor());
          const zoomOnSite = await createSite(createProcessor(), {
            latexCompileOptions: { zoom: true },
          });

          const zoomedHtml = await zoomOffSite.renderDoc(
            "doc.md",
            texCompileBlock("zoom", documentWith("Hello")),
          );
          const explicitlyZoomedHtml = await zoomOffSite.renderDoc(
            "explicit.md",
            texCompileBlock("zoom=true", documentWith("Hello")),
          );
          const unzoomedHtml = await zoomOnSite.renderDoc(
            "doc.md",
            texCompileBlock("zoom=false", documentWith("Hello")),
          );

          expect(zoomedHtml).toMatch(/^<div class="tex-zoom-frame">/);
          expect(explicitlyZoomedHtml).toMatch(/^<div class="tex-zoom-frame">/);
          expect(unzoomedHtml).toMatch(/^<svg class="tex-compiled"/);
          expect(unzoomedHtml).not.toContain("tex-zoom-button");
        });
      });

      it("draws text as shapes for a block in pdf compile mode", async () => {
        const site = await createSite(createProcessor());

        const html = await site.renderDoc(
          "doc.md",
          texCompileBlock("mode=pdf", documentWith("Hello")),
        );

        expect(html).toMatch(/^<svg class="tex-compiled"/);
        expect(html).not.toContain("<text");
      });

      it("gives two diagrams on one page no ids or classes in common", async () => {
        const site = await createSite(createProcessor());

        const html = await site.renderDoc(
          "doc.md",
          texCompileBlock("", documentWith("Hello $x$")) +
            blankLines(1) +
            texCompileBlock("", documentWith("Goodbye $y$")),
        );
        const [firstHtml, secondHtml] = html.split(
          /(?=<svg class="tex-compiled")/,
        );

        for (const attribute of ["id", "class"]) {
          const firstValues = new Set(attributeValues(firstHtml, attribute));
          // `tex-compiled` is the root class every diagram carries on purpose.
          const sharedValues = attributeValues(secondHtml, attribute).filter(
            (value) => value !== "tex-compiled" && firstValues.has(value),
          );
          expect(sharedValues).toEqual([]);
        }
      });

      it("removes an orphaned tex diagram after a passing build, and keeps the referenced one", async () => {
        const site = await createSite(createProcessor(), {
          files: { "public/tex-svgs/0123456789abcdef.svg": "<svg></svg>" },
          latexCompileOptions: { removeOrphanedSvgs: true },
        });

        await site.renderDoc(
          "doc.md",
          texCompileBlock("", documentWith("Hello")),
        );
        await site.runBuildDone();

        const svgFileNames = readdirSync(
          join(site.rootDirPath, "public/tex-svgs"),
        ).filter((fileName) => fileName.endsWith(".svg"));
        expect(svgFileNames).toHaveLength(1);
        expect(svgFileNames).not.toContain("0123456789abcdef.svg");
      });
    });
  },
);

describe.skipIf(!hasToolchain)("on both processors, with TeX installed", () => {
  it("inlines the same svg markup", async () => {
    const doc = texCompileBlock(
      'class="wide" alt="x < y & \'z\'"',
      documentWith("Hello $x$"),
    );
    // Re-serializing through one HTML parser keeps only differences a browser would see.
    const canonicalHtml = (html: string) =>
      serialize(parseFragment(html)).trim();

    const unifiedSite = await createSite(unified());
    const unifiedHtml = canonicalHtml(
      await unifiedSite.renderDoc("doc.md", doc),
    );
    // dvisvgm's embedded fonts differ between runs, so the Sätteri site reuses
    // the compiled tex diagram the unified site wrote.
    const svgDirPath = join(unifiedSite.rootDirPath, "public/tex-svgs");
    const svgFiles = Object.fromEntries(
      readdirSync(svgDirPath).map((fileName) => [
        `public/tex-svgs/${fileName}`,
        readFileSync(join(svgDirPath, fileName), "utf-8"),
      ]),
    );
    const satteriSite = await createSite(satteri(), { files: svgFiles });
    const satteriHtml = canonicalHtml(
      await satteriSite.renderDoc("doc.md", doc),
    );

    expect(unifiedHtml).toMatch(/^<svg class="tex-compiled wide"/);
    expect(satteriHtml).toBe(unifiedHtml);
  });
});

describe("registration", () => {
  it("adds only itself to markdown.remarkPlugins when there's no processor (before Astro 7)", async () => {
    const { updateConfig, runConfigDone } = await runConfigSetup({
      remarkPlugins: [remarkMath],
    });

    expect(updateConfig).toHaveBeenCalledOnce();
    const addedRemarkPlugins: unknown[] =
      updateConfig.mock.calls[0][0].markdown.remarkPlugins;
    expect(addedRemarkPlugins).toHaveLength(1);
    expect(addedRemarkPlugins).not.toContain(remarkMath);
    expect(() =>
      runConfigDone({ remarkPlugins: [remarkMath, ...addedRemarkPlugins] }),
    ).not.toThrow();
  });

  it("fails at startup on a processor other than unified or satteri", async () => {
    await expect(
      runConfigSetup({ processor: { name: "custom", options: {} } }),
    ).rejects.toThrow(/\[astro-latex-compile\].*"custom".*not supported/);
  });

  it.each(processorFactories)(
    "fails at config:done when a later integration replaced the %s processor",
    async (_processorName, createProcessor) => {
      const { runConfigDone } = await runConfigSetup({
        processor: createProcessor(),
      });

      expect(() => runConfigDone({ processor: createProcessor() })).toThrow(
        /\[astro-latex-compile\] An integration listed after astroLatexCompile replaced `markdown.processor`/,
      );
    },
  );

  it("runs a site's legacy markdown.remarkPlugins entry once per doc on the unified processor", async () => {
    let userPluginRunCount = 0;
    const countingRemarkPlugin = () => () => {
      userPluginRunCount++;
    };
    const processor = unified();
    const markdownConfig = {
      processor,
      remarkPlugins: [countingRemarkPlugin],
    };
    // Astro folds legacy `markdown.remarkPlugins` into the unified processor
    // when it validates the user config, then again for the entries
    // integrations add through `updateConfig`.
    processor.options.remarkPlugins.push(countingRemarkPlugin);
    const { updateConfig, runConfigDone } =
      await runConfigSetup(markdownConfig);
    for (const [configUpdate] of updateConfig.mock.calls) {
      processor.options.remarkPlugins.push(
        ...(configUpdate.markdown?.remarkPlugins ?? []),
      );
    }
    await runConfigDone(markdownConfig);

    const renderer = await processor.createRenderer({ syntaxHighlight: false });
    await renderer.render("# One doc\n");

    expect(userPluginRunCount).toBe(1);
  });
});

describe("startup", () => {
  it("rejects an invalid debug path for every command, not just dev and build", async () => {
    await expect(
      runConfigSetup(
        { processor: unified() },
        { command: "sync", latexCompileOptions: { debug: { outputDir: "" } } },
      ),
    ).rejects.toThrow(/debug\.outputDir/);
  });
});

describe("tex input dirs", () => {
  it("fails dev when a tex input dir doesn't exist", async () => {
    await expect(
      runConfigSetup(
        { processor: unified() },
        {
          command: "dev",
          latexCompileOptions: { texInputDirs: ["src/latx//"] },
        },
      ),
    ).rejects.toThrow(/src\/latx\/\//);
  });

  it("only warns on build when a tex input dir doesn't exist, since git drops empty dirs", async () => {
    await runConfigSetup(
      { processor: unified() },
      { latexCompileOptions: { texInputDirs: ["src/latex//"] } },
    );

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("src/latex//"),
    );
  });

  it("names the missing tex input dir when a build without TeX then fails", async () => {
    const site = await createSite(unified(), {
      latexCompileOptions: { texInputDirs: ["src/latex//"] },
    });
    vi.stubEnv("PATH", "");

    await site.renderDoc("doc.md", texCompileBlock("", documentWith("x")));

    await expect(site.runBuildDone()).rejects.toThrow(/src\/latex\/\//);
  });

  it("watches every tex input file in dev", async () => {
    const { rootDirPath, watchedFilePaths } = await runConfigSetup(
      { processor: unified() },
      {
        command: "dev",
        latexCompileOptions: { texInputDirs: ["src/latex//"] },
        files: {
          "src/latex/macros.tex": "",
          "src/latex/nested/sizes.tex": "",
          "src/latex/macros.aux": "",
        },
      },
    );

    expect(watchedFilePaths.sort()).toEqual([
      join(rootDirPath, "src/latex/macros.tex"),
      join(rootDirPath, "src/latex/nested/sizes.tex"),
    ]);
  });

  // Astro clears its content store when the JSON of its config changes, and
  // that is what makes cached docs re-render with the new compiled tex diagrams.
  it.each(processorFactories)(
    "changes the markdown config Astro hashes exactly when a tex input file changes, with the %s processor",
    async (_processorName, createProcessor) => {
      const files = { "src/latex/macros.tex": "\\def\\pad{0.12}" };
      const latexCompileOptions = { texInputDirs: ["src/latex//"] };
      const markdownConfigJson = async (macros: string) => {
        const processor = createProcessor();
        await runConfigSetup(
          { processor },
          {
            command: "dev",
            latexCompileOptions,
            files: { "src/latex/macros.tex": macros },
          },
        );
        return JSON.stringify({ processor });
      };

      const initialMarkdownConfigJson = await markdownConfigJson(
        files["src/latex/macros.tex"],
      );
      expect(await markdownConfigJson(files["src/latex/macros.tex"])).toBe(
        initialMarkdownConfigJson,
      );
      expect(await markdownConfigJson("\\def\\pad{0.2}")).not.toBe(
        initialMarkdownConfigJson,
      );
    },
  );
});
