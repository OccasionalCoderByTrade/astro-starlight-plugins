import type { MiddlewareHandler } from "astro";
import { STARLIGHT_DOC_ROUTE } from "../utils/starlight-routes.js";
import {
  buildSourceDocIndex,
  formatBrokenLinksError,
  formatShadowedDocError,
  processDocPage,
  findServedFileRule,
  type TLocalLinksDevSettings,
  type TLocalLinksSettings,
} from "./utils.js";

/**
 * The dev middleware: runs link validation and link normalization on each Starlight doc
 * page's rendered HTML. Broken links throw, so dev shows them on an error page. A shadowed
 * doc also throws: a source doc whose page path another route serves, whether a page, a
 * redirect or an endpoint, as long as it doesn't respond with an error. Source docs
 * are indexed on each request, so ones added or renamed since the last are picked up.
 */
export function createOnRequest(
  devSettings: TLocalLinksDevSettings,
): MiddlewareHandler {
  const { servedFileRuleId, ...otherSettings } = devSettings;
  const settings: TLocalLinksSettings = {
    ...otherSettings,
    servedDocsFileRule:
      servedFileRuleId === undefined
        ? undefined
        : findServedFileRule(servedFileRuleId),
  };
  return async (context, next) => {
    const response = await next();
    // Redirects and endpoints can shadow a doc too, so only error responses skip the check
    if (response.status >= 400) return response;
    if (context.routePattern !== STARLIGHT_DOC_ROUTE) {
      const shadowedDocError = formatShadowedDocError(
        context.url.pathname,
        context.routePattern,
        buildSourceDocIndex(settings.site.docsDirPath),
      );
      if (shadowedDocError) throw new Error(shadowedDocError);
      return response;
    }
    if (!response.ok) return response;
    if (!response.headers.get("content-type")?.includes("text/html")) {
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
