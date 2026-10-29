import { fileURLToPath } from "node:url";

/**
 * Where a module shipped next to a plugin's entry lives: `.ts` in this repo, or a separate
 * build entry in `dist/` reached from either the plugin's own entry or the root entry's chunk.
 * `entryUrl` is the plugin entry's `import.meta.url`.
 */
export function siblingModuleUrl(
  entryUrl: string,
  pluginName: string,
  moduleName: string,
): URL {
  const entryFilePath = fileURLToPath(entryUrl);
  if (entryFilePath.endsWith(".ts")) {
    return new URL(`./${moduleName}.ts`, entryUrl);
  }
  if (entryFilePath.endsWith(`${pluginName}.js`)) {
    return new URL(`./${pluginName}/${moduleName}.js`, entryUrl);
  }
  return new URL(`./plugins/${pluginName}/${moduleName}.js`, entryUrl);
}
