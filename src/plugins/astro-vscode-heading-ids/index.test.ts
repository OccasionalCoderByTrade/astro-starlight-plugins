import { satteri } from "@astrojs/markdown-satteri";
import { unified } from "@astrojs/markdown-remark";
import type { AstroIntegration } from "astro";
import remarkMath from "remark-math";
import { describe, expect, it, vi } from "vitest";
import { astroVscodeHeadingIds } from "./index.js";

type TMarkdownProcessor =
  ReturnType<typeof unified> | ReturnType<typeof satteri>;

/** Runs `astro:config:setup` and `astro:config:done` with the hook arguments the plugin uses. */
async function runConfigHooks(markdownConfig: Record<string, unknown>) {
  const integration: AstroIntegration = astroVscodeHeadingIds();
  const updateConfig = vi.fn();
  const config = { markdown: markdownConfig };
  await integration.hooks["astro:config:setup"]!({
    config,
    updateConfig,
  } as unknown as Parameters<
    NonNullable<AstroIntegration["hooks"]["astro:config:setup"]>
  >[0]);
  return {
    updateConfig,
    runConfigDone: (doneMarkdownConfig: Record<string, unknown>) =>
      integration.hooks["astro:config:done"]!({
        config: { markdown: doneMarkdownConfig },
      } as unknown as Parameters<
        NonNullable<AstroIntegration["hooks"]["astro:config:done"]>
      >[0]),
  };
}

async function renderHeadingIds(
  processor: TMarkdownProcessor,
  markdown: string,
): Promise<string[]> {
  await runConfigHooks({ processor });
  const renderer = await processor.createRenderer({ syntaxHighlight: false });
  const { code } = await renderer.render(markdown);
  return [...code.matchAll(/<h\d id="([^"]*)"/g)].map((match) => match[1]);
}

const processorFactories: [string, () => TMarkdownProcessor][] = [
  ["unified", () => unified({ remarkPlugins: [remarkMath] })],
  ["satteri", () => satteri({ features: { math: true } })],
];

describe.each(processorFactories)(
  "with the %s processor",
  (_name, createProcessor) => {
    it("drops inline math, as VS Code does with math on", async () => {
      expect(
        await renderHeadingIds(
          createProcessor(),
          "# Big $O(n^2)$ time\n\n## $x$",
        ),
      ).toEqual(["big--time", ""]);
    });

    it("drops math nested inside other inline nodes", async () => {
      expect(
        await renderHeadingIds(createProcessor(), "## **Bold $x$** text"),
      ).toEqual(["bold--text"]);
    });

    it("keeps the text of bold, inline code and links", async () => {
      expect(
        await renderHeadingIds(
          createProcessor(),
          "## **Bold** and `code` and [link](x)",
        ),
      ).toEqual(["bold-and-code-and-link"]);
    });

    it("keeps image alt text", async () => {
      expect(
        await renderHeadingIds(
          createProcessor(),
          "## Image ![alt text](a.png) here",
        ),
      ).toEqual(["image-alt-text-here"]);
    });

    it("drops inline HTML tags but keeps the text between them", async () => {
      expect(
        await renderHeadingIds(
          createProcessor(),
          "## Some <b>bold</b> <br> words",
        ),
      ).toEqual(["some-bold--words"]);
    });

    it("numbers duplicate headings", async () => {
      expect(
        await renderHeadingIds(createProcessor(), "## Dup\n\n## Dup"),
      ).toEqual(["dup", "dup-1"]);
    });
  },
);

it("keeps an id another plugin set, and still counts it toward duplicates", async () => {
  const presetIdPlugin =
    () => (tree: { children: { type: string; data?: unknown }[] }) => {
      const firstHeading = tree.children.find(({ type }) => type === "heading");
      if (firstHeading) firstHeading.data = { hProperties: { id: "preset" } };
    };
  const processor = unified({ remarkPlugins: [presetIdPlugin] });
  expect(await renderHeadingIds(processor, "## Dup\n\n## Dup")).toEqual([
    "preset",
    "dup-1",
  ]);
});

it("registers through markdown.remarkPlugins when there's no processor (before Astro 7)", async () => {
  const { updateConfig, runConfigDone } = await runConfigHooks({
    remarkPlugins: [],
  });
  expect(updateConfig).toHaveBeenCalledOnce();
  const registeredRemarkPlugins: unknown[] =
    updateConfig.mock.calls[0][0].markdown.remarkPlugins;
  expect(registeredRemarkPlugins).toHaveLength(1);
  expect(() =>
    runConfigDone({ remarkPlugins: registeredRemarkPlugins }),
  ).not.toThrow();
});

it("adds only itself to markdown.remarkPlugins, without repeating the site's own remark plugins", async () => {
  const { updateConfig, runConfigDone } = await runConfigHooks({
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

it("fails at config:done when markdown.remarkPlugins lost it (before Astro 7)", async () => {
  const { runConfigDone } = await runConfigHooks({ remarkPlugins: [] });
  expect(() => runConfigDone({ remarkPlugins: [remarkMath] })).toThrow(
    /\[astro-vscode-heading-ids\].*replaced `markdown.processor`/,
  );
});

it("fails at startup on a processor other than unified or satteri", async () => {
  await expect(
    runConfigHooks({ processor: { name: "custom", options: {} } }),
  ).rejects.toThrow(/\[astro-vscode-heading-ids\].*"custom".*not supported/);
});

it("fails at config:done when a later integration replaced the processor", async () => {
  const { runConfigDone } = await runConfigHooks({ processor: unified() });
  expect(() => runConfigDone({ processor: unified() })).toThrow(
    /\[astro-vscode-heading-ids\] An integration listed after astroVscodeHeadingIds replaced `markdown.processor`/,
  );
});
