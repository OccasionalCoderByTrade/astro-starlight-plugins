import { fileURLToPath } from "node:url";
import type { Element, ElementContent, Properties } from "hast";
import type { Code, Paragraph, Root } from "mdast";
import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";
import { visit } from "unist-util-visit";
import {
  isTexCompileBlock,
  texCompileBlockFromCodeNode,
  type TLatexCompileCore,
} from "./core.js";

/** What the plugin uses of Sätteri's per-doc visitor context. */
type TSatteriMdastVisitorContext = {
  /** The doc's `fileURL` compile option. */
  readonly fileURL: URL | undefined;
  /** The per-compile data bag, the same object for every hook and visitor of one doc. */
  readonly data: object;
  /** `"mdx"` for an MDX doc, `"markdown"` otherwise. */
  readonly sourceFormat: string;
};

/** A block's HTML from the core, keyed by the block's start offset in the doc body. */
type TBlockHtmlByOffset = Map<number, string>;

/** A parse5 node as hast, keeping attribute names as written. Comments are dropped. */
function toHastContent(
  node: DefaultTreeAdapterTypes.ChildNode,
): ElementContent | undefined {
  if (node.nodeName === "#text") {
    return {
      type: "text",
      value: (node as DefaultTreeAdapterTypes.TextNode).value,
    };
  }
  if (!("tagName" in node)) return undefined;
  const properties: Properties = {};
  for (const { name, value, prefix } of node.attrs) {
    properties[prefix ? `${prefix}:${name}` : name] = value;
  }
  const children = node.childNodes
    .map(toHastContent)
    .filter((child) => child !== undefined);
  if (node.tagName === "style") {
    // Astro's Sätteri MDX pipeline moves a `<style>` whose children are all
    // text into a `set:html` prop, which its static optimizer then writes out
    // as a literal attribute, leaving the compiled tex diagram without its
    // fonts. An empty comment opts out of that move, and nothing reads it.
    children.push({ type: "comment", value: "" });
  }
  return {
    type: "element",
    tagName: node.tagName,
    properties,
    children,
  };
}

/**
 * The block's HTML as an mdast node that carries its hast. MDX has no raw
 * HTML, and Sätteri re-parses a `raw` string in an MDX doc as MDX, which turns
 * the compiled tex diagram's CSS and text into Markdown paragraphs.
 */
function prebuiltHastNode(blockHtml: string): Paragraph {
  const fragmentContent = parseFragment(blockHtml)
    .childNodes.map(toHastContent)
    .filter((child) => child !== undefined);
  const rootElements = fragmentContent.filter(
    (child): child is Element => child.type === "element",
  );
  const rootElement: Element =
    rootElements.length === 1
      ? rootElements[0]
      : {
          type: "element",
          tagName: "div",
          properties: {},
          children: fragmentContent,
        };
  // Any mdast node type would do: `hName` decides the element it becomes.
  return {
    type: "paragraph",
    children: [],
    data: {
      hName: rootElement.tagName,
      hProperties: rootElement.properties,
      hChildren: rootElement.children,
    },
  };
}

/**
 * The mdast plugin for the `satteri` processor. `before` finds the doc's
 * `tex compile` blocks and renders them all through the core, and the `code`
 * visitor swaps each block for its HTML: raw in a Markdown doc, prebuilt hast
 * in an MDX doc.
 *
 * It is one plain object rather than a per-doc factory, so `texInputsHash`
 * stays in the config JSON Astro hashes (a function would be dropped). Per-doc
 * state is keyed by Sätteri's per-compile `data` bag instead.
 */
export function createSatteriLatexCompile(
  core: TLatexCompileCore,
  { texInputsHash }: { texInputsHash: string },
) {
  const blockHtmlsByDoc = new WeakMap<object, TBlockHtmlByOffset>();

  return {
    name: "astro-latex-compile",
    texInputsHash,
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
