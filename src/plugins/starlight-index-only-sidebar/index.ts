import type { HookParameters } from "@astrojs/starlight/types";
import { join } from "path";
import { getIndexMdSidebarItems } from "./utils";
import type { TGroupedItem } from "./types";

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
   * Array of directory names (relative to src/content/docs) to scan for sidebar generation.
   * Each directory will become a top-level group in the sidebar.
   * @example ["reference", "guides", "api-docs"]
   */
  directories: string[];
};

type TSidebarItem =
  | { label: string; slug: string }
  | { label: string; items: TSidebarItem[] };

const SITE_DOCS_ROOT = "./src/content/docs";

function normalizeSlug(slug: string): string {
  // Starlight expects slugs without "/index" suffix
  return slug.endsWith("/index") ? slug.slice(0, -6) : slug;
}

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
        slug: normalizeSlug(item.slug),
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
        const { updateConfig } = hookOptions;
        const { directories, maxDepthNesting, dirnameDeterminesLabels } =
          pluginOptions;
        const functionOptions: TOptions = {
          maxDepthNesting,
          dirnameDeterminesLabels,
        };

        const sidebarItems = directories
          .map((directory) => {
            const dirPath = join(SITE_DOCS_ROOT, directory);
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
            (group): group is TGroupedItem =>
              group !== undefined && group.items.length > 0,
          ); // remove empty groups

        updateConfig({
          sidebar: sidebarItems,
        });
      },
    },
  };
}
