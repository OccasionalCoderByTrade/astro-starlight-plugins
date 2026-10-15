import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findMissingTexInputDirs,
  hashTexInputs,
  listTexInputFiles,
  resolveTexInputDirs,
  texInputsSearchPath,
} from "./tex-inputs.js";
import { makeProject } from "./test-project.js";

const MACROS = {
  "src/latex/macros.tex": "\\newcommand{\\hi}{hi}\n",
  "src/latex/nested/sizes.tex": "\\def\\pad{0.12}\n",
};

function hashOf(rootDirPath: string, texInputDirs: string[]): string {
  return hashTexInputs(
    rootDirPath,
    resolveTexInputDirs(rootDirPath, texInputDirs),
  );
}

describe("hashTexInputs", () => {
  it("matches the 3.x hash, so upgrading doesn't recompile every compiled tex diagram", () => {
    const rootDirPath = makeProject(MACROS);

    // Produced by 3.x `computeTexInputDirsSalt` run from the project root.
    expect(hashOf(rootDirPath, ["src/latex//"])).toBe("916470ea4109d6a4");
    expect(hashOf(rootDirPath, ["src/latex/"])).toBe("008e896e2ddcecb3");
  });

  it("ignores dotfiles, dot-dirs, LaTeX build artifacts and editor backups, which a checkout elsewhere won't have", () => {
    const rootDirPath = makeProject({
      ...MACROS,
      "src/latex/.DS_Store": "junk",
      "src/latex/.macros.tex.swp": "junk",
      "src/latex/.git/HEAD": "junk",
      "src/latex/macros.tex~": "junk",
      "src/latex/macros.aux": "junk",
      "src/latex/macros.log": "junk",
      "src/latex/macros.fls": "junk",
      "src/latex/macros.fdb_latexmk": "junk",
      "src/latex/macros.synctex.gz": "junk",
      "src/latex/nested/sizes.out": "junk",
    });

    expect(hashOf(rootDirPath, ["src/latex//"])).toBe("916470ea4109d6a4");
  });

  it("changes when a tex input file changes", () => {
    const rootDirPath = makeProject(MACROS);
    const initialHash = hashOf(rootDirPath, ["src/latex//"]);

    writeFileSync(
      join(rootDirPath, "src/latex/nested/sizes.tex"),
      "\\def\\pad{0.2}\n",
    );

    expect(hashOf(rootDirPath, ["src/latex//"])).not.toBe(initialHash);
  });

  it("is the same for the same project checked out anywhere", () => {
    const firstRootDirPath = makeProject(MACROS);
    const secondRootDirPath = makeProject(MACROS);

    expect(hashOf(firstRootDirPath, ["src/latex//"])).toBe(
      hashOf(secondRootDirPath, ["src/latex//"]),
    );
  });
});

describe("listTexInputFiles", () => {
  it("lists the tex input files that count toward the hash", () => {
    const rootDirPath = makeProject({
      ...MACROS,
      "src/latex/macros.aux": "junk",
    });

    const filePaths = listTexInputFiles(
      resolveTexInputDirs(rootDirPath, ["src/latex//"]),
    );

    expect(filePaths).toEqual([
      join(rootDirPath, "src/latex/macros.tex"),
      join(rootDirPath, "src/latex/nested/sizes.tex"),
    ]);
  });
});

describe("findMissingTexInputDirs", () => {
  it("reports entries that aren't an existing directory", () => {
    const rootDirPath = makeProject({ ...MACROS, "src/not-a-dir.tex": "" });

    const missingDirs = findMissingTexInputDirs(
      resolveTexInputDirs(rootDirPath, [
        "src/latex//",
        "src/typo//",
        "src/not-a-dir.tex",
      ]),
    );

    expect(
      missingDirs.map((texInputDir) => texInputDir.configuredPath),
    ).toEqual(["src/typo//", "src/not-a-dir.tex"]);
  });
});

describe("texInputsSearchPath", () => {
  it("lists absolute dirs, marks recursive ones, and keeps TeX's default search path", () => {
    const texInputDirs = resolveTexInputDirs("/project", [
      "src/latex//",
      "shared/",
    ]);

    expect(texInputsSearchPath(texInputDirs, undefined)).toBe(
      ["/project/src/latex//", "/project/shared", ""].join(delimiter),
    );
    expect(texInputsSearchPath(texInputDirs, "/home/me/texmf//")).toBe(
      ["/project/src/latex//", "/project/shared", "/home/me/texmf//"].join(
        delimiter,
      ),
    );
  });
});
