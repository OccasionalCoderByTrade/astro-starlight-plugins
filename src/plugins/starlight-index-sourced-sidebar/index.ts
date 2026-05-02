import type { HookParameters } from "@astrojs/starlight/types";
import { join } from "path";
import { getIndexSourcedSidebarItems } from "./utils";
import type { TGroupedItem, TIndexMarker } from "./types";

type TOptions = {
  /**
   * Controls how deep the nested group structure can go, where the root directory is level 0.
   * At depth >= maxDepthNesting, sub-index groups are not created; their items are flattened
   * directly into the current level instead.
   * @default 100
   */
  maxDepthNesting?: number;

  /**
   * Array of directory names (relative to src/content/docs) to generate sidebar groups for.
   * Each directory must contain an index.md or index.mdx whose links define the sidebar content.
   * @example ["guides", "reference"]
   */
  directories: string[];

  /**
   * A string prepended to the label of every index entry to visually distinguish it from
   * regular sidebar entries. When undefined, no marker is added.
   * @example "★"
   */
  indexMarker?: TIndexMarker;

  /**
   * Whether sidebar groups should be collapsed by default. Starlight automatically expands
   * the group containing the current page regardless of this setting.
   * @default true
   */
  collapsed?: boolean;
};

const SITE_DOCS_ROOT = "./src/content/docs";

/**
 * Starlight plugin that generates a sidebar by parsing markdown links from index.md files.
 *
 * For each directory, the plugin reads its index.md and uses the links found there as sidebar
 * entries. Links ending in `/index` are treated as sub-sections and recursed into, creating
 * nested groups up to maxDepthNesting levels deep. All other links become leaf items labeled
 * with the linked page's frontmatter title.
 *
 * @example
 * starlightIndexSourcedSidebar({
 *   maxDepthNesting: 2,
 *   directories: ["guides", "reference"],
 * })
 */
export function starlightIndexSourcedSidebar(options: TOptions) {
  return {
    name: "index-sourced-sidebar",
    hooks: {
      "config:setup": (hookOptions: HookParameters<"config:setup">) => {
        const { updateConfig } = hookOptions;
        const { directories, maxDepthNesting = 100, indexMarker, collapsed = true } = options;

        const sidebarItems = directories
          .map((directory) => {
            const dirPath = join(SITE_DOCS_ROOT, directory);
            const rawItems = getIndexSourcedSidebarItems(
              dirPath,
              maxDepthNesting,
              indexMarker,
              collapsed,
            );
            const rootGroup = rawItems[0];
            if (!rootGroup || !("items" in rootGroup)) return undefined;
            return rootGroup as TGroupedItem;
          })
          .filter(
            (group): group is TGroupedItem =>
              group !== undefined && group.items.length > 0,
          );

        updateConfig({ sidebar: sidebarItems });
      },
    },
  };
}
