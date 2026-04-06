/**
 * LaTeX compilation utilities for converting LaTeX code to SVG.
 *
 * External dependencies required on PATH:
 *   - latex     (e.g. texlive-latex-base on Debian, MacTeX on macOS)
 *   - dvisvgm   (e.g. texlive-extra-utils on Debian, included in MacTeX)
 *
 * Users should include their own \usepackage{} and \usetikzlibrary{} commands
 * in their LaTeX code blocks for maximum flexibility.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCompilationErrorMessage } from "./error-parser.js";

function hashLatexCode(code: string): string {
  // Normalize by trimming each line (removes leading/trailing whitespace)
  // then trimming the overall string. This makes the hash robust to formatting
  // differences while preserving significant internal whitespace (e.g., in \verb{...})
  const normalized = code
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
  // MD5 truncated to 16 chars (8 bytes, 64 bits) is fast and provides
  // ~2^32 collision resistance (4 billion diagrams) which is more than sufficient
  // for build caching of non-adversarial content.
  return createHash("md5")
    .update(normalized)
    .digest("hex")
    .slice(0, 16);
}

function buildLatexSource(latexCode: string): string {
  // Extract \usepackage and \usetikzlibrary commands from user code
  // (they must come before \begin{document})
  const packageRegex = /\\usepackage\{[^}]+\}|\\usetikzlibrary\{[^}]+\}/g;
  const packages = latexCode.match(packageRegex) || [];

  // Remove package declarations from the code
  const codeWithoutPackages = latexCode
    .replace(packageRegex, "")
    .trim();

  return [
    "\\documentclass[border=10pt]{standalone}",
    ...packages,
    "\\pagecolor{white}",
    "\\begin{document}",
    codeWithoutPackages,
    "\\end{document}",
  ].join("\n");
}

export interface CompilationResult {
  hash: string;
  svgPath: string;
  wasCompiled: boolean;
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

  const workDir = join(tmpdir(), `tikz-compile-${hash}`);
  mkdirSync(workDir, { recursive: true });

  const texFile = join(workDir, `${hash}.tex`);
  const dviFile = join(workDir, `${hash}.dvi`);
  const svgTempFile = join(workDir, `${hash}.svg`);
  const latexSource = buildLatexSource(latexCode);

  try {
    writeFileSync(texFile, latexSource, "utf-8");

    try {
      execSync(
        `latex -interaction=nonstopmode -output-directory "${workDir}" "${texFile}"`,
        { stdio: "pipe", cwd: workDir, encoding: "utf-8" },
      );
    } catch (latexErr: any) {
      const errorOutput = latexErr.stderr ?? latexErr.stdout ?? latexErr.message ?? "";
      const userMessage = createCompilationErrorMessage(latexSource, errorOutput);
      throw new Error(userMessage);
    }

    try {
      execSync(`dvisvgm "${dviFile}" -o "${svgTempFile}"`, {
        stdio: "pipe",
        cwd: workDir,
        encoding: "utf-8",
      });
    } catch (dvisvgmErr: any) {
      throw new Error(
        `[remark-latex-compile] DVI to SVG conversion failed (hash: ${hash}).\n` +
          `Error: ${dvisvgmErr.message}\nStderr: ${dvisvgmErr.stderr ?? ""}Stdout: ${dvisvgmErr.stdout ?? ""}`,
      );
    }

    copyFileSync(svgTempFile, svgPath);
  } catch (err) {
    throw err;
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors — temp files will be GC'd by the OS
    }
  }

  return { hash, svgPath, wasCompiled: true };
}
