import type { HookParameters } from "@astrojs/starlight/types";
import { join } from "path";
import { getIndexMdSidebarItems } from "./utils/sidebar-builder-utils";
import type { TGroupedItem } from "./utils/types";

type TOptions = {
  maxDepthNesting?: number;
  dirnameDeterminesLabels?: boolean;
};

type TIndexOnlySidebarPluginOptions = TOptions & {
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
