/**
 * LaTeX compilation utilities for converting LaTeX code to SVG.
 *
 * External dependencies required on PATH:
 *   - pdflatex  (e.g. texlive-latex-base on Debian, MacTeX on macOS)
 *   - dvisvgm   (e.g. texlive-extra-utils on Debian, included in MacTeX)
 *
 * Code blocks must be a LaTeX document, containing both \documentclass and
 * \begin{document}.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  mkdtempSync,
} from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { parseLatexErrors } from "./error-parser.js";
import { scopeSvg } from "./svg-scope.js";
import type { TexCompileFailure } from "./tex-compile-error.js";
import { texInputsSearchPath, type TexInputDir } from "./tex-inputs.js";
import { execProcess } from "../utils/process-utils.js";

const CONTENT_ROOT = "src/content/docs/";

/**
 * How a `tex compile` block becomes a compiled tex diagram. See
 * docs/adr/0005-dvi-is-the-default-compile-mode.md.
 */
export const COMPILE_MODES = ["dvi", "pdf"] as const;
export type CompileMode = (typeof COMPILE_MODES)[number];
export const DEFAULT_COMPILE_MODE: CompileMode = "dvi";

/**
 * Folded into every compiled tex diagram's hash. Bump it when the SVGs the
 * pipeline writes change shape, so ones cached by an older version recompile.
 */
const SVG_PIPELINE_VERSION = "scoped-inline-svg-1";

/**
 * Everything besides the block's own source that its compiled tex diagram
 * depends on, folded into its hash.
 */
function diagramHashSalt(compileMode: CompileMode, texInputsHash: string) {
  return [SVG_PIPELINE_VERSION, compileMode, texInputsHash].join("\n");
}

/** Prefix `scopeSvg` gives every id, class and font of a compiled tex diagram. */
function diagramScopePrefix(hash: string): string {
  return `tex-${hash}-`;
}

export type CompileOutcome =
  | {
      ok: true;
      hash: string;
      svgPath: string;
      /** The compiled tex diagram's SVG, scoped and ready to inline. */
      svgMarkup: string;
      wasCompiled: boolean;
    }
  | { ok: false; failure: TexCompileFailure };

/** File name of the compiled tex diagram with this content hash. */
export function diagramFileName(hash: string): string {
  return `${hash}.svg`;
}

/** Content hash of a compiled tex diagram's file name, or `undefined` for any other file. */
export function diagramHashOf(fileName: string): string | undefined {
  return fileName.endsWith(".svg")
    ? fileName.slice(0, -".svg".length)
    : undefined;
}

export function computeDebugImagePath(
  outputDir: string,
  filePath: string,
  blockId: number,
): string {
  const normalized = filePath.replace(/\\/g, "/");
  const contentRootIndex = normalized.indexOf(CONTENT_ROOT);
  const relativePath =
    contentRootIndex !== -1
      ? normalized.slice(contentRootIndex + CONTENT_ROOT.length)
      : basename(normalized);

  const dir = dirname(relativePath);
  const filename = basename(relativePath, extname(relativePath));
  const dirChecksum = createHash("md5").update(dir).digest("hex").slice(0, 8);
  const jpgFilename = `${filename}--${blockId}-${dirChecksum}.jpg`;

  return join(resolve(outputDir), jpgFilename);
}

export async function writeJpgFromSvg(
  svgPath: string,
  jpgPath: string,
): Promise<void> {
  mkdirSync(dirname(jpgPath), { recursive: true });
  await sharp(svgPath, { density: 300 })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 90 })
    .toFile(jpgPath);
}

export function hashLatexCode(code: string, salt = ""): string {
  const normalized = code
    .split("\n")
    .map((line) => line.trim())
    // Remove LaTeX comment lines (% starts a comment; %=== separator also stripped)
    .filter((line) => !line.startsWith("%"))
    // Remove empty lines
    .filter(Boolean)
    .join("\n")
    .trim();
  // MD5 truncated to 16 chars (8 bytes, 64 bits) is fast and provides
  // ~2^32 collision resistance (4 billion diagrams) which is more than sufficient
  // for build caching of non-adversarial content.
  const hash = createHash("md5").update(normalized);
  if (salt) hash.update(salt);
  return hash.digest("hex").slice(0, 16);
}

function isLatexDocument(latexCode: string): boolean {
  return (
    latexCode.includes("\\documentclass") &&
    latexCode.includes("\\begin{document}")
  );
}

/**
 * Runs `command`, or returns `null` when its executable is not on PATH.
 */
async function execTool(
  command: "pdflatex" | "dvisvgm",
  args: string[],
  options?: { env?: NodeJS.ProcessEnv; cwd?: string },
): Promise<{ status: number; stdout: string; stderr: string } | null> {
  try {
    return await execProcess(command, args, options);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

type LatexRun =
  | { ok: true; outputFilePath: string }
  | { ok: false; failure: TexCompileFailure };

/**
 * Runs pdflatex on `latexSource` in `workDir`, producing a DVI in dvi compile
 * mode and a PDF in pdf compile mode.
 *
 * pdflatex runs in paranoid mode, so the block can only read tex input files
 * by name from `texInputDirs` (plus TeX's own installed packages). See
 * docs/adr/0004-tex-input-dirs-are-a-blocks-only-dependencies.md.
 */
async function runLatex(
  latexSource: string,
  workDir: string,
  texInputDirs: TexInputDir[],
  compileMode: CompileMode,
): Promise<LatexRun> {
  const texFilePath = join(workDir, "diagram.tex");
  writeFileSync(texFilePath, latexSource, "utf-8");

  const pdflatexEnv: NodeJS.ProcessEnv = {
    ...process.env,
    // Keeps long file paths in errors from being wrapped mid-line.
    max_print_line: "10000",
    // Paranoid mode refuses absolute paths, `..` and dotfiles, so the block
    // can only reach files by name through TEXINPUTS. TEXMFOUTPUT lets it
    // still read its own files in workDir.
    openin_any: "p",
    TEXMFOUTPUT: workDir,
  };
  if (texInputDirs.length > 0) {
    pdflatexEnv.TEXINPUTS = texInputsSearchPath(
      texInputDirs,
      process.env.TEXINPUTS,
    );
  }

  const pdflatexResult = await execTool(
    "pdflatex",
    [
      "-interaction=nonstopmode",
      "-file-line-error",
      `-output-format=${compileMode}`,
      "-output-directory",
      workDir,
      texFilePath,
    ],
    { env: pdflatexEnv, cwd: workDir },
  );
  if (!pdflatexResult) {
    return {
      ok: false,
      failure: { kind: "toolchain-missing", tool: "pdflatex" },
    };
  }
  if (pdflatexResult.status !== 0) {
    return {
      ok: false,
      failure: {
        kind: "latex",
        errors: parseLatexErrors(
          // Errors go to stdout; stderr carries kpathsea notices such as
          // "Not reading from /dev/null (openin_any = p)".
          `${pdflatexResult.stdout}\n${pdflatexResult.stderr}`,
          { blockFilePath: texFilePath },
        ),
        source: latexSource,
      },
    };
  }
  return { ok: true, outputFilePath: join(workDir, `diagram.${compileMode}`) };
}

/**
 * Converts pdflatex's output to an SVG. From a DVI, text stays `<text>` with
 * its fonts embedded, unless `glyphsAsPaths` is set. From a PDF, dvisvgm can
 * only draw glyphs as paths, so `glyphsAsPaths` makes no difference.
 */
async function runDvisvgm(
  inputFilePath: string,
  svgPath: string,
  options: { compileMode: CompileMode; glyphsAsPaths?: boolean },
): Promise<TexCompileFailure | null> {
  // A DVI's own page box is the whole paper; `papersize` reads the size that
  // classes like standalone set, matching the PDF's page.
  const modeArgs =
    options.compileMode === "pdf"
      ? ["--pdf", "--bbox=dvi"]
      : [
          options.glyphsAsPaths ? "--no-fonts" : "--font-format=woff2",
          "--bbox=papersize",
        ];
  const svgResult = await execTool("dvisvgm", [
    ...modeArgs,
    inputFilePath,
    "-o",
    svgPath,
  ]);
  if (!svgResult) return { kind: "toolchain-missing", tool: "dvisvgm" };
  if (svgResult.status !== 0) {
    return {
      kind: "conversion",
      output: svgResult.stderr || svgResult.stdout || "",
    };
  }
  return null;
}

/** Runs `work` in a fresh temp dir, removing it afterwards. */
async function inTempDir<T>(work: (workDir: string) => Promise<T>): Promise<T> {
  const workDir = mkdtempSync(join(tmpdir(), "latex-compile-"));
  try {
    return await work(workDir);
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors, temp files will be GC'd by the OS
    }
  }
}

/**
 * Compiles `latexCode` in `workDir` through pdflatex and dvisvgm, returning
 * the unscoped SVG file's path.
 */
async function compileToSvgFile(
  latexCode: string,
  workDir: string,
  options: {
    texInputDirs: TexInputDir[];
    compileMode: CompileMode;
    glyphsAsPaths?: boolean;
  },
): Promise<
  { ok: true; svgFilePath: string } | { ok: false; failure: TexCompileFailure }
> {
  const latexRun = await runLatex(
    latexCode.trim(),
    workDir,
    options.texInputDirs,
    options.compileMode,
  );
  if (!latexRun.ok) return latexRun;

  const svgFilePath = join(workDir, "diagram.svg");
  const conversionFailure = await runDvisvgm(
    latexRun.outputFilePath,
    svgFilePath,
    options,
  );
  if (conversionFailure) return { ok: false, failure: conversionFailure };
  return { ok: true, svgFilePath };
}

/**
 * Compile a `tex compile` block's LaTeX to a compiled tex diagram, reusing
 * the SVG when one with the same hash already exists. The written SVG is
 * scoped with `scopeSvg`, ready to inline into a page.
 *
 * @param latexCode - The LaTeX document to compile (e.g., TikZ, pgfplots, etc.)
 * @param svgOutputDir - The directory where SVG files should be written
 * @param options.texInputDirs - Tex input dirs the block may read from
 * @param options.texInputsHash - `hashTexInputs` of `texInputDirs`, folded into the SVG's hash
 * @param options.compileMode - The block's compile mode; see docs/adr/0005-dvi-is-the-default-compile-mode.md
 * @returns The SVG's hash, path and markup, or why the block produced no diagram
 */
export async function compileLatexToSvg(
  latexCode: string,
  svgOutputDir: string,
  options: {
    texInputDirs?: TexInputDir[];
    texInputsHash?: string;
    compileMode?: CompileMode;
  } = {},
): Promise<CompileOutcome> {
  const {
    texInputDirs = [],
    texInputsHash = "",
    compileMode = DEFAULT_COMPILE_MODE,
  } = options;

  if (!isLatexDocument(latexCode)) {
    return {
      ok: false,
      failure: {
        kind: "invalid-block",
        reason:
          "Code block is not a LaTeX document. " +
          "Blocks must contain both \\documentclass and \\begin{document}.",
      },
    };
  }

  const hash = hashLatexCode(
    latexCode,
    diagramHashSalt(compileMode, texInputsHash),
  );
  const svgPath = join(svgOutputDir, diagramFileName(hash));

  // If already compiled, return early
  if (existsSync(svgPath)) {
    const svgMarkup = readFileSync(svgPath, "utf-8");
    return { ok: true, hash, svgPath, svgMarkup, wasCompiled: false };
  }

  mkdirSync(svgOutputDir, { recursive: true });

  return inTempDir(async (workDir) => {
    const compiled = await compileToSvgFile(latexCode, workDir, {
      texInputDirs,
      compileMode,
    });
    if (!compiled.ok) return compiled;

    const svgMarkup = scopeSvg(
      readFileSync(compiled.svgFilePath, "utf-8"),
      diagramScopePrefix(hash),
    );
    writeFileSync(svgPath, svgMarkup, "utf-8");
    return { ok: true, hash, svgPath, svgMarkup, wasCompiled: true };
  });
}

/**
 * Writes the debug tex diagram image of a compiled tex diagram. sharp ignores
 * the fonts a compiled tex diagram embeds in dvi compile mode, so there the
 * block is compiled again with glyphs drawn as paths, which sharp renders
 * faithfully.
 */
export async function writeDebugImageFromDiagram(
  latexCode: string,
  svgPath: string,
  jpgPath: string,
  options: { texInputDirs: TexInputDir[]; compileMode: CompileMode },
): Promise<void> {
  if (options.compileMode === "pdf") {
    await writeJpgFromSvg(svgPath, jpgPath);
    return;
  }

  await inTempDir(async (workDir) => {
    const compiled = await compileToSvgFile(latexCode, workDir, {
      ...options,
      glyphsAsPaths: true,
    });
    if (!compiled.ok) {
      throw new Error(`recompile failed (${compiled.failure.kind})`);
    }
    await writeJpgFromSvg(compiled.svgFilePath, jpgPath);
  });
}
