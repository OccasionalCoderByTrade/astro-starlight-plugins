/**
 * How other integrations find `astroServeDocsFiles` and its route, without importing that
 * plugin.
 */

/** The name `astroServeDocsFiles` gives its integration in `config.integrations`. */
export const SERVE_DOCS_FILES_INTEGRATION_NAME = "astro-serve-docs-files";

/** The custom hook `astroServeDocsFiles` exposes its served-file rule as. */
export const SERVED_FILE_RULE_HOOK_NAME = `${SERVE_DOCS_FILES_INTEGRATION_NAME}:served-file-rule`;

/** The pattern of the route `astroServeDocsFiles` injects to serve docs files. */
export const DOCS_FILE_ROUTE_PATTERN = "/[...path]";
