/**
 * Remark plugin that compiles fenced `tex compile` or `latex compile` code blocks to SVG.
 *
 * Usage:
 *   import { remarkLatexCompile } from "...";
 *
 *   // In astro.config.mjs:
 *   markdown: {
 *     remarkPlugins: [
 *       [remarkLatexCompile, { svgOutputDir: "public/static/tex-svgs" }],
 *     ],
 *   }
 */
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { parseFrontmatter } from "@astrojs/markdown-remark";
import { join, relative, resolve } from "node:path";
import { visit, SKIP } from "unist-util-visit";
import type { Code, Html, Image, Paragraph, Parent, Root } from "mdast";
import type { VFile } from "vfile";
import { MetaOptions } from "@expressive-code/core";
import {
  buildErrorHtml,
  compileLatexToSvg,
  computeJpgPath,
  computeTexInputDirsSalt,
  writeJpgError,
  writeJpgFromSvg,
} from "./utils.js";

export interface RemarkLatexCompileOptions {
  /**
   * Directory where SVG files should be written.
   * Must be inside `public/` so Astro serves them as static assets.
   */
  svgOutputDir: string;
  /**
   * Directories added to the TeX input search path via TEXINPUTS, allowing
   * \input{} and \include{} to resolve files from your project. Use a trailing
   * slash for the directory itself, or double trailing slash for recursive
   * search (e.g. "src/latex/" or "src/latex//").
   */
  texInputDirs?: string[];
  /**
   * When set, a JPEG copy of each compiled diagram is written here, mirroring
   * the folder structure of `src/content/docs/`. Only blocks that carry a
   * `blockid=<n>` meta tag produce a JPEG. Filename format:
   * `<originating-file>--<blockid>--<hash>.jpg`.
   * JPEGs are deleted automatically when their block is removed or its content
   * changes. Intended for local inspection, not for publishing.
   */
  tempOutputDir?: string;
  /**
   * @internal Populated by the Astro integration to track which hashes were
   * referenced during a build, used for full orphan cleanup at build:done.
   */
  _referencedHashes?: Set<string>;
  /**
   * @internal Maps each file path to the set of hashes it produced on the
   * previous remark run. Used to delete stale SVGs when a block changes.
   */
  _fileHashMap?: Map<string, Set<string>>;
  /**
   * @internal Maps each file path to the set of JPG paths it produced on the
   * previous remark run. Used to delete stale JPGs when a block changes.
   */
  _fileJpgPathMap?: Map<string, Set<string>>;
}

/**
 * Astro strips frontmatter before passing markdown to remark, so remark's line
 * numbers are relative to the body. This reads the original file to compute how
 * many lines (frontmatter + blank separator) were removed.
 */
function getFrontmatterOffset(absoluteFilePath: string): number {
  try {
    const original = readFileSync(absoluteFilePath, "utf-8");
    const { rawFrontmatter } = parseFrontmatter(original);
    if (!rawFrontmatter) return 0;
    return rawFrontmatter.split("\n").length - 1 + 2;
  } catch {
    return 0;
  }
}

export function remarkLatexCompile(options: RemarkLatexCompileOptions) {
  const svgOutputDir = resolve(options.svgOutputDir);

  return async function transformer(tree: Root, file: VFile) {
    type NodeEntry = { node: Code; index: number; parent: Parent };
    const nodes: NodeEntry[] = [];

    visit(tree, "code", (node, index, parent) => {
      if (
        (node.lang === "tex" || node.lang === "latex") &&
        node.meta?.includes("compile") &&
        parent &&
        index !== undefined
      ) {
        nodes.push({ node, index, parent });
      }
      return SKIP;
    });

    if (nodes.length === 0) return;

    const filePath = file.path || "unknown";
    const relFilePath =
      filePath !== "unknown" ? relative(process.cwd(), filePath) : "unknown";
    const frontmatterOffset =
      filePath !== "unknown" ? getFrontmatterOffset(filePath) : 0;
    const inputsSalt = computeTexInputDirsSalt(options.texInputDirs ?? []);

    // Compile all blocks in parallel, collecting results before mutating the tree
    const results = await Promise.all(
      nodes.map(async ({ node, index, parent }) => {
        const lineNumberStr =
          node.position?.start.line !== undefined
            ? String(node.position.start.line + frontmatterOffset)
            : "?";
        const blockId = new MetaOptions(node.meta ?? "").getInteger("blockid");
        const jpgPath =
          options.tempOutputDir && blockId !== undefined
            ? computeJpgPath(options.tempOutputDir, filePath, blockId)
            : null;
        try {
          const result = await compileLatexToSvg(
            node.value,
            svgOutputDir,
            options.texInputDirs ?? [],
            inputsSalt,
          );
          if (result.wasCompiled) {
            console.log(
              `[remark-latex-compile] ${relFilePath}:${lineNumberStr}: compiled ${result.hash}.svg`,
            );
          }
          options._referencedHashes?.add(result.hash);
          if (jpgPath) {
            await writeJpgFromSvg(result.svgPath, jpgPath);
            console.log(
              `[remark-latex-compile] ${relFilePath}:${lineNumberStr}: wrote ${jpgPath}`,
            );
          }
          return {
            index,
            parent,
            result,
            error: null,
            hash: result.hash,
            jpgPath,
          };
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          const match = errorMsg.match(/\n\n([\s\S]+)/);
          const details = match ? match[1] : errorMsg;
          console.error(
            `[remark-latex-compile] ${relFilePath}:${lineNumberStr}\n${details}`,
          );
          if (jpgPath) {
            await writeJpgError(
              jpgPath,
              `${relFilePath}:${lineNumberStr}`,
              errorMsg,
            );
          }
          return {
            index,
            parent,
            result: null,
            error: err,
            hash: null,
            jpgPath,
          };
        }
      }),
    );

    // Delete SVGs that this file previously produced but no longer references
    if (options._fileHashMap) {
      const newHashes = new Set(
        results.map((r) => r.hash).filter(Boolean) as string[],
      );
      const oldHashes = options._fileHashMap.get(filePath) ?? new Set<string>();
      const staleHashes = [...oldHashes].filter((h) => !newHashes.has(h));
      for (const staleHash of staleHashes) {
        console.warn(
          `[remark-latex-compile] Removing orphaned svg: ${staleHash}.svg`,
        );
      }

      await Promise.all(
        staleHashes.map((h) =>
          rm(join(svgOutputDir, `${h}.svg`), { force: true }),
        ),
      );
      options._fileHashMap.set(filePath, newHashes);
    }

    // Delete JPGs that this file previously produced but no longer references
    if (options.tempOutputDir && options._fileJpgPathMap) {
      const newJpgPaths = new Set(
        results.map((r) => r.jpgPath).filter(Boolean) as string[],
      );
      const oldJpgPaths =
        options._fileJpgPathMap.get(filePath) ?? new Set<string>();
      const staleJpgPaths = [...oldJpgPaths].filter((p) => !newJpgPaths.has(p));
      for (const stalePath of staleJpgPaths) {
        console.warn(
          `[remark-latex-compile] Removing orphaned jpg: ${stalePath}`,
        );
      }
      await Promise.all(staleJpgPaths.map((p) => rm(p, { force: true })));
      options._fileJpgPathMap.set(filePath, newJpgPaths);
    }

    // Apply AST mutations in reverse index order so earlier splices don't shift
    // the indices of later nodes sharing the same parent.
    for (let i = results.length - 1; i >= 0; i--) {
      const { index, parent, result, error } = results[i];
      const { node } = nodes[i];

      if (!result) {
        const lineNumberStr =
          node.position?.start.line !== undefined
            ? String(node.position.start.line + frontmatterOffset)
            : "?";
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorNode: Html = {
          type: "html",
          value: buildErrorHtml(
            `${relFilePath}:${lineNumberStr}`,
            errorMsg,
            node.value,
          ),
        };
        parent.children.splice(index, 1, errorNode);
        continue;
      }

      const metaOptions = new MetaOptions(node.meta ?? "");
      const customClasses =
        metaOptions.getString("class")?.split(/\s+/).filter(Boolean) ?? [];
      const altText = metaOptions.getString("alt") ?? "LaTeX diagram";

      const imageNode: Image = {
        type: "image",
        url: `/static/tex-svgs/${result.hash}.svg`,
        alt: altText,
        data: {
          hProperties: { className: ["tex-compiled", ...customClasses] },
        },
      };

      const paragraph: Paragraph = {
        type: "paragraph",
        children: [imageNode],
      };

      parent.children.splice(index, 1, paragraph);
    }
  };
}

export { compileLatexToSvg };
