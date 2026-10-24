import type { HookParameters } from "@astrojs/starlight/types";
import { fileURLToPath } from "node:url";
import { validateSidebarOptions } from "../utils/sidebar-options.js";
import type { TSidebarGroup } from "../utils/sidebar-types.js";
import { getSourceDocExtensions } from "../utils/workspace-utils.js";
import { getIndexOnlySidebarGroup } from "./utils.js";

/**
 * Configuration options for sidebar generation behavior.
 */
type TOptions = {
  /**
   * The most levels of groups the sidebar can have, the root group included. `1` puts every
   * entry flat under the root group, `2` keeps one level of nested groups, and so on. At the
   * limit, deeper sidebar indexes are flattened into the deepest group. Must be an integer of at
   * least 1 (`Infinity` and `null` fail too), or startup fails. When undefined, groups nest without limit.
   */
  maxGroupLevels?: number;

  /**
   * When true, all labels (both group labels and slug item labels) are derived from the raw
   * directory name. When false, a slug item's label comes from its sidebar index's frontmatter
   * `sidebar.label`, then `title`, then `"Overview"`; group labels still come from the
   * directory name. Either way, a slug item shows its frontmatter `sidebar.badge`.
   * @default true
   */
  dirnameDeterminesLabels?: boolean;
};

/**
 * Options for the starlightIndexOnlySidebar plugin.
 */
type TIndexOnlySidebarPluginOptions = TOptions & {
  /**
   * Array of directory names, relative to the docs root (`content/docs/` under Astro's
   * `srcDir`, so `src/content/docs` by default), to scan. Each directory becomes a top-level
   * group in the sidebar. An entry that resolves outside the docs root, doesn't exist, has no
   * sidebar index, or is listed twice fails startup.
   * @example ["reference", "guides", "api-docs"]
   */
  directories: string[];
};

/**
 * Starlight plugin that builds a nested sidebar by recursively scanning the listed directories
 * for sidebar indexes (`index.md`, `index.mdx`, or `index.mdoc` when `@astrojs/markdoc` is
 * installed). Only directories with sidebar indexes appear. A `_`-prefixed file is never a
 * sidebar index, but a `_`-prefixed folder still counts. `assets` directories are ignored.
 *
 * `draft: true` and `sidebar.hidden: true` hide an index and its whole subtree, in dev and
 * build alike (on purpose, unlike Starlight's dev rendering of drafts). `pagefind: false`
 * hides nothing.
 *
 * Each entry's slug is the sidebar index's `slug:` frontmatter, or else its page path (each
 * segment slugified the way Starlight does, trailing `/index` dropped).
 *
 * Bad options and missing directories fail `astro dev` and `astro build` at startup.
 *
 * @param pluginOptions - Configuration options for the sidebar generation
 * @returns A Starlight plugin object
 * @example
 * import { starlightIndexOnlySidebar } from "starlight-cannoli-plugins/starlight-index-only-sidebar";
 *
 * starlightIndexOnlySidebar({
 *   directories: ["reference", "guides"],
 *   maxGroupLevels: 2,
 *   dirnameDeterminesLabels: false,
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
        const sourceDocExtensions = getSourceDocExtensions(
          astroConfig.integrations,
        );

        const docsDirPath = fileURLToPath(
          new URL("content/docs/", astroConfig.srcDir),
        );
        const { dirPaths, maxGroupLevels } = validateSidebarOptions({
          pluginName: "starlight-index-only-sidebar",
          docsDirPath,
          directories,
          maxGroupLevels: pluginOptions.maxGroupLevels,
          sourceDocExtensions,
        });
        const sidebarGroups = dirPaths
          .map((dirPath) =>
            getIndexOnlySidebarGroup(dirPath, {
              docsDirPath,
              maxGroupLevels,
              dirnameDeterminesLabels,
              sourceDocExtensions,
            }),
          )
          .filter(
            (group): group is TSidebarGroup =>
              group !== undefined && group.items.length > 0,
          ); // remove empty groups

        updateConfig({
          sidebar: sidebarGroups,
        });
      },
    },
  };
}
