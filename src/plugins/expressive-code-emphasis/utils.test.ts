import { describe, expect, it } from "vitest";
import { createEmphasisMatcher } from "./utils.js";

/** The text each range covers, so assertions read as the emphasized terms. */
function emphasizedTexts(lineText: string, terms: string[]): string[] {
  const findEmphasisRanges = createEmphasisMatcher(terms);
  return findEmphasisRanges(lineText).map(({ columnStart, columnEnd }) =>
    lineText.slice(columnStart, columnEnd),
  );
}

describe("createEmphasisMatcher", () => {
  it("matches a word term as a whole word only", () => {
    expect(emphasizedTexts("foo food afoo foo_ foo()", ["foo"])).toEqual([
      "foo",
      "foo",
    ]);
  });

  it("matches a punctuation edge against anything", () => {
    expect(emphasizedTexts("foo() { return (); }", ["()"])).toEqual([
      "()",
      "()",
    ]);
    expect(emphasizedTexts("x=arr[0];", ["arr[0]"])).toEqual(["arr[0]"]);
    expect(emphasizedTexts("a - b --c", ["-"])).toEqual(["-", "-", "-"]);
  });

  it("treats non-ASCII letters, marks and digits as word characters", () => {
    expect(emphasizedTexts("naïve na", ["na"])).toEqual(["na"]);
    expect(emphasizedTexts("café café caf", ["caf"])).toEqual(["caf"]);
    expect(emphasizedTexts("x١ x", ["x"])).toEqual(["x"]);
    expect(emphasizedTexts("über", ["über"])).toEqual(["über"]);
  });

  it("matches every term, in line order", () => {
    expect(emphasizedTexts("bar(foo, bar)", ["foo", "bar"])).toEqual([
      "bar",
      "foo",
      "bar",
    ]);
  });

  it("lets the longer of two overlapping terms win", () => {
    expect(emphasizedTexts("foo.bar() foo", ["foo", "foo.bar"])).toEqual([
      "foo.bar",
      "foo",
    ]);
  });

  it("lets the earlier of two overlapping terms win, whatever its length", () => {
    expect(emphasizedTexts("a-bcd", ["a-", "-bcd"])).toEqual(["a-"]);
  });

  it("matches nothing when there are no terms", () => {
    expect(createEmphasisMatcher([])("foo")).toEqual([]);
  });

  it("emphasizes a duplicated term once", () => {
    expect(createEmphasisMatcher(["foo", "foo"])("foo")).toEqual([
      { columnStart: 0, columnEnd: 3 },
    ]);
  });

  it("matches case-sensitively", () => {
    expect(emphasizedTexts("Foo FOO foo", ["foo"])).toEqual(["foo"]);
  });

  it("does not treat $ as a word character", () => {
    expect(emphasizedTexts("a$el $el", ["$el"])).toEqual(["$el", "$el"]);
  });
});
