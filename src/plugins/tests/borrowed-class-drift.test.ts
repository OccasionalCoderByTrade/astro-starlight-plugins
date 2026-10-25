import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findBorrowedClasses } from "./borrowed-class-drift.js";

describe("findBorrowedClasses", () => {
  it("reports a class the plugin only gets from the utility stylesheet", () => {
    const borrowedClassProblems = findBorrowedClasses({
      plugins: [
        {
          name: "foo",
          scriptSource: 'wrapper.className = "not-content pe-1";',
          stylesheetSource: "",
        },
      ],
      utilityStylesheetSource: ".pe-1 { padding-right: 0.25rem !important; }",
      tokenAndComponentStylesheetSource: "",
    });
    expect(borrowedClassProblems).toEqual([
      'plugin "foo" uses class "pe-1" from the utility stylesheet',
    ]);
  });

  it("reports a class the plugin only gets from another plugin's styles", () => {
    const borrowedClassProblems = findBorrowedClasses({
      plugins: [
        {
          name: "foo",
          scriptSource: 'button.classList.add("bar-btn");',
          stylesheetSource: "",
        },
        {
          name: "bar",
          scriptSource: 'button.className = "bar-btn";',
          stylesheetSource: ".bar-btn { color: red; }",
        },
      ],
      utilityStylesheetSource: "",
      tokenAndComponentStylesheetSource: "",
    });
    expect(borrowedClassProblems).toEqual([
      'plugin "foo" uses class "bar-btn" from plugin "bar"',
    ]);
  });

  it("accepts classes styled by the plugin itself, by a shared component, or by nobody we ship", () => {
    const borrowedClassProblems = findBorrowedClasses({
      plugins: [
        {
          name: "foo",
          scriptSource: [
            'icon.setAttribute("class", "foo-icon");',
            'const html = `<div class="shared-toggle not-content">`;',
          ].join("\n"),
          stylesheetSource: ".foo-icon { width: 1em; }",
        },
      ],
      utilityStylesheetSource: ".foo-icon, .shared-toggle { display: none; }",
      tokenAndComponentStylesheetSource: ".shared-toggle { display: flex; }",
    });
    expect(borrowedClassProblems).toEqual([]);
  });

  it("ignores the interpolated parts of a class list", () => {
    const borrowedClassProblems = findBorrowedClasses({
      plugins: [
        {
          name: "foo",
          scriptSource:
            "banner.className = `foo-banner foo-banner--${variant} ${extra}`;",
          stylesheetSource: ".foo-banner { position: fixed; }",
        },
      ],
      utilityStylesheetSource: ".foo-banner--, .variant { display: none; }",
      tokenAndComponentStylesheetSource: "",
    });
    expect(borrowedClassProblems).toEqual([]);
  });
});

describe("this package", () => {
  it("has no plugin that borrows a class from the utility stylesheet or another plugin", async () => {
    const srcDirPath = fileURLToPath(new URL("../..", import.meta.url));
    const pluginsDirPath = join(srcDirPath, "plugins");
    const stylesDirPath = join(srcDirPath, "styles");

    async function readJoinedFileSources(
      dirPath: string,
      isIncluded: (relativeFilePath: string) => boolean,
    ): Promise<string> {
      const relativeFilePaths = (
        await readdir(dirPath, { recursive: true })
      ).filter(isIncluded);
      const fileSources = await Promise.all(
        relativeFilePaths.map((relativeFilePath) =>
          readFile(join(dirPath, relativeFilePath), "utf8"),
        ),
      );
      return fileSources.join("\n");
    }

    const pluginEntries = (
      await readdir(pluginsDirPath, { withFileTypes: true })
    ).filter(
      (entry) =>
        !["utils", "tests"].includes(entry.name) &&
        (entry.isDirectory() ||
          (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"))),
    );
    const plugins = await Promise.all(
      pluginEntries.map(async (entry) => {
        if (!entry.isDirectory()) {
          return {
            name: entry.name.replace(/\.ts$/, ""),
            scriptSource: await readFile(
              join(pluginsDirPath, entry.name),
              "utf8",
            ),
            stylesheetSource: "",
          };
        }
        const pluginDirPath = join(pluginsDirPath, entry.name);
        return {
          name: entry.name,
          scriptSource: await readJoinedFileSources(
            pluginDirPath,
            (relativeFilePath) =>
              relativeFilePath.endsWith(".ts") &&
              !relativeFilePath.endsWith(".test.ts"),
          ),
          stylesheetSource: await readJoinedFileSources(
            pluginDirPath,
            (relativeFilePath) => relativeFilePath.endsWith(".scss"),
          ),
        };
      }),
    );

    const borrowedClassProblems = findBorrowedClasses({
      plugins,
      utilityStylesheetSource: await readJoinedFileSources(
        stylesDirPath,
        (relativeFilePath) =>
          ["utilities.scss", "_bootstrap-utilities.scss"].includes(
            relativeFilePath,
          ),
      ),
      tokenAndComponentStylesheetSource: await readJoinedFileSources(
        stylesDirPath,
        (relativeFilePath) =>
          relativeFilePath === "tokens.scss" ||
          relativeFilePath.startsWith("components"),
      ),
    });
    expect(borrowedClassProblems).toEqual([]);
  });
});
