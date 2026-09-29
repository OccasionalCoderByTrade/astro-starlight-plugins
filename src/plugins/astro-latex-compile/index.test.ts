import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { astroLatexCompile } from "./index.js";

describe("astroLatexCompile", () => {
  it("rejects an invalid debug path for every command, not just dev and build", async () => {
    const root = mkdtempSync(join(tmpdir(), "latex-compile-setup-"));
    const integration = astroLatexCompile({
      svgOutputDir: "public/tex-svgs",
      debug: { outputDir: "" },
    });
    const setup = integration.hooks["astro:config:setup"]!;
    const params = {
      command: "sync",
      config: {
        root: pathToFileURL(`${root}/`),
        publicDir: pathToFileURL(`${root}/public/`),
        base: "/",
      },
      createCodegenDir: () =>
        pathToFileURL(`${root}/.astro/integrations/astro-latex-compile/`),
    } as unknown as Parameters<typeof setup>[0];

    await expect(setup(params)).rejects.toThrow(/debug\.outputDir/);
  });
});
