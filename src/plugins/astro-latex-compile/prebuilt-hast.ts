import type { Element, ElementContent, Properties } from "hast";
import type { Paragraph } from "mdast";
import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";

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
    // Astro's optimized MDX, on either processor, moves a `<style>` whose
    // children are all text into a `set:html` prop, which its static
    // optimizer then writes out as a literal attribute, leaving the compiled
    // tex diagram without its fonts. An empty comment opts out of that move,
    // and nothing reads it.
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
 * The block's HTML as an mdast node that carries its hast, for MDX docs on
 * either processor. Sätteri re-parses a `raw` string in an MDX doc as MDX,
 * which turns the compiled tex diagram's CSS and text into Markdown
 * paragraphs. And raw HTML can't hold the `<style>`'s empty comment, since
 * HTML parses everything inside a `<style>` as text.
 */
export function prebuiltHastNode(blockHtml: string): Paragraph {
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
