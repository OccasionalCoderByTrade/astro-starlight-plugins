import { describe, expect, it } from "vitest";
import { html } from "./html-builder.js";

describe("html", () => {
  it("escapes interpolated values, quotes included, so they can't break out of an attribute", () => {
    const title = `"><script>alert('x')</script>`;

    expect(html`<div title="${title}">${title}</div>`.toString()).toBe(
      `<div title="&quot;&gt;&lt;script&gt;alert(&apos;x&apos;)&lt;/script&gt;">` +
        `&quot;&gt;&lt;script&gt;alert(&apos;x&apos;)&lt;/script&gt;</div>`,
    );
  });

  it("inserts $-prefixed interpolations as is, joining arrays with newlines", () => {
    const items = ["a", "b"].map((name) => html`<li>${name}</li>`);

    expect(html`<ul>$${items}</ul>`.toString()).toBe(
      "<ul><li>a</li>\n<li>b</li></ul>",
    );
  });
});
