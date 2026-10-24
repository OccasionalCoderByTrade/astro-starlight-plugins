import type { HookParameters } from "@astrojs/starlight/types";
import { fileURLToPath } from "node:url";
import { validateSidebarOptions } from "../utils/sidebar-options.js";
import { normalizeSidebarSlug } from "../utils/sidebar-slugs.js";
import type { TSidebarGroup, TSidebarItem } from "../utils/sidebar-types.js";
import { getIndexMdSidebarItems, SOURCE_DOC_EXTENSIONS } from "./utils.js";

/**
 * Configuration options for sidebar generation behavior.
 */
type TOptions = {
  /**
   * The most levels of groups the sidebar can have, the root group included, so `1` puts
   * every entry flat under the root group. Once the limit is reached, no further child groups
   * are created; index.md or index.mdx files deeper in the subtree are flattened into the
   * deepest group instead. Must be an integer of at least 1. When undefined, groups nest
   * without limit.
   */
  maxGroupLevels?: number;

  /**
   * When true, all labels (both group labels and slug item labels) are derived from the raw directory name.
   * When false, the label for a slug item is read from the title field in the index.md or index.mdx file's
   * frontmatter; group labels are still derived from the raw directory name.
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

function normalizeItems(items: TSidebarItem[]): TSidebarItem[] {
  return items.map((item) => {
    if ("items" in item) {
      return {
        label: item.label,
        items: normalizeItems(item.items),
      };
    }
    if ("slug" in item) {
      return {
        label: item.label,
        slug: normalizeSidebarSlug(item.slug),
      };
    }
    return item;
  });
}

/**
 * Starlight plugin that automatically generates a sidebar configuration by scanning the filesystem
 * for index.md/index.mdx files in specified directories.
 *
 * @param pluginOptions - Configuration options for the sidebar generation
 * @returns A Starlight plugin object
 * @example
 * starlightIndexOnlySidebar({
 *   maxGroupLevels: 2,
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
        const { directories, dirnameDeterminesLabels } = pluginOptions;

        const docsDirPath = fileURLToPath(
          new URL("content/docs/", astroConfig.srcDir),
        );
        const { dirPaths, maxGroupLevels } = validateSidebarOptions({
          pluginName: "starlight-index-only-sidebar",
          docsDirPath,
          directories,
          maxGroupLevels: pluginOptions.maxGroupLevels,
          sourceDocExtensions: SOURCE_DOC_EXTENSIONS,
        });
        const functionOptions: TOptions = {
          maxGroupLevels,
          dirnameDeterminesLabels,
        };

        const sidebarItems = dirPaths
          .map((dirPath) => {
            const rawItems = getIndexMdSidebarItems(dirPath, functionOptions);
            // Remove the root group wrapper that getIndexMdSidebarItems adds
            const rootGroup = rawItems[0];
            if (!rootGroup || !("items" in rootGroup)) {
              return undefined;
            }
            const items = rootGroup.items || [];
            // Normalize slugs for Starlight
            const normalizedItems = normalizeItems(items);

            return {
              label: rootGroup.label,
              items: normalizedItems,
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
