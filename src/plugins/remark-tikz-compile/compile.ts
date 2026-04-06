/**
 * TikZ compilation utilities for converting LaTeX TikZ code to SVG.
 *
 * External dependencies required on PATH:
 *   - latex     (e.g. texlive-latex-base on Debian, MacTeX on macOS)
 *   - dvisvgm   (e.g. texlive-extra-utils on Debian, included in MacTeX)
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

function hashTikzCode(code: string): string {
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

function buildLatexSource(tikzCode: string): string {
  return [
    "\\documentclass[tikz,border=10pt]{standalone}",
    "\\usepackage{tikz}",
    "\\begin{document}",
    tikzCode.trim(),
    "\\end{document}",
  ].join("\n");
}

export interface CompilationResult {
  hash: string;
  svgPath: string;
  wasCompiled: boolean;
}

/**
 * Compile TikZ code to SVG.
 *
 * @param tikzCode - The TikZ code to compile (e.g., `\begin{tikzpicture}...\end{tikzpicture}`)
 * @param svgOutputDir - The directory where SVG files should be written
 * @returns Result object with hash, svgPath, and whether compilation occurred
 * @throws Error if compilation fails
 */
export function compileTikzToSvg(
  tikzCode: string,
  svgOutputDir: string,
): CompilationResult {
  const hash = hashTikzCode(tikzCode);
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
  const latexSource = buildLatexSource(tikzCode);

  try {
    writeFileSync(texFile, latexSource, "utf-8");

    try {
      execSync(
        `latex -interaction=nonstopmode -output-directory "${workDir}" "${texFile}"`,
        { stdio: "pipe", cwd: workDir, encoding: "utf-8" },
      );
    } catch (latexErr: any) {
      throw new Error(
        `[remark-tikz-compile] LaTeX compilation failed (hash: ${hash}).\n` +
          `LaTeX source:\n${latexSource}\n\nError: ${latexErr.message}\nStderr: ${latexErr.stderr ?? ""}Stdout: ${latexErr.stdout ?? ""}`,
      );
    }

    try {
      execSync(`dvisvgm "${dviFile}" -o "${svgTempFile}"`, {
        stdio: "pipe",
        cwd: workDir,
        encoding: "utf-8",
      });
    } catch (dvisvgmErr: any) {
      throw new Error(
        `[remark-tikz-compile] DVI to SVG conversion failed (hash: ${hash}).\n` +
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
