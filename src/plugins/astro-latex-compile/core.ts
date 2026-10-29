import { readFileSync, writeSync } from "node:fs";
import { parseFrontmatter } from "@astrojs/markdown-remark";
import type { Code } from "mdast";
import type { LatexCompileOptions } from "./index.js";
import { toDisplayPath } from "../utils/display-path.js";
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
import { sizeSvgInEm } from "./svg-size.js";
import {
  compileLatexToSvg,
  type CompileOutcome,
  diagramFileName,
  writeDebugImageFromDiagram,
} from "./utils.js";
import { hashTexInputs, type TexInputDir } from "./tex-inputs.js";
import {
  resolveMetaOptions,
  type TTexCompileMetaOptions,
} from "./meta-options.js";
import { ZOOM_LABELS } from "./zoom-labels.js";

const DEBUG_LOG_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const DEBUG_LOG_BACKUP_COUNT = 3;
/** Stands in for the doc's path when the processor wasn't given one. */
const UNKNOWN_DOC_FILE_PATH = "unknown";
/** A magnifying glass with a plus, drawn in the button's text color. */
const ZOOM_BUTTON_ICON =
  '<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6"/></svg>';

/** One tex compile error, as listed when the build fails. */
export interface TTexCompileErrorEntry {
  /** `file:line` of the `tex compile` block, or the doc's path alone. */
  location: string;
  /** The first line of the error's summary. */
  summary: string;
}

/**
 * Per-integration state shared by every markdown processor Astro creates, so
 * the ledger survives across processor invocations.
 */
export interface TLatexCompileState {
  /**
   * Tools found missing from PATH. Each is logged once; on build, the
   * integration fails the build at `astro:build:done`.
   */
  missingTools: Set<string>;
  /**
   * Every tex compile error other than a missing tool, in the order reported.
   * On build, the integration fails the build at `astro:build:done` with them.
   */
  texCompileErrors: TTexCompileErrorEntry[];
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
 * Adds the block's attributes to the root `<svg>` of a compiled tex diagram,
 * sized in em.
 */
function inlineSvgHtml(
  svgMarkup: string,
  attributes: { classNames: string[]; altText: string },
): string {
  const rootAttributes = [
    `class="${escapeXml(attributes.classNames.join(" "))}"`,
    `role="img"`,
    `aria-label="${escapeXml(attributes.altText)}"`,
  ].join(" ");
  return sizeSvgInEm(svgMarkup).replace(/^<svg\b/, `<svg ${rootAttributes}`);
}

/**
 * Wraps an inlined compiled tex diagram with the button that opens its tex
 * diagram zoom view, which shows `caption` under the diagram. See
 * docs/adr/0019-tex-diagram-zoom-view-clones-the-inline-svg.md.
 */
function zoomFrameHtml(
  diagramHtml: string,
  { caption }: { caption: string | undefined },
): string {
  const captionAttribute =
    caption !== undefined ? ` data-caption="${escapeXml(caption)}"` : "";
  return [
    `<div class="tex-zoom-frame"${captionAttribute}>`,
    diagramHtml.trimEnd(),
    `<button type="button" class="tex-zoom-button" aria-label="${ZOOM_LABELS.openButton}">${ZOOM_BUTTON_ICON}</button>`,
    `</div>`,
  ].join("");
}

/** The doc's path as messages print it. */
function docDisplayPath(rootDirPath: string, filePath: string): string {
  return filePath !== UNKNOWN_DOC_FILE_PATH
    ? toDisplayPath(rootDirPath, filePath)
    : filePath;
}

/** `failure`, with the tex input files its errors name as messages print them. */
function withDisplayPaths(
  rootDirPath: string,
  failure: TexCompileFailure,
): TexCompileFailure {
  if (failure.kind !== "latex") return failure;
  return {
    ...failure,
    errors: failure.errors.map((err) =>
      err.filePath !== undefined
        ? { ...err, filePath: toDisplayPath(rootDirPath, err.filePath) }
        : err,
    ),
  };
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
export interface TTexCompileBlock {
  /** The block's LaTeX source. */
  value: string;
  /** The code fence's meta string, after the language. */
  meta: string | null | undefined;
  /** The fence's 1-based line in the doc body (frontmatter stripped), if known. */
  bodyLine: number | undefined;
}

/** A `tex compile` block's code node, as the core takes it. */
export function texCompileBlockFromCodeNode(
  node: Readonly<Code>,
): TTexCompileBlock {
  return {
    value: node.value,
    meta: node.meta,
    bodyLine: node.position?.start.line,
  };
}

/**
 * LaTeX compile's logic, with no knowledge of any Markdown processor. An
 * adapter finds a doc's `tex compile` blocks and replaces each one with the
 * HTML `renderDoc` returns for it.
 */
export function createLatexCompileCore(
  options: LatexCompileOptions,
  state: TLatexCompileState,
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
  function compiledDiagramHtml(
    metaOptions: TTexCompileMetaOptions,
    svgMarkup: string,
  ) {
    const diagramHtml = inlineSvgHtml(svgMarkup, {
      classNames: ["tex-compiled", ...metaOptions.classNames],
      altText: metaOptions.altText,
    });
    return metaOptions.isZoomable
      ? zoomFrameHtml(diagramHtml, { caption: metaOptions.caption })
      : diagramHtml;
  }

  async function compileBlocks(
    filePath: string,
    blocks: TTexCompileBlock[],
    render: DocRender,
  ): Promise<string[]> {
    if (blocks.length === 0) {
      await ledger.recordDoc(render, { hashes: [], blockIds: [] });
      return [];
    }

    const resolvedMetaOptions = blocks.map((block) =>
      resolveMetaOptions(block.meta, options),
    );
    const blockIds = resolvedMetaOptions.map((resolved) => resolved.blockId);
    // Blocks sharing a blockid would write the same debug tex diagram image,
    // so only the last one in the doc writes it.
    const lastIndexByBlockId = new Map<number, number>();
    blockIds.forEach((id, i) => {
      if (id !== undefined) lastIndexByBlockId.set(id, i);
    });

    const displayedFilePath = docDisplayPath(state.rootDirPath, filePath);
    const frontmatterOffset =
      filePath !== UNKNOWN_DOC_FILE_PATH ? getFrontmatterOffset(filePath) : 0;
    // Recomputed per doc: a tex input file added during dev isn't watched, but
    // a doc that re-renders after it was added still hashes it.
    const texInputsHash = hashTexInputs(state.rootDirPath, state.texInputDirs);

    const results = await Promise.all(
      blocks.map(async (block, i) => {
        const displayedLineNumber =
          block.bodyLine !== undefined
            ? String(block.bodyLine + frontmatterOffset)
            : "?";
        const blockId = blockIds[i];
        const debugImagePath =
          blockId !== undefined && lastIndexByBlockId.get(blockId) === i
            ? ledger.debugImagePath(filePath, blockId)
            : undefined;
        const location = `${displayedFilePath}:${displayedLineNumber}`;

        async function failBlock(failure: TexCompileFailure) {
          reportFailure(failure, location);
          if (debugImagePath) {
            await writeDebugOutput(location, () =>
              writeDebugImage(failure, location, debugImagePath),
            );
          }
          return {
            html: renderHtml(failure, location, block.value),
            hash: null,
          };
        }

        const resolved = resolvedMetaOptions[i];
        if (!resolved.ok) return failBlock(resolved.failure);
        const { metaOptions } = resolved;

        // Anything thrown here must stay confined to this block: rejecting
        // would lose every block on the page, and Starlight only logs it.
        let outcome: CompileOutcome;
        try {
          outcome = await compileLatexToSvg(block.value, ledger.svgDir, {
            texInputDirs: state.texInputDirs,
            texInputsHash,
            compileMode: metaOptions.compileMode,
          });
          if (!outcome.ok) {
            outcome = {
              ...outcome,
              failure: withDisplayPaths(state.rootDirPath, outcome.failure),
            };
          }
        } catch (err) {
          outcome = {
            ok: false,
            failure: { kind: "unexpected", message: errorMessage(err) },
          };
        }
        if (!outcome.ok) return failBlock(outcome.failure);

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
              {
                texInputDirs: state.texInputDirs,
                compileMode: metaOptions.compileMode,
              },
            );
            await debugLogger?.write(
              `${location}: wrote ${toDisplayPath(state.rootDirPath, debugImagePath)}`,
            );
          });
        }
        return {
          html: compiledDiagramHtml(metaOptions, outcome.svgMarkup),
          hash: outcome.hash,
        };
      }),
    );

    await ledger.recordDoc(render, {
      hashes: results.flatMap((result) => result.hash ?? []),
      blockIds: blockIds.flatMap((id) => id ?? []),
    });

    return results.map((result) => result.html);
  }

  return {
    /**
     * Compiles a doc's `tex compile` blocks in parallel and records the doc in
     * the ledger. Returns one HTML string per block, in order: the inlined
     * compiled tex diagram, or the tex compile error shown in its place.
     */
    async renderDoc(
      filePath: string | undefined,
      blocks: TTexCompileBlock[],
    ): Promise<string[]> {
      const docFilePath = filePath || UNKNOWN_DOC_FILE_PATH;
      const render = ledger.beginDoc(docFilePath);
      try {
        return await compileBlocks(docFilePath, blocks, render);
      } catch (err) {
        // Astro only logs the rethrown error, so record it to fail the build.
        recordTexCompileError(
          { kind: "unexpected", message: errorMessage(err) },
          docDisplayPath(state.rootDirPath, docFilePath),
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

export type TLatexCompileCore = ReturnType<typeof createLatexCompileCore>;
