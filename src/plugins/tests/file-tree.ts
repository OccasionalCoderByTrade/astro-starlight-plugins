import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Test helper: a fresh temp dir holding `files` (relative path → contents). A path ending
 * in `/` becomes an empty dir. Returns the dir's absolute path.
 */
export function makeFileTree(files: Record<string, string>): string {
  const rootDirPath = mkdtempSync(join(tmpdir(), "cannoli-file-tree-"));
  for (const [relativeFilePath, contents] of Object.entries(files)) {
    const filePath = join(rootDirPath, relativeFilePath);
    if (relativeFilePath.endsWith("/")) {
      mkdirSync(filePath, { recursive: true });
      continue;
    }
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
  return rootDirPath;
}
