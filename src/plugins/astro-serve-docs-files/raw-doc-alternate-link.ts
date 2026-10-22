import { relative, resolve, sep } from "node:path";
import type { MiddlewareHandler } from "astro";
import { createServedFileRule } from "../utils/served-file-rule.js";
import { STARLIGHT_DOC_ROUTE } from "../utils/starlight-routes.js";
import {
  RAW_DOC_ALTERNATE_LINK_REL,
  RAW_DOC_ALTERNATE_LINK_TYPE,
  type TServeDocsFilesModuleSettings,
} from "./utils.js";

/**
 * The part of Starlight's `locals.starlightRoute` this reads. Typed here rather than imported,
 * since Starlight is an optional peer dependency.
 */
type TStarlightLocals = {
  starlightRoute?: { entry?: { filePath?: string } };
};

/**
 * The entry file path of the Starlight page being rendered, or undefined when Starlight
 * didn't render it: a `src/pages/[...slug].astro` page, or a site without Starlight. Starlight's
 * `starlightRoute` getter throws on routes it didn't render.
 */
function readStarlightEntryFilePath(locals: object): string | undefined {
  try {
    return (locals as TStarlightLocals).starlightRoute?.entry?.filePath;
  } catch {
    return undefined;
  }
}

/**
 * The middleware that adds each Starlight doc page's raw doc alternate link: when the page's
 * source doc is served, it inserts `<link rel="alternate" type="text/markdown" href="...">`
 * with the raw doc's URL-encoded source path, under Astro's `base`, before `</head>`
 * (ADR 0012). Other routes, including Starlight's 404, and pages whose raw doc isn't served
 * get no raw doc alternate link.
 */
export function createRawDocAlternateLinkMiddleware(
  settings: TServeDocsFilesModuleSettings,
): MiddlewareHandler {
  const { rootDirPath, docsDirPath, baseUrlPath } = settings;
  const isServed = createServedFileRule(settings);

  return async (context, next) => {
    const response = await next();
    if (context.routePattern !== STARLIGHT_DOC_ROUTE) return response;
    if (!response.ok) return response;
    if (!response.headers.get("content-type")?.includes("text/html")) {
      return response;
    }

    const rawDocUrlPath = servedRawDocUrlPath(
      readStarlightEntryFilePath(context.locals),
    );
    if (rawDocUrlPath === undefined) return response;

    const alternateLink = `<link rel="${RAW_DOC_ALTERNATE_LINK_REL}" type="${RAW_DOC_ALTERNATE_LINK_TYPE}" href="${rawDocUrlPath.replaceAll("&", "&amp;")}">`;
    // A replacer function, so `$` in the path isn't read as a replacement pattern
    const html = (await response.text()).replace(
      "</head>",
      () => `${alternateLink}</head>`,
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
   * The raw doc's URL-encoded path under Astro's `base`, or undefined when it isn't served.
   * Astro decodes a request path with `decodeURI`, which leaves reserved characters like `&`
   * encoded, so only what `encodeURI` encodes is. A served path never holds `?` or `#`,
   * which `encodeURI` leaves raw.
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
    return (
      baseUrlPath +
      docsRelativeFilePath
        .split(sep)
        .map((segment) => `/${encodeURI(segment)}`)
        .join("")
    );
  }
}
