import { pathToFileURL } from "node:url";
import type { HookParameters } from "@astrojs/starlight/types";

type TConfigSetupParams = HookParameters<"config:setup">;

/** A Starlight plugin, as far as `runStarlightConfigSetup` needs one. */
type TStarlightPlugin = {
  hooks: {
    "config:setup"?: (params: TConfigSetupParams) => void | Promise<void>;
  };
};

export type TStarlightConfigSetupOptions = {
  /** Dir that `srcDir` is resolved against, usually from `makeFileTree`. */
  rootDirPath: string;
  /** Astro's `srcDir`, relative to `rootDirPath`. @default "src/" */
  srcDir?: string;
  /** Astro's `base`. @default "/" */
  base?: string;
  /** Astro's `config.integrations`, e.g. `[{ name: "@astrojs/markdoc", hooks: {} }]`. */
  integrations?: { name: string; hooks: object }[];
  /** @default "build" */
  command?: TConfigSetupParams["command"];
};

export type TStarlightConfigSetupResult = {
  /** Every config update the hook made, in order. */
  configUpdates: Parameters<TConfigSetupParams["updateConfig"]>[0][];
  /** The `sidebar` from the last config update that set one. */
  sidebar: unknown;
  /** Messages the hook logged with `logger.warn`. */
  warnings: string[];
  /** Messages the hook logged with `logger.error`. */
  errors: string[];
  /** Messages the hook logged with `logger.info`. */
  infos: string[];
};

/**
 * Test helper: runs a Starlight plugin's `config:setup` hook the way Starlight does, with a
 * fake `astroConfig` (`srcDir`, `base`, `integrations` under `rootDirPath`), a `command`, a
 * logger that records what it's given and an `updateConfig` that records each update.
 * Rejects with whatever the hook throws.
 */
export async function runStarlightConfigSetup(
  plugin: TStarlightPlugin,
  options: TStarlightConfigSetupOptions,
): Promise<TStarlightConfigSetupResult> {
  const {
    rootDirPath,
    srcDir = "src/",
    base = "/",
    integrations = [],
    command = "build",
  } = options;
  const rootUrl = pathToFileURL(`${rootDirPath}/`);
  const result: TStarlightConfigSetupResult = {
    configUpdates: [],
    sidebar: undefined,
    warnings: [],
    errors: [],
    infos: [],
  };

  const logger = {
    label: "test",
    options: {},
    info: (message: string) => result.infos.push(message),
    warn: (message: string) => result.warnings.push(message),
    error: (message: string) => result.errors.push(message),
    debug: () => {},
    fork: () => logger,
  };

  const params = {
    command,
    isRestart: false,
    astroConfig: {
      root: rootUrl,
      srcDir: new URL(srcDir, rootUrl),
      publicDir: new URL("public/", rootUrl),
      base,
      integrations,
    },
    config: {},
    logger,
    updateConfig: (update: TStarlightConfigSetupResult["configUpdates"][number]) => {
      result.configUpdates.push(update);
      if ("sidebar" in update) result.sidebar = update.sidebar;
    },
    addIntegration: () => {},
    addRouteMiddleware: () => {},
    useTranslations: () => () => "",
    absolutePathToLang: () => "en",
  } as unknown as TConfigSetupParams;

  await plugin.hooks["config:setup"]?.(params);
  return result;
}
