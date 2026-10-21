import type { MiddlewareHandler } from "astro";
import {
  formatBrokenLinksError,
  processDocPage,
  STARLIGHT_DOCS_ROUTE,
  type TLocalLinksSettings,
} from "./utils.js";

/**
 * The dev middleware: runs link validation and link normalization on each Starlight doc
 * page's rendered HTML. Broken links throw, so dev shows them on an error page.
 */
export function createOnRequest(
  settings: TLocalLinksSettings,
): MiddlewareHandler {
  return async (context, next) => {
    const response = await next();
    if (context.routePattern !== STARLIGHT_DOCS_ROUTE) return response;
    if (!response.ok) return response;
    if (!response.headers.get("content-type")?.includes("text/html")) {
      return response;
    }

    const processedPage = processDocPage(
      context.url.pathname,
      await response.text(),
      settings,
    );
    if (processedPage.pageBrokenLinks) {
      throw new Error(formatBrokenLinksError([processedPage.pageBrokenLinks]));
    }

    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(processedPage.html, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
