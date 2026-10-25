import { regex as githubSlugRemovedCharsRegex } from "github-slugger/regex.js";
import type { Heading, Nodes, Root } from "mdast";
// Types `data.hProperties`, which mdast-util-to-hast turns into the heading's attributes
import type {} from "mdast-util-to-hast";
import { visit } from "unist-util-visit";

/**
 * The text VS Code's markdown language service slugs for a heading: text, inline code and
 * image alt, from any depth. Math, inline HTML and MDX expressions aren't text to VS Code
 * (with its default `markdown.math.enabled`), so they're dropped.
 */
function getHeadingText(heading: Heading): string {
  return heading.children.map(getNodeText).join("").trim();
}

function getNodeText(node: Nodes): string {
  switch (node.type) {
    case "text":
    case "inlineCode":
      return node.value;
    case "image":
    case "imageReference":
      return node.alt ?? "";
    default:
      return "children" in node ? node.children.map(getNodeText).join("") : "";
  }
}

/**
 * VS Code's `githubSlugifier.createBuilder()`: github-slugger's character rules, but it trims
 * first, turns any whitespace into `-`, and numbers a duplicate without checking the
 * numbered id against later headings (`Dup`, `Dup`, `Dup-1` gives `dup-1` twice).
 */
export function createVscodeHeadingIdBuilder() {
  const duplicateCounts = new Map<string, number>();
  return {
    add(headingText: string): string {
      const headingId = slugifyHeadingText(headingText);
      const duplicateCount = duplicateCounts.get(headingId);
      if (duplicateCount === undefined) {
        duplicateCounts.set(headingId, 0);
        return headingId;
      }
      duplicateCounts.set(headingId, duplicateCount + 1);
      return slugifyHeadingText(`${headingId}-${duplicateCount + 1}`);
    },
  };
}

function slugifyHeadingText(headingText: string): string {
  return headingText
    .trim()
    .toLowerCase()
    .replace(githubSlugRemovedCharsRegex, "")
    .replace(/\s/g, "-");
}

/**
 * Returns the heading's VS Code heading ID, or `undefined` if it already has an id. The
 * heading's text is still added to the builder then, so later duplicates are numbered as in
 * VS Code.
 */
function assignableHeadingId(
  heading: Heading,
  headingIdBuilder: ReturnType<typeof createVscodeHeadingIdBuilder>,
): string | undefined {
  const headingId = headingIdBuilder.add(getHeadingText(heading));
  return typeof heading.data?.hProperties?.id === "string"
    ? undefined
    : headingId;
}

/** The plugin for the `unified` processor. */
export function remarkVscodeHeadingIds() {
  return (tree: Root) => {
    const headingIdBuilder = createVscodeHeadingIdBuilder();
    visit(tree, "heading", (heading) => {
      const headingId = assignableHeadingId(heading, headingIdBuilder);
      if (headingId === undefined) return;
      heading.data = {
        ...heading.data,
        hProperties: { ...heading.data?.hProperties, id: headingId },
      };
    });
  };
}

/** What the plugin uses of a Sätteri mdast visitor's context. */
type TSatteriMdastVisitorContext = {
  setProperty(
    node: Readonly<Heading>,
    key: "data",
    value: Record<string, unknown>,
  ): void;
};

/**
 * The plugin for the `satteri` processor: a factory, called once per document, returning an
 * mdast visitor. Sätteri's nodes are read-only, so the id is set through `setProperty`.
 */
export function satteriVscodeHeadingIds() {
  const headingIdBuilder = createVscodeHeadingIdBuilder();
  return {
    name: "astro-vscode-heading-ids",
    heading(heading: Readonly<Heading>, context: TSatteriMdastVisitorContext) {
      const headingId = assignableHeadingId(heading, headingIdBuilder);
      if (headingId === undefined) return;
      context.setProperty(heading, "data", {
        ...heading.data,
        hProperties: { ...heading.data?.hProperties, id: headingId },
      });
    },
  };
}
