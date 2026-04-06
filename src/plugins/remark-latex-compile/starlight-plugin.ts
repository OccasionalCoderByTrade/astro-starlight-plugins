/**
 * Starlight plugin wrapper for remark-latex-compile.
 *
 * This plugin hooks into Starlight's config:setup to inject the remark-latex-compile
 * plugin and the build-time Astro integration for scanning markdown files.
 */
import type { HookParameters } from "@astrojs/starlight/types";
import type { RemarkLatexCompileOptions } from "./index.js";
import remarkLatexCompile from "./index.js";
import { createAstroLatexIntegration } from "./astro-integration.js";

export type StarlightLatexCompileOptions = RemarkLatexCompileOptions;

export function starlightLatexCompile(options?: StarlightLatexCompileOptions) {
  return {
    name: "starlight-latex-compile",
    hooks: {
      "config:setup": (hook: HookParameters<"config:setup">) => {
        // Inject remark plugin for non-Starlight markdown processing
        hook.addIntegration({
          name: "latex-compile-remark-integration",
          hooks: {
            "astro:config:setup": ({ updateConfig, config }: any) => {
              const existingPlugins = (
                Array.isArray(config.markdown?.remarkPlugins)
                  ? config.markdown.remarkPlugins
                  : []
              ).filter((p: any) => p !== undefined && p !== null);

              updateConfig({
                markdown: {
                  remarkPlugins: [...existingPlugins, [remarkLatexCompile, options ?? {}]],
                },
              });
            },
          },
        });

        // Add build-time scanner for Starlight content
        hook.addIntegration(
          createAstroLatexIntegration({
            svgOutputDir: options?.svgOutputDir,
          })
        );
      },
    },
  };
}

export default starlightLatexCompile;
