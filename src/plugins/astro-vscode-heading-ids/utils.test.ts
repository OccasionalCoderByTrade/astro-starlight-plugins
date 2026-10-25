import { describe, expect, it } from "vitest";
import { createVscodeHeadingIdBuilder } from "./utils.js";

function buildIds(headingTexts: string[]): string[] {
  const headingIdBuilder = createVscodeHeadingIdBuilder();
  return headingTexts.map((headingText) => headingIdBuilder.add(headingText));
}

describe("createVscodeHeadingIdBuilder", () => {
  it("lowercases, drops punctuation and turns spaces into hyphens", () => {
    expect(buildIds(["Hello, World! (v2)"])).toEqual(["hello-world-v2"]);
  });

  it("trims the text first, so edge spaces don't become hyphens", () => {
    expect(buildIds(["  Padded  "])).toEqual(["padded"]);
  });

  it("keeps hyphens, underscores and non-latin letters", () => {
    expect(buildIds(["-Edge_case-", "Ünïcode Straße"])).toEqual([
      "-edge_case-",
      "ünïcode-straße",
    ]);
  });

  it("numbers duplicates from -1", () => {
    expect(buildIds(["Dup", "Dup", "Dup"])).toEqual(["dup", "dup-1", "dup-2"]);
  });

  it("doesn't check a numbered id against later headings, as VS Code doesn't", () => {
    expect(buildIds(["Dup", "Dup", "Dup-1"])).toEqual([
      "dup",
      "dup-1",
      "dup-1",
    ]);
  });

  it("gives empty text an empty id", () => {
    expect(buildIds(["", ""])).toEqual(["", "-1"]);
  });
});
