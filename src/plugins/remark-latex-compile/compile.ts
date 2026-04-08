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
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  mkdtempSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCompilationErrorMessage } from "./error-parser.js";

export interface CompilationResult {
  hash: string;
  svgPath: string;
  wasCompiled: boolean;
}

function hashLatexCode(code: string): string {
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
export function compileLatexToSvg(
  latexCode: string,
  svgOutputDir: string,
): CompilationResult {
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

    // Compile LaTeX to PDF
    const latexResult = spawnSync("pdflatex", [
      "-interaction=nonstopmode",
      "-output-directory",
      workDir,
      texFile,
    ]);

    if (latexResult.error) {
      const code = (latexResult.error as NodeJS.ErrnoException).code;
      throw new Error(
        `[remark-latex-compile] pdflatex not found on PATH (${code}).`,
      );
    }

    if (latexResult.status !== 0) {
      const errorOutput =
        latexResult.stderr?.toString() || latexResult.stdout?.toString() || "";
      const userMessage = createCompilationErrorMessage(
        latexSource,
        errorOutput,
      );
      throw new Error(userMessage);
    }

    // Convert PDF to SVG
    const dvisvgmResult = spawnSync("dvisvgm", [
      "--pdf",
      "--bbox=dvi",
      pdfFile,
      "-o",
      svgPath,
    ]);

    if (dvisvgmResult.error) {
      const code = (dvisvgmResult.error as NodeJS.ErrnoException).code;
      throw new Error(
        `[remark-latex-compile] dvisvgm not found on PATH (${code}).`,
      );
    }

    if (dvisvgmResult.status !== 0) {
      const errorOutput =
        dvisvgmResult.stderr?.toString() ||
        dvisvgmResult.stdout?.toString() ||
        "";
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
