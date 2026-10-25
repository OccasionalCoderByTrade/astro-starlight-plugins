/**
 * Plugins print paths relative to the project root (see `toDisplayPath`), never the working
 * directory, which differs when Astro runs with `--root`. Returns one message per line of
 * plugin code that reads `process.cwd()`.
 */
export function findWorkingDirUses(
  files: { relativeFilePath: string; source: string }[],
): string[] {
  const workingDirProblems: string[] = [];
  for (const { relativeFilePath, source } of files) {
    source.split("\n").forEach((line, i) => {
      if (/process\.cwd\s*\(/.test(line)) {
        workingDirProblems.push(
          `${relativeFilePath}:${i + 1} reads process.cwd()`,
        );
      }
    });
  }
  return workingDirProblems;
}
