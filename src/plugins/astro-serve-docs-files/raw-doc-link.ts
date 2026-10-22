import { relative, resolve, sep } from "node:path";
import type { MiddlewareHandler } from "astro";
import { createServedFileRule } from "../utils/served-file-rule.js";
import { STARLIGHT_DOC_ROUTE } from "../utils/starlight-selectors.js";
import type { TDocsFileRouteSettings } from "./docs-file-route.js";

/** What the raw doc link middleware needs from the integration, as JSON through a virtual module. */
export type TRawDocLinkSettings = TDocsFileRouteSettings & {
  /** The project root, which Starlight's `entry.filePath` is relative to. */
  rootDirPath: string;
};

/**
 * The part of Starlight's `locals.starlightRoute` this reads. Typed here rather than imported,
 * since Starlight is an optional peer dependency.
 */
type TStarlightLocals = {
  starlightRoute: { entry: { filePath?: string } };
};

/**
 * The middleware that names each Starlight doc page's raw doc: when the page's source doc
 * is served, it inserts `<link rel="alternate" type="text/markdown" href="...">` with the
 * raw doc's root-absolute, URL-encoded source path before `</head>` (ADR 0012). Other
 * routes, including Starlight's 404, and pages whose raw doc isn't served get no tag.
 */
export function createRawDocLinkMiddleware(
  settings: TRawDocLinkSettings,
): MiddlewareHandler {
  const { rootDirPath, docsDirPath } = settings;
  const isServed = createServedFileRule(settings);

  return async (context, next) => {
    const response = await next();
    // Starlight's locals throw on routes it didn't render, so check the route first
    if (context.routePattern !== STARLIGHT_DOC_ROUTE) return response;
    if (!response.ok) return response;
    if (!response.headers.get("content-type")?.includes("text/html")) {
      return response;
    }

    const rawDocUrlPath = servedRawDocUrlPath(
      (context.locals as TStarlightLocals).starlightRoute.entry.filePath,
    );
    if (rawDocUrlPath === undefined) return response;

    const linkTag = `<link rel="alternate" type="text/markdown" href="${rawDocUrlPath.replaceAll("&", "&amp;")}">`;
    // A replacer function, so `$` in the path isn't read as a replacement pattern
    const html = (await response.text()).replace(
      "</head>",
      () => `${linkTag}</head>`,
    );
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };

  /**
   * The raw doc's root-absolute, URL-encoded path, or undefined when it isn't served. Astro
   * decodes a request path with `decodeURI`, which leaves reserved characters like `&`
   * encoded, so only what `encodeURI` encodes is, plus `?` and `#`, which end a path.
   */
  function servedRawDocUrlPath(entryFilePath: string | undefined) {
    if (entryFilePath === undefined) return undefined;
    const docsRelativeFilePath = relative(
      docsDirPath,
      resolve(rootDirPath, entryFilePath),
    );
    // A save made mid-session in dev: the route doesn't serve that raw doc, and the
    // integration's watcher already logged why
    try {
      if (!isServed(docsRelativeFilePath)) return undefined;
    } catch {
      return undefined;
    }
    return docsRelativeFilePath
      .split(sep)
      .map(
        (segment) =>
          `/${encodeURI(segment).replace(/[?#]/g, encodeURIComponent)}`,
      )
      .join("");
  }
}
