import { isAbsolute, relative, resolve, sep } from "node:path";

export interface DebugOptions {
  /**
   * Directory where debug tex diagram images are written, as a flat file
   * list. Relative to the integration's codegen dir.
   * @default "debug-images"
   */
  outputDir?: string;
  /**
   * Log file that records every image (re)write. Rotates by size. Relative to
   * the integration's codegen dir.
   * @default "latex-compile.log"
   */
  logFile?: string;
}

export interface DebugOutput {
  /** Absolute path of the debug tex diagram image directory. */
  outputDir: string;
  /** Absolute path of the debug log file. */
  logFile: string;
}

/**
 * Resolves a debug path inside `codegenDir`, throwing unless it names
 * something strictly inside it. See
 * docs/adr/0003-debug-output-lives-in-astro-codegen-dir.md.
 */
function resolveInside(
  codegenDir: string,
  path: string,
  optionName: string,
): string {
  const resolved = resolve(codegenDir, path);
  const relativePath = relative(codegenDir, resolved);
  if (
    isAbsolute(path) ||
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(
      `[astro-latex-compile] ${optionName} "${path}" must be a non-empty relative path inside "${codegenDir}".`,
    );
  }
  return resolved;
}

export function resolveDebugOutput(
  codegenDir: string,
  debug: true | DebugOptions,
): DebugOutput {
  const { outputDir = "debug-images", logFile = "latex-compile.log" } =
    debug === true ? {} : debug;
  return {
    outputDir: resolveInside(codegenDir, outputDir, "debug.outputDir"),
    logFile: resolveInside(codegenDir, logFile, "debug.logFile"),
  };
}
