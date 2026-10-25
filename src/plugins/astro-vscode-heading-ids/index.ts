import type { AstroIntegration } from "astro";
import { remarkVscodeHeadingIds, satteriVscodeHeadingIds } from "./utils.js";

/** What the plugin uses of `config.markdown`, on Astro 7 and on earlier versions. */
type TMarkdownConfig = {
  processor?: { name: string; options: Record<string, unknown[] | undefined> };
  remarkPlugins?: unknown[];
};

/**
 * Astro integration that gives every Markdown and MDX heading its VS Code heading ID: the id
 * VS Code's markdown link resolver gives it, with VS Code's default math support, so a
 * `#fragment` link that works in the editor works on the site too. A heading that already
 * has an id keeps it.
 *
 * It registers itself into `markdown.processor` (`unified` or `satteri`), or into
 * `markdown.remarkPlugins` before Astro 7, and fails at startup for any other processor.
 */
export function astroVscodeHeadingIds(): AstroIntegration {
  let registeredPlugin: unknown;
  let registeredPluginListKey: "remarkPlugins" | "mdastPlugins";

  return {
    name: "astro-vscode-heading-ids",
    hooks: {
      "astro:config:setup": ({ config, updateConfig }) => {
        const { processor } = config.markdown as TMarkdownConfig;
        if (!processor) {
          registeredPlugin = remarkVscodeHeadingIds;
          registeredPluginListKey = "remarkPlugins";
          updateConfig({
            markdown: { remarkPlugins: [remarkVscodeHeadingIds] },
          });
          return;
        }

        if (processor.name === "unified") {
          registeredPlugin = remarkVscodeHeadingIds;
          registeredPluginListKey = "remarkPlugins";
        } else if (processor.name === "satteri") {
          registeredPlugin = satteriVscodeHeadingIds;
          registeredPluginListKey = "mdastPlugins";
        } else {
          throw new Error(
            `[astro-vscode-heading-ids] The configured \`markdown.processor\` ("${processor.name}") ` +
              "is not supported. Use `unified()` from `@astrojs/markdown-remark` or " +
              "`satteri()` from `@astrojs/markdown-satteri`.",
          );
        }
        processor.options[registeredPluginListKey]!.push(registeredPlugin);
      },

      "astro:config:done": ({ config }) => {
        const { processor, remarkPlugins } = config.markdown as TMarkdownConfig;
        const registeredPluginList = processor
          ? processor.options[registeredPluginListKey]
          : remarkPlugins;
        if (!registeredPluginList?.includes(registeredPlugin)) {
          throw new Error(
            "[astro-vscode-heading-ids] An integration listed after astroVscodeHeadingIds " +
              "replaced `markdown.processor`, so headings won't get VS Code heading IDs. " +
              "Configure the processor in `markdown.processor` instead.",
          );
        }
      },
    },
  };
}
