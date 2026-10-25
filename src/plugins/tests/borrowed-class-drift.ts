/**
 * Checks ADR 0015: a plugin never relies on a class that only the utility stylesheet or another
 * plugin's styles define, since a site may not import the first and may not register the second.
 * Classes nobody in this package styles (Starlight's, such as `not-content`) are fine. Only finds
 * classes set as string literals (see EMITTED_CLASS_LIST_PATTERNS), not hast `className` arrays or
 * classes passed through variables. Returns one message per problem.
 */
export function findBorrowedClasses(options: {
  plugins: readonly {
    name: string;
    /** The plugin's TypeScript sources, scanned for the classes it emits. */
    scriptSource: string;
    /** The plugin's own SCSS. */
    stylesheetSource: string;
  }[];
  utilityStylesheetSource: string;
  /** Design tokens and shared components, which any plugin may import. */
  tokenAndComponentStylesheetSource: string;
}): string[] {
  const utilityClasses = findStyledClasses(options.utilityStylesheetSource);
  const tokenAndComponentClasses = findStyledClasses(
    options.tokenAndComponentStylesheetSource,
  );
  const pluginStyledClasses = new Map(
    options.plugins.map((plugin) => [
      plugin.name,
      findStyledClasses(plugin.stylesheetSource),
    ]),
  );

  const problems: string[] = [];
  for (const plugin of options.plugins) {
    const ownClasses = pluginStyledClasses.get(plugin.name)!;
    for (const emittedClass of findEmittedClasses(plugin.scriptSource)) {
      if (
        ownClasses.has(emittedClass) ||
        tokenAndComponentClasses.has(emittedClass)
      ) {
        continue;
      }
      if (utilityClasses.has(emittedClass)) {
        problems.push(
          `plugin "${plugin.name}" uses class "${emittedClass}" from the utility stylesheet`,
        );
        continue;
      }
      const ownerPluginName = [...pluginStyledClasses].find(
        ([pluginName, styledClasses]) =>
          pluginName !== plugin.name && styledClasses.has(emittedClass),
      )?.[0];
      if (ownerPluginName) {
        problems.push(
          `plugin "${plugin.name}" uses class "${emittedClass}" from plugin "${ownerPluginName}"`,
        );
      }
    }
  }
  return problems;
}

const CLASS_NAME_PATTERN = /^-?[_a-zA-Z][\w-]*$/;

// The class list strings a script puts on elements: `className = "..."`,
// `classList.add("...")`/`toggle`, `setAttribute("class", "...")` and `class="..."` in HTML.
const EMITTED_CLASS_LIST_PATTERNS = [
  /className\s*=\s*(["'`])(.*?)\1/g,
  /classList\.(?:add|toggle)\(\s*(["'`])(.*?)\1/g,
  /setAttribute\(\s*["']class["']\s*,\s*(["'`])(.*?)\1/g,
  /\sclass=(["'])(.*?)\1/g,
];

function findEmittedClasses(scriptSource: string): Set<string> {
  const emittedClasses = new Set<string>();
  for (const pattern of EMITTED_CLASS_LIST_PATTERNS) {
    for (const [, , classList] of scriptSource.matchAll(pattern)) {
      for (const classToken of classList.split(/\s+/)) {
        // Skip interpolated parts such as `foo--${variant}`
        if (!classToken.includes("${") && CLASS_NAME_PATTERN.test(classToken)) {
          emittedClasses.add(classToken);
        }
      }
    }
  }
  return emittedClasses;
}

function findStyledClasses(stylesheetSource: string): Set<string> {
  const sourceWithoutComments = stylesheetSource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  return new Set(
    Array.from(
      sourceWithoutComments.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g),
      ([, className]) => className,
    ),
  );
}
