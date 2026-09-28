/**
 * Tex compile errors: why a `tex compile` block produced no compiled tex
 * diagram, and how that is shown in the console, in the page, and as a debug
 * tex diagram image.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import sharp from "sharp";
import { html, HtmlString } from "../utils/html-builder.js";
import type { LatexErrorMessage } from "./error-parser.js";

export type TexCompileFailure =
  /** pdflatex rejected the document. `source` is exactly what was compiled. */
  | { kind: "latex"; errors: LatexErrorMessage[]; source: string }
  /** The block is not a LaTeX document, so it was never compiled. */
  | { kind: "invalid-block"; reason: string }
  /** dvisvgm failed to turn the PDF into an SVG. */
  | { kind: "conversion"; output: string }
  /** A required executable is not on PATH. */
  | { kind: "toolchain-missing"; tool: "pdflatex" | "dvisvgm" }
  /** Anything else that went wrong while handling this one block. */
  | { kind: "unexpected"; message: string };

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

type Paint = (text: string, color: string) => string;
const plain: Paint = (text) => text;
const ansi: Paint = (text, color) => `${color}${text}${RESET}`;

/** One line per error and warning, e.g. `Error (line 6): Undefined control sequence.` */
function describeLatexErrors(
  errors: LatexErrorMessage[],
  paint: Paint,
): string[] {
  const lines: string[] = [];
  for (const err of errors.filter((e) => e.severity === "error")) {
    const at = err.line ? ` (line ${err.line})` : "";
    lines.push(`${paint("Error", RED)}${at}: ${err.message}`);
    if (err.context.length > 0) lines.push(`  Context: ${err.context[0]}`);
  }
  for (const warn of errors.filter((e) => e.severity === "warning")) {
    lines.push(`${paint("Warning", YELLOW)}: ${warn.message}`);
  }
  return lines;
}

function errorLineNumbers(failure: TexCompileFailure): Set<number> {
  if (failure.kind !== "latex") return new Set();
  return new Set(
    failure.errors.map((e) => e.line).filter((n): n is number => !!n),
  );
}

function summarize(failure: TexCompileFailure, paint: Paint): string[] {
  switch (failure.kind) {
    case "latex":
      return describeLatexErrors(failure.errors, paint);
    case "invalid-block":
      return [failure.reason];
    case "conversion":
      return [
        "PDF to SVG conversion failed.",
        `Error: ${failure.output.trimEnd()}`,
      ];
    case "toolchain-missing":
      return [`${failure.tool} not found on PATH.`];
    case "unexpected":
      return [`Unexpected error: ${failure.message}`];
  }
}

/**
 * Plain-text summary of the failure, without the block source, as single
 * lines: tool output that spans several lines is split up.
 */
function describeFailure(failure: TexCompileFailure, paint: Paint): string[] {
  return summarize(failure, paint).flatMap((line) => line.split("\n"));
}

function numberedSource(source: string, errorLines: Set<number>): string {
  const width = "[999]".length;
  return source
    .split("\n")
    .map((line, i) => {
      const label = `[${i + 1}]`.padStart(width);
      return errorLines.has(i + 1)
        ? `${ansi(`${label}:`, RED)} ${line}`
        : `${label}: ${line}`;
    })
    .join("\n");
}

/**
 * Terminal report for one tex compile error, headed by `location`
 * (`file:line` of the `tex compile` block).
 */
export function renderConsole(
  failure: TexCompileFailure,
  location: string,
): string {
  let out = `[astro-latex-compile] ${location}\n`;
  out += describeFailure(failure, ansi).join("\n");
  if (failure.kind === "latex") {
    out += `\n\nLaTeX source:\n${numberedSource(failure.source, errorLineNumbers(failure))}\n`;
  }
  return out;
}

/**
 * The tex compile error shown in the page in place of the compiled tex
 * diagram. `blockSource` is listed when the failure carries no source of its
 * own.
 */
export function renderHtml(
  failure: TexCompileFailure,
  location: string,
  blockSource: string,
): string {
  const source = failure.kind === "latex" ? failure.source : blockSource;
  const errorLines = errorLineNumbers(failure);
  const codeLines = source.split("\n");
  const gutterWidth = String(codeLines.length).length;

  const summaryLines = describeFailure(failure, plain)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => html`<div>${line}</div>`);

  // Joined without newlines — extra whitespace inside <pre> renders as blank lines
  const codeBlock = new HtmlString(
    codeLines
      .map((line, i) => {
        const gutter = String(i + 1).padStart(gutterWidth);
        const bg = errorLines.has(i + 1)
          ? "background:var(--cannoli-error-low);"
          : "";

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
      &#9888;&nbsp;LaTeX Compilation Error &mdash; ${location}
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

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(lines: string[], maxChars: number): string[] {
  const wrapped: string[] = [];
  for (const raw of lines) {
    let remaining = raw;
    while (remaining.length > maxChars) {
      wrapped.push(remaining.slice(0, maxChars));
      remaining = remaining.slice(maxChars);
    }
    wrapped.push(remaining);
  }
  return wrapped;
}

/**
 * Writes the debug tex diagram image for a block whose compile failed: a JPEG
 * of the failure summary, headed by `location`.
 */
export async function writeDebugImage(
  failure: TexCompileFailure,
  location: string,
  jpgPath: string,
): Promise<void> {
  const MAX_LINES = 40;
  let lines = wrapText(describeFailure(failure, plain), 90);
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
  <text x="${padding}" y="${padding + 40}" font-family="monospace" font-size="12" fill="#666666">${escapeXml(location)}</text>
  ${textLines}
</svg>`;

  mkdirSync(dirname(jpgPath), { recursive: true });
  await sharp(Buffer.from(svg))
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 90 })
    .toFile(jpgPath);
}
