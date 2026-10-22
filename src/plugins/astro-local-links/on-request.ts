import type { MiddlewareHandler } from "astro";
import {
  buildSourceDocIndex,
  formatBrokenLinksError,
  formatShadowedDocError,
  processDocPage,
  STARLIGHT_DOC_ROUTE,
  type TLocalLinksSettings,
} from "./utils.js";

/**
 * The dev middleware: runs link validation and link normalization on each Starlight doc
 * page's rendered HTML. Broken links throw, so dev shows them on an error page. A shadowed
 * doc also throws: a source doc whose page path another HTML page serves. Source docs
 * are indexed on each request, so ones added or renamed since the last are picked up.
 */
export function createOnRequest(
  settings: TLocalLinksSettings,
): MiddlewareHandler {
  return async (context, next) => {
    const response = await next();
    if (!response.ok) return response;
    if (!response.headers.get("content-type")?.includes("text/html")) {
      return response;
    }
    if (context.routePattern !== STARLIGHT_DOC_ROUTE) {
      const shadowedDocError = formatShadowedDocError(
        context.url.pathname,
        context.routePattern,
        buildSourceDocIndex(settings.site.docsDirPath),
      );
      if (shadowedDocError) throw new Error(shadowedDocError);
      return response;
    }

    const processedPage = processDocPage(
      context.url.pathname,
      await response.text(),
      settings,
      buildSourceDocIndex(settings.site.docsDirPath),
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
