import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDebugOutput } from "./debug-output.js";

const rootDirPath = "/site";
const codegenDir = "/site/.astro/integrations/astro-latex-compile";

describe("resolveDebugOutput", () => {
  it("defaults both paths inside the codegen dir", () => {
    expect(resolveDebugOutput(rootDirPath, codegenDir, true)).toEqual({
      outputDir: join(codegenDir, "debug-images"),
      logFile: join(codegenDir, "latex-compile.log"),
    });
    expect(resolveDebugOutput(rootDirPath, codegenDir, {})).toEqual(
      resolveDebugOutput(rootDirPath, codegenDir, true),
    );
  });

  it("resolves given paths against the codegen dir", () => {
    expect(
      resolveDebugOutput(rootDirPath, codegenDir, {
        outputDir: "jpgs/",
        logFile: "logs/debug.log",
      }),
    ).toEqual({
      outputDir: join(codegenDir, "jpgs"),
      logFile: join(codegenDir, "logs/debug.log"),
    });
  });

  it.each(["", ".", "./", "/tmp/debug", "..", "../elsewhere", "a/../../b"])(
    "rejects outputDir %j",
    (outputDir) => {
      expect(() =>
        resolveDebugOutput(rootDirPath, codegenDir, { outputDir }),
      ).toThrow(/debug\.outputDir .* must be a non-empty relative path inside/);
    },
  );

  it("rejects a logFile outside the codegen dir", () => {
    expect(() =>
      resolveDebugOutput(rootDirPath, codegenDir, { logFile: "../debug.log" }),
    ).toThrow(/debug\.logFile/);
  });
});
