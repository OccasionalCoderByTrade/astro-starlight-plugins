import { extname, sep } from "node:path";
import { slug } from "github-slugger";

/**
 * `My Guide/List Syntax.md` → `my-guide/list-syntax`, `reference/Index.md` → `reference`.
 * Unlike Astro's ID, the home page's `index.md` → ``, to match the decoded pathname `/`.
 * `docsRelativeFilePath` may use `/` or the platform separator.
 */
export function toSourceDocPagePath(docsRelativeFilePath: string): string {
  return toPagePath(
    removeExtension(docsRelativeFilePath).split(sep).join("/").split("/"),
  );
}

/** `["My Guide", "List Syntax"]` → `my-guide/list-syntax`, `["guide", "Index"]` → `guide`. */
export function toPagePath(segments: string[]): string {
  return segments
    .map((segment) => slug(segment))
    .join("/")
    .replace(/(^|\/)index$/, "");
}

/** `guide/v1.2-notes.md` → `guide/v1.2-notes`. */
export function removeExtension(filePath: string): string {
  return filePath.slice(0, filePath.length - extname(filePath).length);
}
