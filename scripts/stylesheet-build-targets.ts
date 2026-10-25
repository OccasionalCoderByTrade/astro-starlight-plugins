import { posix } from "node:path";

export type StylesheetBuildTarget = {
  sourceRelativeFilePath: string;
  outputRelativeFilePath: string;
};

const SHIPPED_STYLE_RELATIVE_DIR_PATHS = ["plugins/", "styles/"];

/**
 * Picks the stylesheets `lib:build` compiles (ADR 0015) out of file paths
 * relative to `src/`: every non-partial `.scss` under `src/plugins` or
 * `src/styles`, compiled to the same path under `dist/` as `.css`.
 */
export function stylesheetBuildTargets(
  srcRelativeFilePaths: readonly string[],
): StylesheetBuildTarget[] {
  return srcRelativeFilePaths
    .filter(
      (relativeFilePath) =>
        relativeFilePath.endsWith(".scss") &&
        !posix.basename(relativeFilePath).startsWith("_") &&
        SHIPPED_STYLE_RELATIVE_DIR_PATHS.some((styleRelativeDirPath) =>
          relativeFilePath.startsWith(styleRelativeDirPath),
        ),
    )
    .map((relativeFilePath) => ({
      sourceRelativeFilePath: relativeFilePath,
      outputRelativeFilePath: relativeFilePath.replace(/\.scss$/, ".css"),
    }));
}
