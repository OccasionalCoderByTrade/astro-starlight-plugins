import { describe, expect, it } from "vitest";
import { isTexCompileBlock, resolveMetaOptions } from "./meta-options.js";

describe("isTexCompileBlock", () => {
  it.each([
    ["tex", "compile"],
    ["latex", "compile"],
    ["tex", "compile=true"],
    ["tex", 'mode=pdf compile alt="A diagram"'],
    // Kept, so the repeated compile gets its tex compile error.
    ["tex", "compile compile=false"],
    ["tex", "compile=false compile"],
  ])("accepts %s with meta %j", (lang, meta) => {
    expect(isTexCompileBlock(lang, meta)).toBe(true);
  });

  it.each([
    ["tex", null],
    ["tex", undefined],
    ["tex", ""],
    ["tex", 'title="notes.tex"'],
    ["tex", 'alt="compiled flow"'],
    ["tex", "precompile"],
    ["tex", "class=compiler"],
    ["tex", "compile=false"],
    ["tex", "compile=yes"],
    ["js", "compile"],
    [null, "compile"],
  ])("rejects %s with meta %j", (lang, meta) => {
    expect(isTexCompileBlock(lang, meta)).toBe(false);
  });
});

describe("resolveMetaOptions", () => {
  it("falls back to the defaults and the site options", () => {
    expect(
      resolveMetaOptions("compile", { svgClassname: "a  b", zoom: true }),
    ).toEqual({
      ok: true,
      blockId: undefined,
      metaOptions: {
        compileMode: "dvi",
        classNames: ["a", "b"],
        altText: "LaTeX diagram",
        caption: undefined,
        isZoomable: true,
      },
    });
  });

  it("lets the block's meta options override the site options", () => {
    expect(
      resolveMetaOptions(
        'compile mode=pdf class="c d" alt="A graph" zoom=false blockid=4',
        { svgClassname: "a", zoom: true },
      ),
    ).toEqual({
      ok: true,
      blockId: 4,
      metaOptions: {
        compileMode: "pdf",
        classNames: ["c", "d"],
        altText: "A graph",
        caption: "A graph",
        isZoomable: false,
      },
    });
  });

  it.each([
    [
      "mode=svg",
      'Unknown compile mode "mode=svg". Use one of: mode=dvi, mode=pdf.',
    ],
    ["mode", 'Unknown compile mode "mode". Use one of: mode=dvi, mode=pdf.'],
    [
      "zoom=maybe",
      'Unknown zoom value "zoom=maybe". Use zoom, zoom=true or zoom=false.',
    ],
    [
      "blockid=abc",
      'Invalid blockid "blockid=abc". Use a whole number, such as blockid=1.',
    ],
    [
      "blockid=-1",
      'Invalid blockid "blockid=-1". Use a whole number, such as blockid=1.',
    ],
    [
      "blockid=1.5",
      'Invalid blockid "blockid=1.5". Use a whole number, such as blockid=1.',
    ],
    [
      "blockid",
      'Invalid blockid "blockid". Use a whole number, such as blockid=1.',
    ],
    [
      "mode=/pdf/",
      'Unknown compile mode "mode=/pdf/". Use one of: mode=dvi, mode=pdf.',
    ],
    [
      "zoom=/x/",
      'Unknown zoom value "zoom=/x/". Use zoom, zoom=true or zoom=false.',
    ],
    [
      'zoom="true"',
      'Unknown zoom value "zoom="true"". Use zoom, zoom=true or zoom=false.',
    ],
    [
      "class",
      'Invalid class "class". Give it a quoted value, such as class="my-diagram".',
    ],
    [
      "class=/x/",
      'Invalid class "class=/x/". Give it a quoted value, such as class="my-diagram".',
    ],
    [
      "alt",
      'Invalid alt "alt". Give it a quoted value, such as alt="A labelled graph".',
    ],
    [
      "alt=true",
      'Invalid alt "alt=true". Give it a quoted value, such as alt="A labelled graph".',
    ],
    [
      "mode=dvi mode=pdf",
      "mode is given more than once. Give each meta option once.",
    ],
    [
      'class=a class="b c"',
      "class is given more than once. Give each meta option once.",
    ],
    ["compile", "compile is given more than once. Give each meta option once."],
  ])("rejects the meta option %j", (invalidMeta, reason) => {
    expect(resolveMetaOptions(`compile ${invalidMeta}`, {})).toEqual({
      ok: false,
      blockId: undefined,
      failure: { kind: "invalid-block", reason },
    });
  });

  it("lists every invalid meta option in one tex compile error", () => {
    expect(resolveMetaOptions("compile zoom=maybe mode=svg alt", {})).toEqual({
      ok: false,
      blockId: undefined,
      failure: {
        kind: "invalid-block",
        reason: [
          'Unknown compile mode "mode=svg". Use one of: mode=dvi, mode=pdf.',
          'Unknown zoom value "zoom=maybe". Use zoom, zoom=true or zoom=false.',
          'Invalid alt "alt". Give it a quoted value, such as alt="A labelled graph".',
        ].join("\n"),
      },
    });
  });

  it("keeps a valid blockid when another meta option is invalid", () => {
    expect(resolveMetaOptions("compile blockid=0 mode=svg", {})).toMatchObject({
      ok: false,
      blockId: 0,
    });
  });

  it.each([
    ['alt=""', { altText: "", caption: undefined }],
    ['class=""', { classNames: [] }],
    ['title="x" {1-3} unknown=yes', { compileMode: "dvi" }],
  ])("accepts %j", (validMeta, expected) => {
    const resolved = resolveMetaOptions(`compile ${validMeta}`, {
      svgClassname: "site",
    });
    expect(resolved.ok && resolved.metaOptions).toMatchObject(expected);
  });
});
