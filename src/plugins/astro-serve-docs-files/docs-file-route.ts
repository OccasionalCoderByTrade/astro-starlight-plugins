import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import {
  createServedFileRule,
  type ServedFileRule,
} from "../utils/served-file-rule.js";
import { SERVE_DOCS_FILES_INTEGRATION_NAME } from "../utils/serve-docs-files-integration.js";
import { SOURCE_DOC_EXTENSIONS } from "../utils/workspace-utils.js";

/** What the route module needs from the integration, passed as JSON through a virtual module. */
export type TDocsFileRouteSettings = {
  docsDirPath: string;
  ignorePatterns: string[];
};

const UTF8 = "; charset=utf-8";

/** Content types by lowercase extension. Anything else is served as `application/octet-stream`. */
const CONTENT_TYPES: Record<string, string> = {
  ...Object.fromEntries(
    SOURCE_DOC_EXTENSIONS.map((extension) => [
      extension,
      `text/markdown${UTF8}`,
    ]),
  ),
  ".txt": `text/plain${UTF8}`,
  ".csv": `text/csv${UTF8}`,
  ".html": `text/html${UTF8}`,
  ".css": `text/css${UTF8}`,
  ".js": `text/javascript${UTF8}`,
  ".mjs": `text/javascript${UTF8}`,
  ".json": `application/json${UTF8}`,
  ".xml": `application/xml${UTF8}`,
  ".tex": `text/x-tex${UTF8}`,
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function contentTypeOf(filePath: string): string {
  return (
    CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream"
  );
}

/**
 * Every served file under `docsDirPath`, as a `/`-separated path relative to it. Skips a
 * dir the rule leaves out without walking it. When the rule throws (unparseable
 * frontmatter), this throws too, unless `onRuleError` is given: then that entry is left
 * out, and `onRuleError` gets the error.
 */
export function listServedFilePaths(
  docsDirPath: string,
  isServed: ServedFileRule,
  onRuleError?: (error: unknown) => void,
): string[] {
  const isEntryServed = (docsRelativeEntryPath: string) => {
    if (!onRuleError) return isServed(docsRelativeEntryPath);
    try {
      return isServed(docsRelativeEntryPath);
    } catch (error) {
      onRuleError(error);
      return false;
    }
  };
  const walk = (relativeDirSegments: string[]): string[] =>
    readdirSync(resolve(docsDirPath, ...relativeDirSegments), {
      withFileTypes: true,
    }).flatMap((entry) => {
      const relativeEntrySegments = [...relativeDirSegments, entry.name];
      const docsRelativeEntryPath = relativeEntrySegments.join("/");
      if (!isEntryServed(docsRelativeEntryPath)) return [];
      if (entry.isDirectory()) return walk(relativeEntrySegments);
      return entry.isFile() ? [docsRelativeEntryPath] : [];
    });
  return walk([]);
}

/**
 * The injected `/[...path]` route's `getStaticPaths` and `GET`: every served docs file at
 * its path under the docs directory, read from source on each request.
 */
export function createDocsFileRoute(settings: TDocsFileRouteSettings) {
  const { docsDirPath, ignorePatterns } = settings;
  const isServed = createServedFileRule({ docsDirPath, ignorePatterns });

  return {
    // Dev setup and build start already threw on unparseable frontmatter, so here it's a
    // save made mid-session in dev: that file isn't served, and the rest still are
    getStaticPaths: () =>
      listServedFilePaths(docsDirPath, isServed, (error) =>
        console.error(
          `[${SERVE_DOCS_FILES_INTEGRATION_NAME}] Not serving a docs file: ` +
            (error instanceof Error ? error.message : String(error)),
        ),
      ).map((relativeFilePath) => ({
        params: { path: relativeFilePath },
      })),
    // Astro only routes a request here when `getStaticPaths` listed its path
    GET: async ({ params }: { params: { path?: string } }) => {
      const fileBytes = await readFile(resolve(docsDirPath, params.path ?? ""));
      return new Response(fileBytes, {
        headers: { "content-type": contentTypeOf(params.path ?? "") },
      });
    },
  };
}
