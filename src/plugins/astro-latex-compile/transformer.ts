import { readFileSync, writeSync } from "node:fs";
import { parseFrontmatter } from "@astrojs/markdown-remark";
import { relative } from "node:path";
import { visit, SKIP } from "unist-util-visit";
import type { Code, Html, Image, Paragraph, Parent, Root } from "mdast";
import type { VFile } from "vfile";
import { MetaOptions } from "@expressive-code/core";
import type { LatexCompileOptions } from "./index.js";
import { RotatingFileLogger } from "../utils/rotating-file-logger.js";
import type { DocRender, TexDiagramLedger } from "./ledger.js";
import {
  renderConsole,
  renderHtml,
  writeDebugImage,
  type TexCompileFailure,
} from "./tex-compile-error.js";
import {
  compileLatexToSvg,
  type CompileOutcome,
  diagramFileName,
  writeJpgFromSvg,
} from "./utils.js";
import { hashTexInputs, type TexInputDir } from "./tex-inputs.js";

const DEBUG_LOG_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const DEBUG_LOG_BACKUP_COUNT = 3;

/**
 * Per-integration state shared by every markdown processor Astro creates, so
 * the ledger survives across processor invocations.
 */
export interface LatexCompileState {
  /** URL path that `svgOutputDir` is served from, without trailing slash. */
  svgUrlPrefix: string;
  /**
   * Tools found missing from PATH. Each is logged once; on build, the
   * integration fails the build at `astro:build:done`.
   */
  missingTools: Set<string>;
  /** When `true` (dev), a missing tool stops the dev server. */
  exitOnMissingToolchain: boolean;
  /** Owns the output dirs, tracks which doc references which output, and deletes orphans. */
  ledger: TexDiagramLedger;
  /** Absolute path of the debug log file, when debug is on. */
  debugLogFile?: string;
  /** Absolute path of the Astro project root. */
  rootDirPath: string;
  /** `texInputDirs`, resolved against the project root. */
  texInputDirs: TexInputDir[];
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
  const { ledger } = state;
  const debugLogger = state.debugLogFile
    ? new RotatingFileLogger({
        identifier: "astro-latex-compile",
        filePath: state.debugLogFile,
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

  async function renderDoc(tree: Root, filePath: string, render: DocRender) {
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

    if (nodes.length === 0) {
      await ledger.recordDoc(render, { hashes: [], blockIds: [] });
      return;
    }

    const blockIds = nodes.map(({ node }) =>
      new MetaOptions(node.meta ?? "").getInteger("blockid"),
    );
    // Blocks sharing a blockid would write the same debug tex diagram image,
    // so only the last one in the doc writes it.
    const lastIndexByBlockId = new Map<number, number>();
    blockIds.forEach((id, i) => {
      if (id !== undefined) lastIndexByBlockId.set(id, i);
    });

    const relFilePath =
      filePath !== "unknown" ? relative(process.cwd(), filePath) : "unknown";
    const frontmatterOffset =
      filePath !== "unknown" ? getFrontmatterOffset(filePath) : 0;
    // Recomputed per doc: a tex input file added during dev isn't watched, but
    // a doc that re-renders after it was added still hashes it.
    const texInputsHash = hashTexInputs(state.rootDirPath, state.texInputDirs);

    // Compile all blocks in parallel, collecting results before mutating the tree
    const results = await Promise.all(
      nodes.map(async ({ node, index, parent }, i) => {
        const lineNumberStr =
          node.position?.start.line !== undefined
            ? String(node.position.start.line + frontmatterOffset)
            : "?";
        const blockId = blockIds[i];
        const debugImagePath =
          blockId !== undefined && lastIndexByBlockId.get(blockId) === i
            ? ledger.debugImagePath(filePath, blockId)
            : undefined;
        const location = `${relFilePath}:${lineNumberStr}`;

        // Anything thrown here must stay confined to this block: rejecting
        // would lose every block on the page, and Starlight only logs it.
        let outcome: CompileOutcome;
        try {
          outcome = await compileLatexToSvg(
            node.value,
            ledger.svgDir,
            state.texInputDirs,
            texInputsHash,
          );
        } catch (err) {
          outcome = {
            ok: false,
            failure: { kind: "unexpected", message: errorMessage(err) },
          };
        }

        if (!outcome.ok) {
          reportFailure(outcome.failure, location);
          if (debugImagePath) {
            const { failure } = outcome;
            await writeDebugOutput(location, () =>
              writeDebugImage(failure, location, debugImagePath),
            );
          }
          return { index, parent, outcome, location, hash: null };
        }

        if (outcome.wasCompiled) {
          console.log(
            `[astro-latex-compile] ${location}: compiled ${diagramFileName(outcome.hash)}`,
          );
        }
        if (debugImagePath) {
          const { svgPath } = outcome;
          await writeDebugOutput(location, async () => {
            await writeJpgFromSvg(svgPath, debugImagePath);
            await debugLogger?.write(`${location}: wrote ${debugImagePath}`);
          });
        }
        return { index, parent, outcome, location, hash: outcome.hash };
      }),
    );

    await ledger.recordDoc(render, {
      hashes: results.flatMap((r) => r.hash ?? []),
      blockIds: blockIds.flatMap((id) => id ?? []),
    });

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
        url: `${state.svgUrlPrefix}/${diagramFileName(outcome.hash)}`,
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
  }

  return async function transformer(tree: Root, file: VFile) {
    const filePath = file.path || "unknown";
    const render = ledger.beginDoc(filePath);
    try {
      await renderDoc(tree, filePath, render);
    } finally {
      // A render that throws before recording must still end, or the ledger
      // holds back orphan deletion for good. A no-op once recorded.
      await ledger.abandonDoc(render);
    }
  };
}
