import type { HookParameters } from "@astrojs/starlight/types";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getSourceDocExtensions } from "../utils/workspace-utils.js";
import type { TSidebarBadge, TSidebarGroup } from "../utils/sidebar-types.js";
import { getIndexSourcedSidebarGroup } from "./utils.js";

type TOptions = {
  /**
   * Controls how deep the nested group structure can go, where the root directory is level 0.
   * At depth >= maxDepthNesting, sub-index groups are not created; their items are flattened
   * directly into the current level instead.
   * @default 100
   */
  maxDepthNesting?: number;

  /**
   * Array of directory names (relative to the docs root, `content/docs/` under Astro's
   * `srcDir`) to generate sidebar groups for. Each directory must contain an index.md or
   * index.mdx whose links define the sidebar content.
   * @example ["guides", "reference"]
   */
  directories: string[];

  /**
   * A badge (`{ text, variant }`) shown on every index entry to tell it apart from regular
   * sidebar entries. `variant` is one of Starlight's badge variants. When undefined, index
   * entries get no badge.
   * @example { text: "Index", variant: "note" }
   */
  indexMarker?: TSidebarBadge;

  /**
   * Whether sidebar groups should be collapsed by default. Starlight automatically expands
   * the group containing the current page regardless of this setting.
   * @default true
   */
  collapsed?: boolean;
};

/**
 * Starlight plugin that generates a sidebar by parsing markdown links from index.md files.
 *
 * For each directory, the plugin reads its index.md and uses the links found there as sidebar
 * entries. Links ending in `/index` are treated as sub-sections and recursed into, creating
 * nested groups up to maxDepthNesting levels deep. All other links become leaf items labeled
 * with the linked page's frontmatter title. The docs root is `content/docs/` under Astro's
 * `srcDir`.
 *
 * @example
 * starlightIndexSourcedSidebar({
 *   maxDepthNesting: 2,
 *   directories: ["guides", "reference"],
 *   indexMarker: { text: "Index", variant: "note" },
 * })
 */
export function starlightIndexSourcedSidebar(options: TOptions) {
  return {
    name: "index-sourced-sidebar",
    hooks: {
      "config:setup": (hookOptions: HookParameters<"config:setup">) => {
        const { updateConfig, astroConfig, logger } = hookOptions;
        const {
          directories,
          maxDepthNesting = 100,
          indexMarker,
          collapsed = true,
        } = options;
        const docsDirPath = fileURLToPath(
          new URL("content/docs/", astroConfig.srcDir),
        );
        const sourceDocExtensions = getSourceDocExtensions(
          astroConfig.integrations,
        );

        const sidebarGroups = directories
          .map((directory) =>
            getIndexSourcedSidebarGroup({
              docsDirPath,
              dirPath: join(docsDirPath, directory),
              maxDepthNesting,
              indexMarker,
              collapsed,
              sourceDocExtensions,
              logger,
            }),
          )
          .filter((group): group is TSidebarGroup => group !== undefined);

        updateConfig({ sidebar: sidebarGroups });
      },
    },
  };
}
