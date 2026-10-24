/**
 * Checks ADR 0013: every plugin's tsup entry (`plugins/<name>`) has a matching package export
 * (`./<name>`) and vice versa. Internal sibling modules (`plugins/<name>/<module>`) keep a
 * tsup entry but must not be exported. When `rootIndexSource` (the text of `src/index.ts`) is
 * given, every plugin it re-exports must have a tsup entry too. Returns one message per problem.
 */
export function findSubpathExportDrift(options: {
  buildEntries: string[];
  packageExports: Record<string, unknown>;
  rootIndexSource?: string;
}): string[] {
  const { buildEntries, packageExports, rootIndexSource } = options;
  const driftProblems: string[] = [];
  const buildEntrySet = new Set(buildEntries);

  for (const buildEntry of buildEntries) {
    const pluginName = pluginNameOfBuildEntry(buildEntry);
    if (pluginName === undefined) continue;
    const exportKey = `./${pluginName}`;
    if (!(exportKey in packageExports)) {
      driftProblems.push(
        `build entry "${buildEntry}" has no package export "${exportKey}"`,
      );
    }
  }

  for (const [exportKey, exportTarget] of Object.entries(packageExports)) {
    // String targets (e.g. `./styles`) ship copied files, not build entries.
    if (exportKey === "." || typeof exportTarget !== "object") continue;
    const buildEntry = `plugins/${exportKey.slice("./".length)}`;
    if (!buildEntrySet.has(buildEntry)) {
      driftProblems.push(
        `package export "${exportKey}" has no build entry "${buildEntry}"`,
      );
      continue;
    }
    if (pluginNameOfBuildEntry(buildEntry) === undefined) {
      driftProblems.push(
        `package export "${exportKey}" exposes internal module "${buildEntry}"`,
      );
      continue;
    }
    const expectedExportTarget = {
      import: `./dist/${buildEntry}.js`,
      types: `./dist/${buildEntry}.d.ts`,
    };
    if (JSON.stringify(exportTarget) !== JSON.stringify(expectedExportTarget)) {
      driftProblems.push(
        `package export "${exportKey}" should be ${JSON.stringify(expectedExportTarget)}`,
      );
    }
  }

  if (rootIndexSource !== undefined) {
    const reexportPattern = /from\s+"\.\/plugins\/([^/"]+?)(?:\.js|\/index\.js)"/g;
    for (const match of rootIndexSource.matchAll(reexportPattern)) {
      const pluginName = match[1];
      const buildEntry = `plugins/${pluginName}`;
      if (!buildEntrySet.has(buildEntry)) {
        driftProblems.push(
          `plugin "${pluginName}" is re-exported from src/index.ts but has no build entry "${buildEntry}"`,
        );
      }
    }
  }

  return driftProblems;
}

/** `plugins/<name>` → `<name>`; anything else (root `index`, internal modules) → undefined. */
function pluginNameOfBuildEntry(buildEntry: string): string | undefined {
  const match = /^plugins\/([^/]+)$/.exec(buildEntry);
  return match?.[1];
}
