import type { HookParameters } from "@astrojs/starlight/types";
import { fileURLToPath } from "node:url";
import { validateSidebarOptions } from "../utils/sidebar-options.js";
import { getSourceDocExtensions } from "../utils/workspace-utils.js";
import type { TSidebarBadge, TSidebarGroup } from "../utils/sidebar-types.js";
import { getIndexSourcedSidebarGroup, PLUGIN_NAME } from "./utils.js";

type TOptions = {
  /**
   * Array of directory names, relative to the docs root (`content/docs/` under Astro's
   * `srcDir`, so `src/content/docs` by default), to generate sidebar groups for. Each
   * directory must contain a sidebar index (`index.md`, `index.mdx`, or `index.mdoc` when
   * `@astrojs/markdoc` is installed) whose links define the group's entries. An entry that
   * resolves outside the docs root, doesn't exist, has no sidebar index, or is listed twice
   * fails startup.
   * @example ["guides", "reference"]
   */
  directories: string[];

  /**
   * The most levels of groups the sidebar can have, the root group included. `1` puts every
   * entry flat under the root group, `2` keeps one level of nested groups, and so on. A
   * sub-index link whose group would go past the limit has its entries flattened into the
   * parent group. Must be an integer of at least 1 (`Infinity` and `null` fail too), or
   * startup fails. When undefined, groups nest without limit.
   */
  maxGroupLevels?: number;

  /**
   * A Starlight badge (`{ text, variant }`) shown on every index entry to tell it apart from
   * regular sidebar entries. When set, it replaces an index entry's own `sidebar.badge`.
   * `variant` is one of `"note"`, `"tip"`, `"caution"`, `"danger"`, `"success"` or
   * `"default"`. When undefined, index entries show their own `sidebar.badge`, if any.
   * @example { text: "Index", variant: "note" }
   */
  indexMarker?: TSidebarBadge;

  /**
   * Whether sidebar groups start collapsed. Starlight still expands the group holding the
   * current page.
   * @default true
   */
  collapsed?: boolean;
};

/**
 * Starlight plugin that builds a sidebar from the markdown links written in each listed
 * directory's sidebar index (`index.md`, `index.mdx`, or `index.mdoc` when Markdoc is
 * installed).
 *
 * A group's entries are its index entry, then one entry per link, in the order written.
 * Sub-index links (ending in `/index`, with or without an extension, or `/`) expand into a
 * nested group whatever the target's extension, up to `maxGroupLevels` levels of groups,
 * unless the target's frontmatter has `indexSourcedSidebar: { leaf: true }`, which makes it a
 * single entry with the index marker (ignored on a root sidebar index). Other links to source
 * docs become page entries.
 *
 * Inline and reference-style markdown links count: relative file-form links, root-absolute
 * links (resolved against the docs root, with Astro's `base` stripped) and percent-encoded
 * links, with query strings and anchors stripped. JSX and HTML links and page-form links
 * don't. External (`scheme:` or `//`) links, same-page anchors, docs assets (any link with
 * an extension that isn't a source doc extension, so `./v1.2.md`, not `./v1.2`) and pages
 * hidden from sidebar are skipped silently. A link to a missing source doc, a path outside
 * the docs root, a `_`-prefixed file, a folder with no sidebar index, or an ancestor sidebar
 * index is skipped with a warning naming the sidebar index and the link.
 *
 * A source doc is hidden from sidebar when its frontmatter has `draft: true` or
 * `sidebar.hidden: true`, in dev and build alike (on purpose, unlike Starlight's dev
 * rendering of drafts). A hidden sidebar index drops its whole group. `pagefind: false` hides
 * nothing.
 *
 * Each entry's slug is the source doc's `slug:` frontmatter, or else its page path (each
 * segment slugified the way Starlight does, trailing `/index` dropped). Entries are labelled
 * `sidebar.label`, then `title`, then the filename, and show `sidebar.badge` (an index entry
 * shows `indexMarker` instead, when set). Groups take their directory name.
 *
 * Bad options, missing directories and missing root sidebar indexes fail `astro dev` and
 * `astro build` at startup.
 *
 * @example
 * import { starlightIndexSourcedSidebar } from "starlight-cannoli-plugins/starlight-index-sourced-sidebar";
 *
 * starlightIndexSourcedSidebar({
 *   directories: ["guides", "reference"],
 *   maxGroupLevels: 2,
 *   indexMarker: { text: "Index", variant: "note" },
 *   collapsed: false,
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
          indexMarker,
          collapsed = true,
        } = options;
        const docsDirPath = fileURLToPath(
          new URL("content/docs/", astroConfig.srcDir),
        );
        const sourceDocExtensions = getSourceDocExtensions(
          astroConfig.integrations,
        );

        const { dirPaths, maxGroupLevels } = validateSidebarOptions({
          pluginName: PLUGIN_NAME,
          docsDirPath,
          directories,
          maxGroupLevels: options.maxGroupLevels,
          sourceDocExtensions,
        });

        const sidebarGroups = dirPaths
          .map((dirPath) =>
            getIndexSourcedSidebarGroup({
              docsDirPath,
              dirPath,
              maxGroupLevels,
              indexMarker,
              collapsed,
              sourceDocExtensions,
              base: astroConfig.base,
              logger,
            }),
          )
          .filter((group): group is TSidebarGroup => group !== undefined);

        updateConfig({ sidebar: sidebarGroups });
      },
    },
  };
}
