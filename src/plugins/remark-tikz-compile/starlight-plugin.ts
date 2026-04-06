/**
 * Starlight plugin wrapper for remark-tikz-compile.
 *
 * This plugin hooks into Starlight's config:setup to inject the remark-tikz-compile
 * plugin and the build-time Astro integration for scanning markdown files.
 */
import type { HookParameters } from "@astrojs/starlight/types";
import type { RemarkTikzCompileOptions } from "./index.js";
import remarkTikzCompile from "./index.js";
import { createAstroTikzIntegration } from "./astro-integration.js";

export type StarlightTikzCompileOptions = RemarkTikzCompileOptions;

export function starlightTikzCompile(options?: StarlightTikzCompileOptions) {
  return {
    name: "starlight-tikz-compile",
    hooks: {
      "config:setup": (hook: HookParameters<"config:setup">) => {
        // Inject remark plugin for non-Starlight markdown processing
        hook.addIntegration({
          name: "tikz-compile-remark-integration",
          hooks: {
            "astro:config:setup": ({ updateConfig, config }: any) => {
              const existingPlugins = (
                Array.isArray(config.markdown?.remarkPlugins)
                  ? config.markdown.remarkPlugins
                  : []
              ).filter((p: any) => p !== undefined && p !== null);

              updateConfig({
                markdown: {
                  remarkPlugins: [...existingPlugins, [remarkTikzCompile, options ?? {}]],
                },
              });
            },
          },
        });

        // Add build-time scanner for Starlight content
        hook.addIntegration(
          createAstroTikzIntegration({
            svgOutputDir: options?.svgOutputDir,
          })
        );
      },
    },
  };
}

export default starlightTikzCompile;
