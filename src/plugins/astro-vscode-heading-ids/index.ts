import type { AstroIntegration } from "astro";
import { createProcessorRegistration } from "../utils/processor-registration.js";
import { remarkVscodeHeadingIds, satteriVscodeHeadingIds } from "./utils.js";

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
  const processorRegistration = createProcessorRegistration({
    pluginName: "astro-vscode-heading-ids",
    remarkPlugin: remarkVscodeHeadingIds,
    satteriPlugin: satteriVscodeHeadingIds,
  });

  return {
    name: "astro-vscode-heading-ids",
    hooks: {
      "astro:config:setup": ({ config, updateConfig }) => {
        processorRegistration.register(config, updateConfig);
      },

      "astro:config:done": ({ config }) => {
        processorRegistration.assertStillRegistered(config);
      },
    },
  };
}
