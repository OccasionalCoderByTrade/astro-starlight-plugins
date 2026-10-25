import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Builds a `page-ssr` script that imports plugin styles, so Vite bundles them
 * into every page (ADR 0015). Each stylesheet file path is relative to `src/`,
 * without an extension, e.g. `styles/tokens` or `plugins/foo/styles`. Run from
 * source, it imports the `.scss`; from the package, the compiled `.css` that
 * `lib:build` writes to the same path under `dist/`.
 */
export function pluginStylesImportScript(
  stylesheetRelativeFilePaths: readonly string[],
  moduleFilePath: string = fileURLToPath(import.meta.url),
): string {
  const moduleDirPath = dirname(moduleFilePath);
  const isSource = moduleFilePath.endsWith(".ts");
  // From source this module is src/plugins/utils/plugin-styles.ts. Bundled, it
  // can sit in any entry or chunk under dist/, at any depth.
  const stylesRootDirPath = isSource
    ? join(moduleDirPath, "..", "..")
    : findDistDirPath(moduleDirPath);
  const fileExtension = isSource ? ".scss" : ".css";
  return stylesheetRelativeFilePaths
    .map(
      (stylesheetRelativeFilePath) =>
        `import ${JSON.stringify(join(stylesRootDirPath, stylesheetRelativeFilePath + fileExtension))};`,
    )
    .join("\n");
}

function findDistDirPath(moduleDirPath: string): string {
  let candidateDirPath = moduleDirPath;
  while (basename(candidateDirPath) !== "dist") {
    const parentDirPath = dirname(candidateDirPath);
    if (parentDirPath === candidateDirPath) {
      throw new Error(`No dist/ directory above ${moduleDirPath}`);
    }
    candidateDirPath = parentDirPath;
  }
  return candidateDirPath;
}
