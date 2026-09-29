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
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  mkdtempSync,
} from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { parseLatexErrors } from "./error-parser.js";
import type { TexCompileFailure } from "./tex-compile-error.js";
import { execProcess } from "../utils/process-utils.js";

const CONTENT_ROOT = "src/content/docs/";

export type CompileOutcome =
  | { ok: true; hash: string; svgPath: string; wasCompiled: boolean }
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

function collectTexInputFiles(dir: string, recursive: boolean): string[] {
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && recursive) {
        files.push(...collectTexInputFiles(fullPath, recursive));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch {
    // directory missing or unreadable — skip silently
  }
  return files.sort();
}

export function computeTexInputDirsSalt(texInputDirs: string[]): string {
  if (texInputDirs.length === 0) return "";
  const hash = createHash("md5");
  let hasAnyFile = false;
  for (const dir of texInputDirs) {
    const recursive = dir.endsWith("//");
    const resolved = resolve(dir.endsWith("/") ? dir.slice(0, -1) : dir);
    for (const filePath of collectTexInputFiles(resolved, recursive)) {
      try {
        hash.update(relative(process.cwd(), filePath));
        hash.update(readFileSync(filePath));
        hasAnyFile = true;
      } catch {
        // skip unreadable files
      }
    }
  }
  return hasAnyFile ? hash.digest("hex").slice(0, 16) : "";
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
  options?: { env?: NodeJS.ProcessEnv },
): Promise<{ status: number; stdout: string; stderr: string } | null> {
  try {
    return await execProcess(command, args, options);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Compile a `tex compile` block's LaTeX to a compiled tex diagram, reusing
 * the SVG when one with the same hash already exists.
 *
 * @param latexCode - The LaTeX document to compile (e.g., TikZ, pgfplots, etc.)
 * @param svgOutputDir - The directory where SVG files should be written
 * @returns The SVG's hash and path, or why the block produced no diagram
 */
export async function compileLatexToSvg(
  latexCode: string,
  svgOutputDir: string,
  texInputDirs: string[] = [],
  inputsSalt = "",
): Promise<CompileOutcome> {
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

  const hash = hashLatexCode(latexCode, inputsSalt);
  const svgPath = join(svgOutputDir, diagramFileName(hash));

  // If already compiled, return early
  if (existsSync(svgPath)) {
    return { ok: true, hash, svgPath, wasCompiled: false };
  }

  mkdirSync(svgOutputDir, { recursive: true });

  const workDir = mkdtempSync(join(tmpdir(), "latex-compile-"));
  const texFile = join(workDir, "diagram.tex");
  const pdfFile = join(workDir, "diagram.pdf");
  const latexSource = latexCode.trim();

  try {
    writeFileSync(texFile, latexSource, "utf-8");

    const pdflatexEnv =
      texInputDirs.length > 0
        ? {
            ...process.env,
            TEXINPUTS: `${texInputDirs.join(":")}:${process.env.TEXINPUTS ?? ""}`,
          }
        : undefined;

    // Compile LaTeX to PDF
    const pdflatexResult = await execTool(
      "pdflatex",
      ["-interaction=nonstopmode", "-output-directory", workDir, texFile],
      { env: pdflatexEnv },
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
            pdflatexResult.stderr || pdflatexResult.stdout || "",
          ),
          source: latexSource,
        },
      };
    }

    // Convert PDF to SVG
    const svgResult = await execTool("dvisvgm", [
      "--pdf",
      "--bbox=dvi",
      pdfFile,
      "-o",
      svgPath,
    ]);
    if (!svgResult) {
      return {
        ok: false,
        failure: { kind: "toolchain-missing", tool: "dvisvgm" },
      };
    }
    if (svgResult.status !== 0) {
      return {
        ok: false,
        failure: {
          kind: "conversion",
          output: svgResult.stderr || svgResult.stdout || "",
        },
      };
    }
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors — temp files will be GC'd by the OS
    }
  }

  return { ok: true, hash, svgPath, wasCompiled: true };
}
