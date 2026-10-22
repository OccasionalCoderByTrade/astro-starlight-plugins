import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import {
  createServedFileRule,
  type ServedFileRule,
} from "../utils/served-file-rule.js";

/** What the route module needs from the integration, passed as JSON through a virtual module. */
export type TDocsFileRouteSettings = {
  docsDirPath: string;
  ignorePatterns: string[];
};

const UTF8 = "; charset=utf-8";

/** Content types by lowercase extension. Anything else is served as `application/octet-stream`. */
const CONTENT_TYPES: Record<string, string> = {
  ".md": `text/markdown${UTF8}`,
  ".mdx": `text/markdown${UTF8}`,
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
 * dir the rule leaves out without walking it. Throws when the rule does (unparseable
 * frontmatter).
 */
export function listServedFilePaths(
  docsDirPath: string,
  isServed: ServedFileRule,
): string[] {
  const walk = (relativeDirSegments: string[]): string[] =>
    readdirSync(resolve(docsDirPath, ...relativeDirSegments), {
      withFileTypes: true,
    }).flatMap((entry) => {
      const relativeSegments = [...relativeDirSegments, entry.name];
      const relativePath = relativeSegments.join("/");
      if (!isServed(relativePath)) return [];
      if (entry.isDirectory()) return walk(relativeSegments);
      return entry.isFile() ? [relativePath] : [];
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
    getStaticPaths: () =>
      listServedFilePaths(docsDirPath, isServed).map((relativeFilePath) => ({
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
