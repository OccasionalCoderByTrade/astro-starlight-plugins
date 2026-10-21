import { describe, expect, it } from "vitest";
import { createOnRequest } from "./on-request.js";
import { makeSite, pageHtml } from "./test-site.js";

/** Runs the dev middleware for one request, with `body` as what the page rendered. */
async function request(
  pathname: string,
  body: string,
  { routePattern = "/[...slug]", contentType = "text/html", status = 200 } = {},
) {
  const site = makeSite({
    "src/content/docs/guide/intro.md": "",
    "src/content/docs/guide/next.md": "",
  });
  const onRequest = createOnRequest({
    site,
    validate: { skipPatterns: [] },
    normalize: true,
  });
  const context = {
    url: new URL(`http://localhost${pathname}`),
    routePattern,
  } as Parameters<typeof onRequest>[0];
  const next = async () =>
    new Response(body, { status, headers: { "content-type": contentType } });

  const response = (await onRequest(context, next)) as Response;
  return response.text();
}

describe("dev middleware", () => {
  it("normalizes the links in a Starlight doc page", async () => {
    const html = await request(
      "/guide/intro/",
      pageHtml(`<a href="./next">x</a>`),
    );

    expect(html).toContain(`<a href="/guide/next">x</a>`);
  });

  it("leaves other routes and non-HTML responses alone", async () => {
    const body = pageHtml(`<a href="./next">x</a>`);

    expect(
      await request("/grade-calculator/", body, {
        routePattern: "/grade-calculator",
      }),
    ).toBe(body);
    expect(
      await request("/guide/intro/", body, { contentType: "text/plain" }),
    ).toBe(body);
    expect(await request("/no-such-doc/", body, { status: 404 })).toBe(body);
  });

  it("throws, listing the broken links, so dev shows an error page", async () => {
    await expect(
      request("/guide/intro/", pageHtml(`<a href="./missing">x</a>`)),
    ).rejects.toThrow(/1 broken local link:[\s\S]*\.\/missing/);
  });
});
