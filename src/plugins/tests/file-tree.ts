import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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

/** Root ignores file permissions, so tests that rely on a locked path skip under it. */
export const isRunningAsRoot = process.getuid?.() === 0;

const lockedPaths: string[] = [];

/** Test helper: removes every permission from a file or dir until `unlockAll` runs. */
export function lockPath(lockedPath: string): void {
  chmodSync(lockedPath, 0o000);
  lockedPaths.push(lockedPath);
}

/** Test helper: restores every path `lockPath` locked, so its temp dir can be deleted. */
export function unlockAll(): void {
  for (const lockedPath of lockedPaths.splice(0)) {
    chmodSync(lockedPath, 0o755);
  }
}
