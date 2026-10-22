import type { TDocsFileRouteSettings } from "./docs-file-route.js";

/** The virtual module the integration serves its settings through. */
export const SETTINGS_MODULE_ID = "virtual:astro-serve-docs-files/settings";

/**
 * What the settings virtual module holds, as JSON. The docs file route and the raw doc
 * alternate link middleware both read it, since their entrypoints can't take arguments.
 */
export type TServeDocsFilesModuleSettings = TDocsFileRouteSettings & {
  /** The project root, which Starlight's `entry.filePath` is relative to. */
  rootDirPath: string;
  /** Astro's `base`, without a trailing slash: `""` when it's `/`. */
  baseUrlPath: string;
};

/**
 * The raw doc alternate link's `rel` and `type`: the middleware writes them, and the page
 * script finds the link by them (ADR 0012).
 */
export const RAW_DOC_ALTERNATE_LINK_REL = "alternate";
export const RAW_DOC_ALTERNATE_LINK_TYPE = "text/markdown";
export const RAW_DOC_ALTERNATE_LINK_SELECTOR = `link[rel="${RAW_DOC_ALTERNATE_LINK_REL}"][type="${RAW_DOC_ALTERNATE_LINK_TYPE}"]`;
