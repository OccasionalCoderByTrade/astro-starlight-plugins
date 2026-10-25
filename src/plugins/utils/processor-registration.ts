import type { AstroIntegration } from "astro";

type TConfigSetupOptions = Parameters<
  NonNullable<AstroIntegration["hooks"]["astro:config:setup"]>
>[0];
type TConfigDoneOptions = Parameters<
  NonNullable<AstroIntegration["hooks"]["astro:config:done"]>
>[0];

/** What the helper uses of `config.markdown`, on Astro 7 and on earlier versions. */
type TMarkdownConfig = {
  processor?: { name: string; options: Record<string, unknown[] | undefined> };
  remarkPlugins?: unknown[];
};

/** A remark attacher, or an `[attacher, options]` tuple. */
export type TRemarkPluginEntry =
  | ((...args: never[]) => unknown)
  | [(...args: never[]) => unknown, unknown];

/** What the helper needs of a Sätteri mdast plugin definition: its `name`. */
type TSatteriMdastPluginDefinition = { readonly name: string };

/**
 * A Sätteri mdast plugin, or a factory Sätteri calls per doc to get one. A structural subset
 * of `MdastPluginEntry` from `satteri`, which isn't a dependency of this package.
 */
export type TSatteriPluginEntry =
  | TSatteriMdastPluginDefinition
  | ((
      factoryContext: never,
    ) => TSatteriMdastPluginDefinition | null | undefined | false);

export type TProcessorRegistrationOptions = {
  /** The integration's name, such as `astro-latex-compile`. Prefixes every error message. */
  pluginName: string;
  /** The integration function's export name, such as `astroLatexCompile`, for error messages. */
  exportName: string;
  /** Registered on the `unified` processor, or in `markdown.remarkPlugins` before Astro 7. */
  remarkPlugin: TRemarkPluginEntry;
  /** Registered on the `satteri` processor. */
  satteriPlugin: TSatteriPluginEntry;
};

/** Registers one Markdown plugin into the site's Markdown processor. */
export type TProcessorRegistration = {
  /** Call from `astro:config:setup`. */
  register(
    config: TConfigSetupOptions["config"],
    updateConfig: TConfigSetupOptions["updateConfig"],
  ): void;
  /** Call from `astro:config:done`. */
  assertStillRegistered(config: TConfigDoneOptions["config"]): void;
};

/**
 * Registers a Markdown plugin into whichever Markdown processor the site uses (ADR 0017).
 * Call `register` from `astro:config:setup` and `assertStillRegistered` from
 * `astro:config:done`. Both throw for a processor other than `unified` or `satteri`, or for
 * a processor a later integration replaced, so the plugin never silently doesn't run.
 */
export function createProcessorRegistration({
  pluginName,
  exportName,
  remarkPlugin,
  satteriPlugin,
}: TProcessorRegistrationOptions): TProcessorRegistration {
  let registeredPlugin: unknown;
  let registeredPluginListKey: "remarkPlugins" | "mdastPlugins";

  /**
   * Astro re-validates `markdown.remarkPlugins` after `astro:config:setup`, which copies
   * tuples, so a tuple is found by its attacher instead.
   */
  function isRegisteredPlugin(pluginEntry: unknown): boolean {
    if (pluginEntry === registeredPlugin) return true;
    return (
      Array.isArray(registeredPlugin) &&
      Array.isArray(pluginEntry) &&
      pluginEntry[0] === registeredPlugin[0]
    );
  }

  return {
    register(config, updateConfig) {
      const { processor } = config.markdown as TMarkdownConfig;
      if (!processor) {
        // Only this plugin: `updateConfig` concatenates arrays, so spreading the existing
        // list would register the site's own remark plugins a second time.
        registeredPlugin = remarkPlugin;
        registeredPluginListKey = "remarkPlugins";
        updateConfig({ markdown: { remarkPlugins: [remarkPlugin] } } as Parameters<
          typeof updateConfig
        >[0]);
        return;
      }

      if (processor.name === "unified") {
        registeredPlugin = remarkPlugin;
        registeredPluginListKey = "remarkPlugins";
      } else if (processor.name === "satteri") {
        registeredPlugin = satteriPlugin;
        registeredPluginListKey = "mdastPlugins";
      } else {
        throw new Error(
          `[${pluginName}] The configured \`markdown.processor\` ("${processor.name}") ` +
            "is not supported. Use `unified()` from `@astrojs/markdown-remark` or " +
            "`satteri()` from `@astrojs/markdown-satteri`.",
        );
      }
      (processor.options[registeredPluginListKey] ??= []).push(registeredPlugin);
    },

    assertStillRegistered(config) {
      const { processor, remarkPlugins } = config.markdown as TMarkdownConfig;
      const registeredPluginList = processor
        ? processor.options[registeredPluginListKey]
        : remarkPlugins;
      if (!registeredPluginList?.some(isRegisteredPlugin)) {
        throw new Error(
          `[${pluginName}] An integration listed after ${exportName} ` +
            `replaced \`markdown.processor\`, so ${exportName} won't run. ` +
            "Configure the processor in `markdown.processor` instead.",
        );
      }
    },
  };
}
