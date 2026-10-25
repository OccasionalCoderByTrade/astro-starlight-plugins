import * as path from "node:path";

/**
 * How a path is printed in console output and error messages: relative to the project
 * root, or absolute when it's outside the root, with forward slashes either way. The root
 * is used rather than the working directory, which differs when Astro runs with `--root`.
 * `pathApi` is only overridden by tests, to check Windows paths.
 */
export function toDisplayPath(
  rootDirPath: string,
  targetPath: string,
  pathApi: typeof path.posix = path,
): string {
  const resolvedTargetPath = pathApi.resolve(rootDirPath, targetPath);
  const relativeTargetPath = pathApi.relative(rootDirPath, resolvedTargetPath);
  const isOutsideRoot =
    relativeTargetPath === ".." ||
    relativeTargetPath.startsWith(`..${pathApi.sep}`) ||
    pathApi.isAbsolute(relativeTargetPath);
  const displayPath = isOutsideRoot
    ? resolvedTargetPath
    : relativeTargetPath || ".";
  return displayPath.split(pathApi.sep).join("/");
}
