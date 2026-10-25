import type { Code, Html, Parent, Root } from "mdast";
import { SKIP, visit } from "unist-util-visit";
import type { VFile } from "vfile";
import {
  isTexCompileBlock,
  texCompileBlockFromCodeNode,
  type TLatexCompileCore,
} from "./core.js";

/**
 * The remark attacher for the `unified` processor: finds each `tex compile`
 * block and splices in the HTML the core rendered for it.
 */
export function createRemarkLatexCompile(core: TLatexCompileCore) {
  return function remarkLatexCompile() {
    return async function transformer(tree: Root, file: VFile) {
      const blockEntries: { node: Code; index: number; parent: Parent }[] = [];
      visit(tree, "code", (node, index, parent) => {
        if (
          isTexCompileBlock(node.lang, node.meta) &&
          parent &&
          index !== undefined
        ) {
          blockEntries.push({ node, index, parent });
        }
        return SKIP;
      });

      const blockHtmls = await core.renderDoc(
        file.path,
        blockEntries.map(({ node }) => texCompileBlockFromCodeNode(node)),
      );

      // Splice in reverse order so earlier splices don't shift the indices of
      // later blocks sharing the same parent.
      for (let i = blockEntries.length - 1; i >= 0; i--) {
        const { index, parent } = blockEntries[i];
        const htmlNode: Html = { type: "html", value: blockHtmls[i] };
        parent.children.splice(index, 1, htmlNode);
      }
    };
  };
}
