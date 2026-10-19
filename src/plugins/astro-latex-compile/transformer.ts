import { readFileSync, writeSync } from "node:fs";
import { parseFrontmatter } from "@astrojs/markdown-remark";
import { relative } from "node:path";
import { visit, SKIP } from "unist-util-visit";
import type { Code, Html, Parent, Root } from "mdast";
import type { VFile } from "vfile";
import { MetaOptions } from "@expressive-code/core";
import type { LatexCompileOptions } from "./index.js";
import { RotatingFileLogger } from "../utils/rotating-file-logger.js";
import type { DocRender, TexDiagramLedger } from "./ledger.js";
import {
  escapeXml,
  renderConsole,
  renderHtml,
  summarizeFailure,
  writeDebugImage,
  type TexCompileFailure,
} from "./tex-compile-error.js";
import {
  COMPILE_MODES,
  compileLatexToSvg,
  type CompileMode,
  type CompileOutcome,
  DEFAULT_COMPILE_MODE,
  diagramFileName,
  writeDebugImageFromDiagram,
} from "./utils.js";
import { hashTexInputs, type TexInputDir } from "./tex-inputs.js";

const DEBUG_LOG_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const DEBUG_LOG_BACKUP_COUNT = 3;

/** One tex compile error, as listed when the build fails. */
export interface TexCompileErrorEntry {
  /** `file:line` of the `tex compile` block, or the doc's path alone. */
  location: string;
  /** The first line of the error's summary. */
  summary: string;
}

/**
 * Per-integration state shared by every markdown processor Astro creates, so
 * the ledger survives across processor invocations.
 */
export interface LatexCompileState {
  /**
   * Tools found missing from PATH. Each is logged once; on build, the
   * integration fails the build at `astro:build:done`.
   */
  missingTools: Set<string>;
  /**
   * Every tex compile error other than a missing tool, in the order reported.
   * On build, the integration fails the build at `astro:build:done` with them.
   */
  texCompileErrors: TexCompileErrorEntry[];
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

/**
 * The block's compile mode from its `mode` meta, or the tex compile error for
 * an unknown value or a bare `mode` with no value.
 */
function parseCompileMode(
  metaOptions: MetaOptions,
):
  | { ok: true; compileMode: CompileMode }
  | { ok: false; failure: TexCompileFailure } {
  const modeValue = metaOptions.getString("mode");
  const hasBareModeFlag =
    modeValue === undefined && metaOptions.getBoolean("mode") !== undefined;
  if (modeValue === undefined && !hasBareModeFlag) {
    return { ok: true, compileMode: DEFAULT_COMPILE_MODE };
  }
  if ((COMPILE_MODES as readonly string[]).includes(modeValue ?? "")) {
    return { ok: true, compileMode: modeValue as CompileMode };
  }
  const allowedModes = COMPILE_MODES.map((mode) => `mode=${mode}`).join(", ");
  return {
    ok: false,
    failure: {
      kind: "invalid-block",
      reason: `Unknown compile mode "mode${modeValue === undefined ? "" : `=${modeValue}`}". Use one of: ${allowedModes}.`,
    },
  };
}

/** Adds the block's attributes to the root `<svg>` of a compiled tex diagram. */
function inlineSvgHtml(
  svgMarkup: string,
  attributes: { classNames: string[]; altText: string },
): string {
  const rootAttributes = [
    `class="${escapeXml(attributes.classNames.join(" "))}"`,
    `role="img"`,
    `aria-label="${escapeXml(attributes.altText)}"`,
  ].join(" ");
  return svgMarkup.replace(/^<svg\b/, `<svg ${rootAttributes}`);
}

/** The doc's path relative to the working directory, for messages. */
function displayFilePath(filePath: string): string {
  return filePath !== "unknown" ? relative(process.cwd(), filePath) : filePath;
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

  /** Records a tex compile error for `astro:build:done` to fail the build with. */
  function recordTexCompileError(failure: TexCompileFailure, location: string) {
    state.texCompileErrors.push({
      location,
      summary: summarizeFailure(failure),
    });
  }

  function reportFailure(failure: TexCompileFailure, location: string) {
    if (failure.kind === "toolchain-missing") {
      if (state.missingTools.has(failure.tool)) return;
      state.missingTools.add(failure.tool);
    } else {
      recordTexCompileError(failure, location);
    }
    const report = renderConsole(failure, location);
    // Astro's glob loader swallows errors thrown here, so exit directly.
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

    const relFilePath = displayFilePath(filePath);
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

        const parsedMode = parseCompileMode(new MetaOptions(node.meta ?? ""));
        const compileMode = parsedMode.ok
          ? parsedMode.compileMode
          : DEFAULT_COMPILE_MODE;

        // Anything thrown here must stay confined to this block: rejecting
        // would lose every block on the page, and Starlight only logs it.
        let outcome: CompileOutcome;
        try {
          outcome = parsedMode.ok
            ? await compileLatexToSvg(node.value, ledger.svgDir, {
                texInputDirs: state.texInputDirs,
                texInputsHash,
                compileMode,
              })
            : parsedMode;
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
            await writeDebugImageFromDiagram(
              node.value,
              svgPath,
              debugImagePath,
              { texInputDirs: state.texInputDirs, compileMode },
            );
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

      const svgNode: Html = {
        type: "html",
        value: inlineSvgHtml(outcome.svgMarkup, {
          classNames: ["tex-compiled", ...extraClasses],
          altText,
        }),
      };
      parent.children.splice(index, 1, svgNode);
    }
  }

  return async function transformer(tree: Root, file: VFile) {
    const filePath = file.path || "unknown";
    const render = ledger.beginDoc(filePath);
    try {
      await renderDoc(tree, filePath, render);
    } catch (err) {
      // Astro only logs the rethrown error, so record it to fail the build.
      recordTexCompileError(
        { kind: "unexpected", message: errorMessage(err) },
        displayFilePath(filePath),
      );
      throw err;
    } finally {
      // A render that throws before recording must still end, or the ledger
      // holds back orphan deletion for good. A no-op once recorded.
      await ledger.abandonDoc(render);
    }
  };
}
