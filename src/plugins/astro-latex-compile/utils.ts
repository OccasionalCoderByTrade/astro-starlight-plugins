/**
 * LaTeX compilation utilities for converting LaTeX code to SVG.
 *
 * External dependencies required on PATH:
 *   - pdflatex  (e.g. texlive-latex-base on Debian, MacTeX on macOS)
 *   - dvisvgm   (e.g. texlive-extra-utils on Debian, included in MacTeX)
 *
 * Users can optionally separate preamble from content using %=== separator:
 *   \usepackage{amsmath}
 *   %===
 *   $\begin{pmatrix} ... \end{pmatrix}$
 *
 * Spaces between % and === are optional. Content without separator is treated
 * entirely as document content.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  mkdtempSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { createCompilationErrorMessage } from "./error-parser.js";
import { execProcess } from "../utils/process-utils.js";

const CONTENT_ROOT = "src/content/docs/";

export interface CompilationResult {
  hash: string;
  svgPath: string;
  wasCompiled: boolean;
}

/**
 * Regex to match fenced ```tex compile or ```latex compile blocks in markdown.
 * Handles both LF and CRLF line endings.
 * Capture group 1: the raw block content.
 */
export const LATEX_BLOCK_REGEX =
  /```(?:tex|latex)\s+compile[^\r\n]*\r?\n([\s\S]*?)\r?\n```/g;

export function computeJpgPath(
  tempOutputDir: string,
  filePath: string,
  blockId: number,
): string {
  const normalized = filePath.replace(/\\/g, "/");
  const idx = normalized.indexOf(CONTENT_ROOT);
  const relativePath =
    idx !== -1
      ? normalized.slice(idx + CONTENT_ROOT.length)
      : basename(normalized);

  const dir = dirname(relativePath);
  const filename = basename(relativePath);
  const jpgFilename = `${filename}--${blockId}.jpg`;

  const base = resolve(tempOutputDir);
  return dir === "." ? join(base, jpgFilename) : join(base, dir, jpgFilename);
}

export async function writeJpgFromSvg(
  svgPath: string,
  jpgPath: string,
): Promise<void> {
  mkdirSync(dirname(jpgPath), { recursive: true });
  await sharp(svgPath)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 90 })
    .toFile(jpgPath);
}

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (const raw of text.split("\n")) {
    if (raw.length <= maxChars) {
      lines.push(raw);
    } else {
      let remaining = raw;
      while (remaining.length > maxChars) {
        lines.push(remaining.slice(0, maxChars));
        remaining = remaining.slice(maxChars);
      }
      if (remaining) lines.push(remaining);
    }
  }
  return lines;
}

export async function writeJpgError(
  jpgPath: string,
  header: string,
  errorText: string,
): Promise<void> {
  const MAX_LINES = 40;
  const clean = stripAnsi(errorText);

  // Strip the verbose LaTeX source listing — show only the error summary
  const sourceIdx = clean.indexOf("LaTeX source:");
  const summary = (
    sourceIdx !== -1 ? clean.slice(0, sourceIdx) : clean
  ).trimEnd();

  let lines = wrapText(summary, 90);
  if (lines.length > MAX_LINES) {
    lines = lines.slice(0, MAX_LINES);
    lines.push("...");
  }

  const fontSize = 13;
  const lineHeight = 18;
  const padding = 20;
  const headerHeight = 55;
  const width = 800;
  const height = padding * 2 + headerHeight + lines.length * lineHeight;

  const textLines = lines
    .map(
      (line, i) =>
        `<text x="${padding}" y="${padding + headerHeight + i * lineHeight}" font-family="monospace" font-size="${fontSize}" fill="#333333">${escapeXml(line)}</text>`,
    )
    .join("\n  ");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="white"/>
  <rect x="0" y="0" width="${width}" height="4" fill="#cc0000"/>
  <text x="${padding}" y="${padding + 20}" font-family="monospace" font-size="16" font-weight="bold" fill="#cc0000">LaTeX Compilation Error</text>
  <text x="${padding}" y="${padding + 40}" font-family="monospace" font-size="12" fill="#666666">${escapeXml(header)}</text>
  ${textLines}
</svg>`;

  mkdirSync(dirname(jpgPath), { recursive: true });
  await sharp(Buffer.from(svg))
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 90 })
    .toFile(jpgPath);
}

export function hashLatexCode(code: string): string {
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
  return createHash("md5").update(normalized).digest("hex").slice(0, 16);
}

function buildLatexSource(latexCode: string): string {
  // If user provided a complete document structure, use it as-is
  if (
    latexCode.includes("\\documentclass") &&
    latexCode.includes("\\begin{document}")
  ) {
    return latexCode.trim();
  }

  // Split on %=== separator (with optional spaces/tabs, not newlines): preamble %=== content
  const separatorRegex = /%[ \t]*===/;
  const parts = latexCode.split(separatorRegex);
  let preamble = "";
  let content = latexCode.trim();

  if (parts.length === 2) {
    preamble = parts[0].trim();
    content = parts[1].trim();
  }

  return [
    "\\documentclass[border=5pt]{standalone}",
    preamble,
    "\\begin{document}",
    "\\Large",
    content,
    "\\end{document}",
  ].join("\n");
}

/**
 * Compile LaTeX code to SVG.
 *
 * @param latexCode - The LaTeX code to compile (e.g., TikZ, pgfplots, etc.)
 * @param svgOutputDir - The directory where SVG files should be written
 * @returns Result object with hash, svgPath, and whether compilation occurred
 * @throws Error if compilation fails
 */
export async function compileLatexToSvg(
  latexCode: string,
  svgOutputDir: string,
  texInputDirs: string[] = [],
): Promise<CompilationResult> {
  const hash = hashLatexCode(latexCode);
  const svgPath = join(svgOutputDir, `${hash}.svg`);

  // If already compiled, return early
  if (existsSync(svgPath)) {
    return { hash, svgPath, wasCompiled: false };
  }

  mkdirSync(svgOutputDir, { recursive: true });

  const workDir = mkdtempSync(join(tmpdir(), "latex-compile-"));
  const texFile = join(workDir, "diagram.tex");
  const pdfFile = join(workDir, "diagram.pdf");
  const latexSource = buildLatexSource(latexCode);

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
    let result;
    try {
      result = await execProcess(
        "pdflatex",
        ["-interaction=nonstopmode", "-output-directory", workDir, texFile],
        { env: pdflatexEnv },
      );
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      throw new Error(
        `[remark-latex-compile] pdflatex not found on PATH (${code}).`,
        { cause: err },
      );
    }

    if (result.status !== 0) {
      const errorOutput = result.stderr || result.stdout || "";
      const userMessage = createCompilationErrorMessage(
        latexSource,
        errorOutput,
      );
      throw new Error(userMessage);
    }

    // Convert PDF to SVG
    let svgResult;
    try {
      svgResult = await execProcess("dvisvgm", [
        "--pdf",
        "--bbox=dvi",
        pdfFile,
        "-o",
        svgPath,
      ]);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      throw new Error(
        `[remark-latex-compile] dvisvgm not found on PATH (${code}).`,
        { cause: err },
      );
    }

    if (svgResult.status !== 0) {
      const errorOutput = svgResult.stderr || svgResult.stdout || "";
      throw new Error(
        `[remark-latex-compile] PDF to SVG conversion failed (hash: ${hash}).\n` +
          `Error: ${errorOutput}`,
      );
    }
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors — temp files will be GC'd by the OS
    }
  }

  return { hash, svgPath, wasCompiled: true };
}
