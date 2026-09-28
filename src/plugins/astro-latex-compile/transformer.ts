import { readFileSync, writeSync } from "node:fs";
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
  renderConsole,
  renderHtml,
  writeDebugImage,
  type TexCompileFailure,
} from "./tex-compile-error.js";
import {
  compileLatexToSvg,
  type CompileOutcome,
  computeJpgPath,
  computeTexInputDirsSalt,
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
  /**
   * Tools found missing from PATH. Each is logged once; on build, the
   * integration fails the build at `astro:build:done`.
   */
  missingTools: Set<string>;
  /** When `true` (dev), a missing tool stops the dev server. */
  exitOnMissingToolchain: boolean;
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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Debug tex diagram images are for local inspection only, so failing to write
 * one is logged and never affects the page.
 */
async function writeDebugOutput(
  location: string,
  write: () => Promise<void>,
): Promise<void> {
  try {
    await write();
  } catch (err) {
    console.warn(
      `[astro-latex-compile] ${location}: could not write debug tex diagram image: ${errorMessage(err)}`,
    );
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

  function reportFailure(failure: TexCompileFailure, location: string) {
    if (failure.kind === "toolchain-missing") {
      if (state.missingTools.has(failure.tool)) return;
      state.missingTools.add(failure.tool);
    }
    const report = renderConsole(failure, location);
    // Starlight's content loader swallows errors thrown here, so exit directly.
    // Write synchronously first: a piped stderr is async on macOS/Windows, and
    // process.exit would drop the message.
    if (failure.kind === "toolchain-missing" && state.exitOnMissingToolchain) {
      writeSync(2, `${report}\n`);
      process.exit(1);
    }
    console.error(report);
  }

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
        const location = `${relFilePath}:${lineNumberStr}`;

        // Anything thrown here must stay confined to this block: rejecting
        // would lose every block on the page, and Starlight only logs it.
        let outcome: CompileOutcome;
        try {
          outcome = await compileLatexToSvg(
            node.value,
            svgOutputDir,
            options.texInputDirs ?? [],
            inputsSalt,
          );
        } catch (err) {
          outcome = {
            ok: false,
            failure: { kind: "unexpected", message: errorMessage(err) },
          };
        }

        if (!outcome.ok) {
          reportFailure(outcome.failure, location);
          if (jpgPath) {
            const { failure } = outcome;
            await writeDebugOutput(location, () =>
              writeDebugImage(failure, location, jpgPath),
            );
          }
          return { index, parent, outcome, location, hash: null, jpgPath };
        }

        if (outcome.wasCompiled) {
          console.log(
            `[astro-latex-compile] ${location}: compiled ${outcome.hash}.svg`,
          );
        }
        state.referencedHashes?.add(outcome.hash);
        if (jpgPath) {
          const { svgPath } = outcome;
          await writeDebugOutput(location, async () => {
            await writeJpgFromSvg(svgPath, jpgPath);
            await debugLogger?.write(`${location}: wrote ${jpgPath}`);
          });
        }
        return {
          index,
          parent,
          outcome,
          location,
          hash: outcome.hash,
          jpgPath,
        };
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
      const { index, parent, outcome, location } = results[i];
      const { node } = nodes[i];

      if (!outcome.ok) {
        const errorNode: Html = {
          type: "html",
          value: renderHtml(outcome.failure, location, node.value),
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
        url: `${state.svgUrlPrefix}/${outcome.hash}.svg`,
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
