import GithubSlugger from "github-slugger";
import { toString } from "mdast-util-to-string";
import { visit } from "unist-util-visit";
import type { Heading, Nodes, Root } from "mdast";
import type { Plugin } from "unified";

const STRIP_NODE_TYPES = new Set(["math", "inlineMath"]);

function headingText(node: Heading): string {
  const parts: string[] = [];
  for (const child of node.children) {
    if (STRIP_NODE_TYPES.has(child.type)) continue;
    parts.push(toString(child as Nodes, { includeImageAlt: false }));
  }
  return parts.join("").trim();
}

/**
 * Remark plugin that assigns heading IDs matching VS Code's markdown link
 * resolver: GFM slugification of the raw heading text, with math nodes stripped.
 * Runs before Astro's rehypeHeadingIds, which skips headings that already
 * have an id, so this takes precedence.
 */
const remarkGfmSlug: Plugin<[], Root> = () => {
  return (tree) => {
    const slugger = new GithubSlugger();

    visit(tree, "heading", (node: Heading) => {
      const text = headingText(node);
      const id = slugger.slug(text);
      (node.data ??= {}).id = id;
      ((node.data.hProperties ??= {}) as Record<string, unknown>).id = id;
    });
  };
};

export default remarkGfmSlug;
