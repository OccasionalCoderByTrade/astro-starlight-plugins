import { ExpressiveCodeEngine } from "@expressive-code/core";
import { toHtml } from "@expressive-code/core/hast";
import { expect, it } from "vitest";
import { expressiveCodeEmphasis } from "./index.js";

async function renderEmphasizedTexts(
  code: string,
  meta: string,
): Promise<string[]> {
  const expressiveCode = new ExpressiveCodeEngine({
    plugins: [expressiveCodeEmphasis()],
  });
  const { renderedGroupAst } = await expressiveCode.render({
    code,
    language: "js",
    meta,
  });
  const renderedHtml = toHtml(renderedGroupAst);
  return [
    ...renderedHtml.matchAll(/<span class="fw-supreme">(.*?)<\/span>/g),
  ].map((match) => match[1]);
}

it("emphasizes every term in the README example", async () => {
  const code = "function foo() {\n  return bar() || ();\n}";
  expect(await renderEmphasizedTexts(code, 'emph="foo,bar,()"')).toEqual([
    "foo",
    "()",
    "bar",
    "()",
    "()",
  ]);
});

it("trims terms and ignores empty ones", async () => {
  expect(await renderEmphasizedTexts("foo bar", 'emph=" foo ,, "')).toEqual([
    "foo",
  ]);
});

it("leaves a code block without emph untouched", async () => {
  expect(await renderEmphasizedTexts("foo", "")).toEqual([]);
});

it("ships the .fw-supreme styles with a self-hosted Source Code Pro", async () => {
  const expressiveCode = new ExpressiveCodeEngine({
    plugins: [expressiveCodeEmphasis()],
  });
  const baseStyles = await expressiveCode.getBaseStyles();
  expect(baseStyles).toMatch(
    /\.fw-supreme\{font-family:"Source Code Pro",\s*ui-monospace,\s*monospace;font-weight:900;/,
  );
  const fontFaces = baseStyles.match(/@font-face\{[^}]*\}/g) ?? [];
  expect(fontFaces).toHaveLength(2);
  for (const fontFace of fontFaces) {
    expect(fontFace).toContain('font-family:"Source Code Pro"');
    expect(fontFace).toContain("font-weight:900");
    expect(fontFace).toMatch(
      /src:url\(data:font\/woff2;base64,[A-Za-z0-9+/=]+\)/,
    );
    expect(fontFace).not.toContain("googleapis");
  }
});
