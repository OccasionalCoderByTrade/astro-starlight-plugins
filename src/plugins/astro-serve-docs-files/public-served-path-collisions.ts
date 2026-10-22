/** Served path collisions between served docs files and files in `public/`. */
import { resolve } from "node:path";
import type { ServedFileRule } from "../utils/served-file-rule.js";
import { SERVE_DOCS_FILES_INTEGRATION_NAME } from "../utils/serve-docs-files-integration.js";
import { isFile } from "../utils/workspace-utils.js";
import { listServedFilePaths } from "./docs-file-route.js";

/** A served docs file and the `public/` file that shares its served path. */
export type TPublicServedPathCollision = {
  docsFilePath: string;
  publicFilePath: string;
};

/** The two dirs whose files are served at their path relative to the dir. */
export type TServedDirPaths = {
  docsDirPath: string;
  publicDirPath: string;
};

const STALE_COPY_NOTE =
  "Alternatively, it may be a stale holdover from a previous version of starlight-cannoli-plugins's syncDocsToPublic 3.0.0 plugin.";

/** The served path collision with `public/` at one path relative to the docs dir, if any. */
export function findPublicServedPathCollision(
  relativeFilePath: string,
  servedDirPaths: TServedDirPaths,
  isServed: ServedFileRule,
): TPublicServedPathCollision | undefined {
  const docsFilePath = resolve(servedDirPaths.docsDirPath, relativeFilePath);
  const publicFilePath = resolve(
    servedDirPaths.publicDirPath,
    relativeFilePath,
  );
  if (!isFile(publicFilePath) || !isFile(docsFilePath)) return undefined;
  if (!isServed(relativeFilePath)) return undefined;
  return { docsFilePath, publicFilePath };
}

/** Every served docs file whose served path is also a file in `public/`. */
export function findPublicServedPathCollisions(
  servedDirPaths: TServedDirPaths,
  isServed: ServedFileRule,
): TPublicServedPathCollision[] {
  return listServedFilePaths(servedDirPaths.docsDirPath, isServed).flatMap(
    (relativeFilePath) => {
      const collision = findPublicServedPathCollision(
        relativeFilePath,
        servedDirPaths,
        isServed,
      );
      return collision ? [collision] : [];
    },
  );
}

/**
 * The error message for one or more served path collisions with `public/`, listing both
 * files of each.
 */
export function formatPublicServedPathCollisionsMessage(
  collisions: TPublicServedPathCollision[],
): string {
  const collisionList = collisions
    .map(
      ({ docsFilePath, publicFilePath }) =>
        `  - ${docsFilePath}\n    ${publicFilePath}`,
    )
    .join("\n");
  return (
    `[${SERVE_DOCS_FILES_INTEGRATION_NAME}] These docs files have the same served path as a file in public/, so only one of each pair can be served:\n` +
    `${collisionList}\n\n` +
    `Delete or move one file of each pair. ${STALE_COPY_NOTE}`
  );
}

type TDevRequest = { url?: string };
type TDevResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

/** A request URL's path relative to the docs dir, or undefined when it can't be one. */
function toRelativeFilePath(requestUrl: string): string | undefined {
  const urlPathname = requestUrl.split(/[?#]/)[0];
  let decodedPathname: string;
  try {
    decodedPathname = decodeURIComponent(urlPathname);
  } catch {
    return undefined;
  }
  const segments = decodedPathname.split("/").filter(Boolean);
  if (segments.length === 0 || segments.includes("..")) return undefined;
  return segments.join("/");
}

/**
 * Dev middleware for a served path collision with `public/` created mid-session: answers a 500 naming both
 * files at that URL, instead of letting Vite serve the `public/` file. The dev server keeps
 * running. Startup collisions are thrown by the startup scan instead.
 */
export function createPublicServedPathCollisionMiddleware(
  servedDirPaths: TServedDirPaths,
  isServed: ServedFileRule,
) {
  return (request: TDevRequest, response: TDevResponse, next: () => void) => {
    const relativeFilePath = toRelativeFilePath(request.url ?? "");
    if (!relativeFilePath) return next();
    let collision: TPublicServedPathCollision | undefined;
    try {
      collision = findPublicServedPathCollision(
        relativeFilePath,
        servedDirPaths,
        isServed,
      );
    } catch {
      // Unparseable frontmatter mid-session is the route's to report, not this check's
      return next();
    }
    if (!collision) return next();
    response.statusCode = 500;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end(formatPublicServedPathCollisionsMessage([collision]));
  };
}
