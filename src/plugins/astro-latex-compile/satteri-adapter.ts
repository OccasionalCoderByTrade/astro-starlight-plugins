import { fileURLToPath } from "node:url";
import type { Code, Root } from "mdast";
import { visit } from "unist-util-visit";
import { texCompileBlockFromCodeNode, type TLatexCompileCore } from "./core.js";
import { isTexCompileBlock } from "./meta-options.js";
import { prebuiltHastNode } from "./prebuilt-hast.js";

/** What the plugin uses of Sätteri's per-doc visitor context. */
type TSatteriMdastVisitorContext = {
  /** The doc's `fileURL` compile option. */
  readonly fileURL: URL | undefined;
  /** The per-compile data bag, the same object for every hook and visitor of one doc. */
  readonly data: object;
  /** `"mdx"` for an MDX doc, `"markdown"` otherwise. */
  readonly sourceFormat: string;
};

/**
 * Values put in the config JSON Astro hashes, so a change to any of them
 * clears Astro's content store and docs render again.
 */
export interface TLatexCompileCacheKeys {
  texInputsHash: string;
  /** The `zoom` option, resolved. */
  zoom: boolean;
}

/** A block's HTML from the core, keyed by the block's start offset in the doc body. */
type TBlockHtmlByOffset = Map<number, string>;

/**
 * The mdast plugin for the `satteri` processor. `before` finds the doc's
 * `tex compile` blocks and renders them all through the core, and the `code`
 * visitor swaps each block for its HTML: raw in a Markdown doc, prebuilt hast
 * in an MDX doc.
 *
 * It is one plain object rather than a per-doc factory, so `cacheKeys`
 * stay in the config JSON Astro hashes (a function would be dropped). Per-doc
 * state is keyed by Sätteri's per-compile `data` bag instead.
 */
export function createSatteriLatexCompile(
  core: TLatexCompileCore,
  cacheKeys: TLatexCompileCacheKeys,
) {
  const blockHtmlsByDoc = new WeakMap<object, TBlockHtmlByOffset>();

  return {
    name: "astro-latex-compile",
    ...cacheKeys,
    // The core needs each block's line, and the visitor matches blocks by offset.
    options: { position: true },

    async before(root: Readonly<Root>, context: TSatteriMdastVisitorContext) {
      const blockNodes: Readonly<Code>[] = [];
      visit(root as Root, "code", (node) => {
        if (isTexCompileBlock(node.lang, node.meta)) blockNodes.push(node);
      });

      const blockHtmls = await core.renderDoc(
        context.fileURL ? fileURLToPath(context.fileURL) : undefined,
        blockNodes.map(texCompileBlockFromCodeNode),
      );

      const blockHtmlByOffset: TBlockHtmlByOffset = new Map();
      blockNodes.forEach((node, i) => {
        const startOffset = node.position?.start.offset;
        if (startOffset !== undefined) {
          blockHtmlByOffset.set(startOffset, blockHtmls[i]);
        }
      });
      blockHtmlsByDoc.set(context.data, blockHtmlByOffset);
    },

    code(node: Readonly<Code>, context: TSatteriMdastVisitorContext) {
      const startOffset = node.position?.start.offset;
      if (startOffset === undefined) return;
      const blockHtml = blockHtmlsByDoc.get(context.data)?.get(startOffset);
      if (blockHtml === undefined) return;
      if (context.sourceFormat === "mdx") return prebuiltHastNode(blockHtml);
      return { raw: blockHtml, mdxExpressions: false };
    },
  };
}
