import { readFileSync, writeSync } from "node:fs";
import { parseFrontmatter } from "@astrojs/markdown-remark";
import { relative } from "node:path";
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
 * Astro strips frontmatter before passing markdown to the processor, so a
 * block's line number is relative to the body. This reads the original file
 * to count how many lines the frontmatter took.
 */
function getFrontmatterOffset(absoluteFilePath: string): number {
  try {
    const original = readFileSync(absoluteFilePath, "utf-8");
    // Astro removes `---<rawFrontmatter>---`, and the delimiters hold no
    // newlines, so the body starts that many lines down.
    const { rawFrontmatter } = parseFrontmatter(original);
    return rawFrontmatter.split("\n").length - 1;
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

/** One `tex compile` block, as an adapter found it in a doc. */
export interface TexCompileBlock {
  /** The block's LaTeX source. */
  value: string;
  /** The code fence's meta string, after the language. */
  meta: string | null | undefined;
  /** The fence's 1-based line in the doc body (frontmatter stripped), if known. */
  bodyLine: number | undefined;
}

/** Whether a code block with this language and meta is a `tex compile` block. */
export function isTexCompileBlock(
  lang: string | null | undefined,
  meta: string | null | undefined,
): boolean {
  return (lang === "tex" || lang === "latex") && !!meta?.includes("compile");
}

/**
 * LaTeX compile's logic, with no knowledge of any Markdown processor. An
 * adapter finds a doc's `tex compile` blocks and replaces each one with the
 * HTML `renderDoc` returns for it.
 */
export function createLatexCompileCore(
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

  /** The block's compiled tex diagram, inlined with its `class` and `alt`. */
  function compiledDiagramHtml(block: TexCompileBlock, svgMarkup: string) {
    const metaOptions = new MetaOptions(block.meta ?? "");
    const blockClass = metaOptions.getString("class");
    const extraClasses = (
      blockClass !== undefined ? blockClass : (options.svgClassname ?? "")
    )
      .split(/\s+/)
      .filter(Boolean);
    const altText = metaOptions.getString("alt") ?? "LaTeX diagram";
    return inlineSvgHtml(svgMarkup, {
      classNames: ["tex-compiled", ...extraClasses],
      altText,
    });
  }

  async function compileBlocks(
    filePath: string,
    blocks: TexCompileBlock[],
    render: DocRender,
  ): Promise<string[]> {
    if (blocks.length === 0) {
      await ledger.recordDoc(render, { hashes: [], blockIds: [] });
      return [];
    }

    const blockIds = blocks.map((block) =>
      new MetaOptions(block.meta ?? "").getInteger("blockid"),
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

    const results = await Promise.all(
      blocks.map(async (block, i) => {
        const lineNumberStr =
          block.bodyLine !== undefined
            ? String(block.bodyLine + frontmatterOffset)
            : "?";
        const blockId = blockIds[i];
        const debugImagePath =
          blockId !== undefined && lastIndexByBlockId.get(blockId) === i
            ? ledger.debugImagePath(filePath, blockId)
            : undefined;
        const location = `${relFilePath}:${lineNumberStr}`;

        const parsedMode = parseCompileMode(new MetaOptions(block.meta ?? ""));
        const compileMode = parsedMode.ok
          ? parsedMode.compileMode
          : DEFAULT_COMPILE_MODE;

        // Anything thrown here must stay confined to this block: rejecting
        // would lose every block on the page, and Starlight only logs it.
        let outcome: CompileOutcome;
        try {
          outcome = parsedMode.ok
            ? await compileLatexToSvg(block.value, ledger.svgDir, {
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
          return { outcome, location, hash: null };
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
              block.value,
              svgPath,
              debugImagePath,
              { texInputDirs: state.texInputDirs, compileMode },
            );
            await debugLogger?.write(`${location}: wrote ${debugImagePath}`);
          });
        }
        return { outcome, location, hash: outcome.hash };
      }),
    );

    await ledger.recordDoc(render, {
      hashes: results.flatMap((result) => result.hash ?? []),
      blockIds: blockIds.flatMap((id) => id ?? []),
    });

    return results.map(({ outcome, location }, i) =>
      outcome.ok
        ? compiledDiagramHtml(blocks[i], outcome.svgMarkup)
        : renderHtml(outcome.failure, location, blocks[i].value),
    );
  }

  return {
    /**
     * Compiles a doc's `tex compile` blocks in parallel and records the doc in
     * the ledger. Returns one HTML string per block, in order: the inlined
     * compiled tex diagram, or the tex compile error shown in its place.
     */
    async renderDoc(
      filePath: string | undefined,
      blocks: TexCompileBlock[],
    ): Promise<string[]> {
      const docFilePath = filePath || "unknown";
      const render = ledger.beginDoc(docFilePath);
      try {
        return await compileBlocks(docFilePath, blocks, render);
      } catch (err) {
        // Astro only logs the rethrown error, so record it to fail the build.
        recordTexCompileError(
          { kind: "unexpected", message: errorMessage(err) },
          displayFilePath(docFilePath),
        );
        throw err;
      } finally {
        // A render that throws before recording must still end, or the ledger
        // holds back orphan deletion for good. A no-op once recorded.
        await ledger.abandonDoc(render);
      }
    },
  };
}

export type LatexCompileCore = ReturnType<typeof createLatexCompileCore>;
