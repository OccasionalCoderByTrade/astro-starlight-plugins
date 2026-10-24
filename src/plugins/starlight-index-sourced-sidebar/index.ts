import type { HookParameters } from "@astrojs/starlight/types";
import { fileURLToPath } from "node:url";
import { validateSidebarOptions } from "../utils/sidebar-options.js";
import type { TSidebarBadge, TSidebarGroup } from "../utils/sidebar-types.js";
import {
  getIndexSourcedSidebarGroup,
  SOURCE_DOC_EXTENSIONS,
} from "./utils.js";

type TOptions = {
  /**
   * The most levels of groups the sidebar can have, the root group included, so `1` puts
   * every entry flat under the root group. A sub-index link whose group would go past the
   * limit has its entries flattened into the parent group. Must be an integer of at least 1.
   * When undefined, groups nest without limit.
   */
  maxGroupLevels?: number;

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
 * nested groups up to maxGroupLevels levels of groups. All other links become leaf items labeled
 * with the linked page's frontmatter title. The docs root is `content/docs/` under Astro's
 * `srcDir`.
 *
 * @example
 * starlightIndexSourcedSidebar({
 *   maxGroupLevels: 2,
 *   directories: ["guides", "reference"],
 *   indexMarker: { text: "Index", variant: "note" },
 * })
 */
export function starlightIndexSourcedSidebar(options: TOptions) {
  return {
    name: "index-sourced-sidebar",
    hooks: {
      "config:setup": (hookOptions: HookParameters<"config:setup">) => {
        const { updateConfig, astroConfig } = hookOptions;
        const {
          directories,
          indexMarker,
          collapsed = true,
        } = options;
        const docsDirPath = fileURLToPath(
          new URL("content/docs/", astroConfig.srcDir),
        );

        const { dirPaths, maxGroupLevels } = validateSidebarOptions({
          pluginName: "starlight-index-sourced-sidebar",
          docsDirPath,
          directories,
          maxGroupLevels: options.maxGroupLevels,
          sourceDocExtensions: SOURCE_DOC_EXTENSIONS,
        });

        const sidebarGroups = dirPaths
          .map((dirPath) =>
            getIndexSourcedSidebarGroup({
              docsDirPath,
              dirPath,
              maxGroupLevels,
              indexMarker,
              collapsed,
            }),
          )
          .filter((group): group is TSidebarGroup => group !== undefined);

        updateConfig({ sidebar: sidebarGroups });
      },
    },
  };
}
