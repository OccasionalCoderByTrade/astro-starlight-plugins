/**
 * Served path collisions between the docs file endpoint and other routes, found in a build
 * from what Astro wrote rather than predicted from source docs.
 */
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegrationLogger } from "astro";

/** The pattern of the route that serves docs files. */
export const DOCS_FILE_ROUTE_PATTERN = "/[...path]";

/** A route and the output files it wrote, as `astro:build:done` reports them. */
type TBuildAssets = Map<string, URL[]>;

/** A URL two routes both render, so Astro rendered it from the higher-priority one only. */
export type TRouteConflict = {
  pathname: string;
  winningRoutePattern: string;
  losingRoutePattern: string;
};

type TLogOptions = AstroIntegrationLogger["options"];
type TLogLevel = TLogOptions["level"];

const LOG_LEVEL_ORDER: TLogLevel[] = [
  "debug",
  "info",
  "warn",
  "error",
  "silent",
];

// Astro's `PrerenderRouteConflict` message
const ROUTE_CONFLICT_MESSAGE_REGEX =
  /^Could not render `(.+)` from route `(.+)` as it conflicts with higher priority route `(.+)`\.$/;

/**
 * Collects the URL clashes involving the endpoint that Astro logs while it renders a build.
 * Astro drops the lower-priority route's page at such a URL and only warns, and the dropped
 * page leaves no trace in the `assets` map, so its warning is the only record. It's read by
 * wrapping the destination Astro's loggers share, which isn't public Astro API, so it's
 * done here only. Warnings the log level hides are still collected, and still not shown.
 * `stop` puts the destination and log level back.
 */
export function listenForRouteConflicts(logOptions: TLogOptions): {
  routeConflicts: TRouteConflict[];
  stop: () => void;
} {
  const routeConflicts: TRouteConflict[] = [];
  const originalDestination = logOptions.destination;
  const originalLevel = logOptions.level;
  const isShown = (level: TLogLevel) =>
    LOG_LEVEL_ORDER.indexOf(level) >= LOG_LEVEL_ORDER.indexOf(originalLevel);

  if (!isShown("warn")) logOptions.level = "warn";
  logOptions.destination = {
    flush: originalDestination.flush?.bind(originalDestination),
    close: originalDestination.close?.bind(originalDestination),
    write: (message) => {
      const routeConflictMatch =
        message.level === "warn" &&
        ROUTE_CONFLICT_MESSAGE_REGEX.exec(String(message.message));
      if (routeConflictMatch) {
        const [, pathname, losingRoutePattern, winningRoutePattern] =
          routeConflictMatch;
        if (
          winningRoutePattern === DOCS_FILE_ROUTE_PATTERN ||
          losingRoutePattern === DOCS_FILE_ROUTE_PATTERN
        ) {
          routeConflicts.push({
            pathname,
            winningRoutePattern,
            losingRoutePattern,
          });
        }
      }
      if (isShown(message.level)) originalDestination.write(message);
    },
  };

  return {
    routeConflicts,
    stop: () => {
      logOptions.destination = originalDestination;
      logOptions.level = originalLevel;
    },
  };
}

/**
 * One error message listing every output file the endpoint shares with another route, or
 * null if there are none.
 */
export function formatRouteCollisionsError(options: {
  assets: TBuildAssets;
  routeConflicts: TRouteConflict[];
  distDirPath: string;
  docsDirPath: string;
}): string | null {
  const { assets, routeConflicts, distDirPath, docsDirPath } = options;
  const toDistRelativeFilePath = (fileUrl: URL) =>
    relative(distDirPath, fileURLToPath(fileUrl)).split("\\").join("/");

  const endpointOutputFilePaths = new Set(
    (assets.get(DOCS_FILE_ROUTE_PATTERN) ?? []).map(toDistRelativeFilePath),
  );
  const collisions: string[] = [];
  for (const [routePattern, fileUrls] of assets) {
    if (routePattern === DOCS_FILE_ROUTE_PATTERN) continue;
    for (const distRelativeFilePath of fileUrls.map(toDistRelativeFilePath)) {
      if (!endpointOutputFilePaths.has(distRelativeFilePath)) continue;
      collisions.push(
        `${distRelativeFilePath} is written by both ${DOCS_FILE_ROUTE_PATTERN} ` +
          `(serving ${join(docsDirPath, distRelativeFilePath)}) ` +
          `and ${routePattern}`,
      );
    }
  }
  for (const {
    pathname,
    winningRoutePattern,
    losingRoutePattern,
  } of routeConflicts) {
    const otherRoutePattern =
      winningRoutePattern === DOCS_FILE_ROUTE_PATTERN
        ? losingRoutePattern
        : winningRoutePattern;
    collisions.push(
      `${pathname} is rendered by both ${DOCS_FILE_ROUTE_PATTERN} ` +
        `(serving ${join(docsDirPath, pathname)}) and ${otherRoutePattern}, ` +
        `so Astro left out ${losingRoutePattern}'s output`,
    );
  }
  if (collisions.length === 0) return null;

  collisions.sort();
  return (
    `[astro-serve-docs-files] ${collisions.length} served path collision` +
    `${collisions.length === 1 ? "" : "s"} with other routes, ` +
    `so one route's output is lost:\n` +
    collisions.map((collision) => `  - ${collision}`).join("\n") +
    `\nRename or remove the docs file, or change the other route.`
  );
}
