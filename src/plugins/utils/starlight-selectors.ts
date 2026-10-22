/** Starlight's wrapper around everything rendered from a source doc (`MarkdownContent.astro`). */
export const STARLIGHT_CONTENT_CLASS = "sl-markdown-content";
export const STARLIGHT_CONTENT_SELECTOR = `.${STARLIGHT_CONTENT_CLASS}`;

/** The route Starlight renders every source doc through, except a custom `404.md`. */
export const STARLIGHT_DOC_ROUTE = "/[...slug]";
