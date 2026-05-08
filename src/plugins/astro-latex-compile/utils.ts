/**
 * LaTeX compilation utilities for converting LaTeX code to SVG.
 *
 * External dependencies required on PATH:
 *   - pdflatex  (e.g. texlive-latex-base on Debian, MacTeX on macOS)
 *   - dvisvgm   (e.g. texlive-extra-utils on Debian, included in MacTeX)
 *
 * Code blocks must either be a complete standalone LaTeX document (containing
 * both \documentclass and \begin{document}), or raw content that the plugin
 * wraps in a minimal standalone document automatically.
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
import { basename, dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { createCompilationErrorMessage } from "./error-parser.js";
import { execProcess } from "../utils/process-utils.js";
import { html, HtmlString } from "../utils/html-builder.js";

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
  await sharp(svgPath, { density: 300 })
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

function computeLineOffset(_latexCode: string): number {
  // Complete documents are passed through as-is, so pdflatex line numbers
  // map directly to node.value line numbers.
  return 0;
}

export function buildErrorHtml(
  header: string,
  errorMsg: string,
  latexCode: string,
): string {
  const clean = stripAnsi(errorMsg);
  const sourceIdx = clean.indexOf("LaTeX source:");
  const summary = (
    sourceIdx !== -1 ? clean.slice(0, sourceIdx) : clean
  ).trimEnd();

  // Extract pdflatex-reported line numbers (e.g. "Error (line 5):")
  const compiledLineNums: number[] = [];
  const linePattern = /Error \(line (\d+)\)/g;
  let m;
  while ((m = linePattern.exec(summary)) !== null) {
    compiledLineNums.push(parseInt(m[1], 10));
  }

  const offset = computeLineOffset(latexCode);
  const errorLineSet = new Set(
    compiledLineNums.map((n) => n - offset).filter((n) => n > 0),
  );

  const codeLines = latexCode.split("\n");
  const lineWidth = String(codeLines.length).length;

  const summaryLines = summary
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => html`<div>${line}</div>`);

  // Joined without newlines — extra whitespace inside <pre> renders as blank lines
  const codeBlock = new HtmlString(
    codeLines
      .map((line, i) => {
        const lineNum = i + 1;
        const isError = errorLineSet.has(lineNum);
        const gutter = String(lineNum).padStart(lineWidth);
        const bg = isError ? "background:var(--cannoli-error-low);" : "";

        return html`<span style="${bg}display:block;padding:0 14px"
          ><span style="color:var(--sl-color-gray-3);user-select:none"
            >${gutter} │ </span
          >${line}</span
        >`.toString();
      })
      .join(""),
  );

  return html`<div
    class="not-content"
    style="border:1px solid var(--cannoli-error-low);border-radius:6px;overflow:hidden;margin:1.5em 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.5;display:flex;flex-direction:column"
  >
    <div
      style="background:var(--cannoli-error);color:var(--sl-color-black);padding:8px 14px;font-weight:700"
    >
      &#9888;&nbsp;LaTeX Compilation Error &mdash; ${header}
    </div>
    <div
      style="background:var(--cannoli-error-low);color:var(--cannoli-error-high);padding:10px 14px;border-bottom:1px solid var(--cannoli-error)"
    >
      $${summaryLines}
    </div>
    <pre
      style="margin:0;background:var(--sl-color-gray-6);color:var(--sl-color-text);overflow-x:auto"
    ><code style="display:block;padding:8px 0;font-size:12px">$${codeBlock}</code></pre>
  </div>`.toString();
}

function collectTexInputFiles(dir: string, recursive: boolean): string[] {
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory() && recursive) {
        files.push(...collectTexInputFiles(full, recursive));
      } else if (entry.isFile()) {
        files.push(full);
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
  const h = createHash("md5").update(normalized);
  if (salt) h.update(salt);
  return h.digest("hex").slice(0, 16);
}

function buildLatexSource(latexCode: string): string {
  if (
    latexCode.includes("\\documentclass") &&
    latexCode.includes("\\begin{document}")
  ) {
    return latexCode.trim();
  }
  throw new Error(
    `[remark-latex-compile] Code block is not a complete LaTeX document. ` +
      `Blocks must contain both \\documentclass and \\begin{document}.`,
  );
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
  inputsSalt = "",
): Promise<CompilationResult> {
  const hash = hashLatexCode(latexCode, inputsSalt);
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
