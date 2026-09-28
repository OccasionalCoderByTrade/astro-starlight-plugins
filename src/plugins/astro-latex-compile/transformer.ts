import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { parseFrontmatter } from "@astrojs/markdown-remark";
import { join, relative } from "node:path";
import { visit, SKIP } from "unist-util-visit";
import type { Code, Html, Image, Paragraph, Parent, Root } from "mdast";
import type { VFile } from "vfile";
import { MetaOptions } from "@expressive-code/core";
import type { LatexCompileOptions } from "./index.js";
import { RotatingFileLogger } from "../utils/rotating-file-logger.js";
import {
  buildErrorHtml,
  compileLatexToSvg,
  computeJpgPath,
  computeTexInputDirsSalt,
  writeJpgError,
  writeJpgFromSvg,
} from "./utils.js";

const DEBUG_LOG_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const DEBUG_LOG_BACKUP_COUNT = 3;

/**
 * Per-integration state shared by every markdown processor Astro creates, so
 * orphan tracking survives across processor invocations.
 */
export interface LatexCompileState {
  /** Absolute path of `svgOutputDir`, resolved against the project root. */
  svgOutputDir: string;
  /** URL path that `svgOutputDir` is served from, without trailing slash. */
  svgUrlPrefix: string;
  /** Hashes referenced during a build, used for orphan cleanup at build:done. */
  referencedHashes?: Set<string>;
  /** Hashes each file produced on its previous run, used to delete orphaned tex diagrams. */
  fileHashMap?: Map<string, Set<string>>;
  /**
   * Debug tex diagram images each file produced on its previous run, used to
   * delete ones whose block was removed or changed.
   */
  fileJpgPathMap?: Map<string, Set<string>>;
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

export function latexCompileTransformer(
  options: LatexCompileOptions,
  state: LatexCompileState,
) {
  const svgOutputDir = state.svgOutputDir;
  const debugLogger = options.debug
    ? new RotatingFileLogger({
        identifier: "astro-latex-compile",
        filePath: options.debug.logFile,
        maxSizeBytes: DEBUG_LOG_MAX_SIZE_BYTES,
        backupCount: DEBUG_LOG_BACKUP_COUNT,
      })
    : null;

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
          options.debug && blockId !== undefined
            ? computeJpgPath(options.debug.outputDir, filePath, blockId)
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
              `[astro-latex-compile] ${relFilePath}:${lineNumberStr}: compiled ${result.hash}.svg`,
            );
          }
          state.referencedHashes?.add(result.hash);
          if (jpgPath) {
            await writeJpgFromSvg(result.svgPath, jpgPath);
            await debugLogger?.write(
              `${relFilePath}:${lineNumberStr}: wrote ${jpgPath}`,
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
            `[astro-latex-compile] ${relFilePath}:${lineNumberStr}\n${details}`,
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
    if (state.fileHashMap) {
      const newHashes = new Set(
        results.map((r) => r.hash).filter(Boolean) as string[],
      );
      const oldHashes = state.fileHashMap.get(filePath) ?? new Set<string>();
      const staleHashes = [...oldHashes].filter((h) => !newHashes.has(h));
      for (const staleHash of staleHashes) {
        console.warn(
          `[astro-latex-compile] Removing orphaned svg: ${staleHash}.svg`,
        );
      }

      await Promise.all(
        staleHashes.map((h) =>
          rm(join(svgOutputDir, `${h}.svg`), { force: true }),
        ),
      );
      state.fileHashMap.set(filePath, newHashes);
    }

    // Delete JPGs that this file previously produced but no longer references
    if (state.fileJpgPathMap) {
      const newJpgPaths = new Set(
        results.map((r) => r.jpgPath).filter(Boolean) as string[],
      );
      const oldJpgPaths =
        state.fileJpgPathMap.get(filePath) ?? new Set<string>();
      const staleJpgPaths = [...oldJpgPaths].filter((p) => !newJpgPaths.has(p));
      for (const stalePath of staleJpgPaths) {
        console.warn(
          `[astro-latex-compile] Removing orphaned jpg: ${stalePath}`,
        );
      }
      await Promise.all(staleJpgPaths.map((p) => rm(p, { force: true })));
      state.fileJpgPathMap.set(filePath, newJpgPaths);
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
      const blockClass = metaOptions.getString("class");
      const extraClasses = (
        blockClass !== undefined ? blockClass : (options.svgClassname ?? "")
      )
        .split(/\s+/)
        .filter(Boolean);
      const altText = metaOptions.getString("alt") ?? "LaTeX diagram";

      const imageNode: Image = {
        type: "image",
        url: `${state.svgUrlPrefix}/${result.hash}.svg`,
        alt: altText,
        data: {
          hProperties: { className: ["tex-compiled", ...extraClasses] },
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
