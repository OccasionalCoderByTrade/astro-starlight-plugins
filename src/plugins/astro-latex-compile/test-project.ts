import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** Test helper: a fresh project root holding `files` (relative path → contents). */
export function makeProject(files: Record<string, string> = {}): string {
  const rootDirPath = mkdtempSync(join(tmpdir(), "latex-compile-project-"));
  for (const [relativeFilePath, contents] of Object.entries(files)) {
    const filePath = join(rootDirPath, relativeFilePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
  return rootDirPath;
}
