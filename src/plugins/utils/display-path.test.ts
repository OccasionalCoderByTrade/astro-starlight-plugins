import { posix, win32 } from "node:path";
import { describe, expect, it } from "vitest";
import { toDisplayPath } from "./display-path.js";

describe("toDisplayPath", () => {
  it("is root-relative for a path inside the root", () => {
    expect(
      toDisplayPath("/home/me/site", "/home/me/site/src/content/docs/a.md"),
    ).toBe("src/content/docs/a.md");
  });

  it("is the absolute path for a path outside the root", () => {
    expect(toDisplayPath("/home/me/site", "/home/me/shared/tex")).toBe(
      "/home/me/shared/tex",
    );
  });

  it("is . for the root itself", () => {
    expect(toDisplayPath("/home/me/site", "/home/me/site")).toBe(".");
  });

  it("uses forward slashes on Windows", () => {
    expect(
      toDisplayPath("C:\\site", "C:\\site\\src\\content\\docs\\a.md", win32),
    ).toBe("src/content/docs/a.md");
  });

  it("uses forward slashes for an absolute Windows path outside the root", () => {
    expect(toDisplayPath("C:\\site", "D:\\shared\\tex", win32)).toBe(
      "D:/shared/tex",
    );
  });

  it("keeps a node_modules path under the root relative", () => {
    expect(
      toDisplayPath(
        "/home/me/site",
        "/home/me/site/node_modules/pkg/dist",
        posix,
      ),
    ).toBe("node_modules/pkg/dist");
  });
});
