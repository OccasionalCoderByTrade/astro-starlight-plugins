import type { HookParameters } from "@astrojs/starlight/types";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TSidebarGroup } from "../utils/sidebar-types.js";
import { getIndexMdSidebarItems } from "./utils.js";

/**
 * Configuration options for sidebar generation behavior.
 */
type TOptions = {
  /**
   * Controls how deep the nested group structure can go, where the root directory is level 0.
   * Once this depth is reached, no further child groups are created; instead, any index.md or index.mdx
   * files found deeper in the subtree are flattened and included as slug items directly at the current level.
   * @default 100
   */
  maxDepthNesting?: number;

  /**
   * When true, all labels (both group labels and slug item labels) are derived from the raw directory name.
   * When false, the label for a slug item is read from the index.md or index.mdx file's frontmatter
   * `sidebar.label`, then `title`; group labels are still derived from the raw directory name.
   * Either way, a slug item shows its frontmatter `sidebar.badge`.
   * @default true
   */
  dirnameDeterminesLabels?: boolean;
};

/**
 * Options for the starlightIndexOnlySidebar plugin.
 * Automatically generates a sidebar configuration by scanning for index.md/index.mdx files in specified directories.
 */
type TIndexOnlySidebarPluginOptions = TOptions & {
  /**
   * Array of directory names (relative to the docs root, `content/docs/` under Astro's `srcDir`) to scan for sidebar generation.
   * Each directory will become a top-level group in the sidebar.
   * @example ["reference", "guides", "api-docs"]
   */
  directories: string[];
};

/**
 * Starlight plugin that automatically generates a sidebar configuration by scanning the filesystem
 * for index.md/index.mdx files in specified directories.
 *
 * @param pluginOptions - Configuration options for the sidebar generation
 * @returns A Starlight plugin object
 * @example
 * starlightIndexOnlySidebar({
 *   maxDepthNesting: 1,
 *   dirnameDeterminesLabels: true,
 *   directories: ["reference", "guides"],
 * })
 */
export function starlightIndexOnlySidebar(
  pluginOptions: TIndexOnlySidebarPluginOptions,
) {
  return {
    name: "index-only-sidebar",
    hooks: {
      "config:setup": (hookOptions: HookParameters<"config:setup">) => {
        const { updateConfig, astroConfig } = hookOptions;
        const { directories, maxDepthNesting, dirnameDeterminesLabels } =
          pluginOptions;
        const functionOptions: TOptions = {
          maxDepthNesting,
          dirnameDeterminesLabels,
        };

        const docsDirPath = fileURLToPath(
          new URL("content/docs/", astroConfig.srcDir),
        );

        const sidebarItems = directories
          .map((directory) => {
            const dirPath = join(docsDirPath, directory);
            const rawItems = getIndexMdSidebarItems(
              docsDirPath,
              dirPath,
              functionOptions,
            );
            // Remove the root group wrapper that getIndexMdSidebarItems adds
            const rootGroup = rawItems[0];
            if (!rootGroup || !("items" in rootGroup)) {
              return undefined;
            }
            return {
              label: rootGroup.label,
              items: rootGroup.items,
            };
          })
          .filter(
            (group): group is TSidebarGroup =>
              group !== undefined && group.items.length > 0,
          ); // remove empty groups

        updateConfig({
          sidebar: sidebarItems,
        });
      },
    },
  };
}
