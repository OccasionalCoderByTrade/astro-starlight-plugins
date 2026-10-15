/**
 * LaTeX error parser - extracts meaningful error messages from verbose LaTeX output
 */

export interface LatexErrorMessage {
  message: string;
  /** Line in `filePath` when set, otherwise in the `tex compile` block. */
  line?: number;
  /** Tex input file the error occurred in, when it isn't the block itself. */
  filePath?: string;
  context: string[];
  severity: "error" | "warning";
}

export interface ParseLatexErrorsOptions {
  /**
   * Path of the `.tex` file the block was compiled from. `-file-line-error`
   * errors naming any other file are attributed to that file.
   */
  blockFilePath?: string;
}

/** `-file-line-error` style error: `<file>:<line>: <message>`. */
const FILE_LINE_ERROR = /^(.+?\.[A-Za-z]+):(\d+): (.*)$/;

/**
 * Parse LaTeX error output and extract ALL error messages (not just the first).
 * Continues scanning after each error to find subsequent ones. Understands
 * both `! <message>` errors and `-file-line-error` errors.
 *
 * @param latexOutput - Raw stderr/stdout from LaTeX compilation
 * @returns Errors and warnings with messages, line numbers, and context lines
 */
export function parseLatexErrors(
  latexOutput: string,
  options: ParseLatexErrorsOptions = {},
): LatexErrorMessage[] {
  const lines = latexOutput.split("\n");
  const errors: LatexErrorMessage[] = [];
  const seenMessages = new Set<string>(); // avoid duplicate messages

  // Scan for all "!" and "<file>:<line>:" errors (most common LaTeX errors)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fileLineMatch = line.match(FILE_LINE_ERROR);
    if (!line.startsWith("!") && !fileLineMatch) continue;

    const message = fileLineMatch
      ? fileLineMatch[3].trim()
      : line.substring(1).trim();

    // Skip if we've already captured this error
    if (seenMessages.has(message)) continue;
    seenMessages.add(message);

    // Extract context and line number
    const context: string[] = [];
    let lineNum: number | undefined = fileLineMatch
      ? parseInt(fileLineMatch[2], 10)
      : undefined;

    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      const contextLine = lines[j];
      if (contextLine.trim()) {
        context.push(contextLine);
      }
      if (contextLine.startsWith("l.")) {
        const lineMatch = contextLine.match(/^l\.(\d+)/);
        if (lineMatch && lineNum === undefined) {
          lineNum = parseInt(lineMatch[1], 10);
        }
        break; // stop at source line
      }
    }

    const errorFilePath = fileLineMatch?.[1];
    errors.push({
      message,
      line: lineNum,
      filePath:
        errorFilePath !== undefined && errorFilePath !== options.blockFilePath
          ? errorFilePath
          : undefined,
      context: context.slice(0, 3),
      severity: "error",
    });
  }

  // Scan for warnings (overfull/underfull boxes, missing characters)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("Overfull") || line.includes("Underfull")) {
      const msg = line.trim();
      if (!seenMessages.has(msg)) {
        seenMessages.add(msg);
        errors.push({
          message: msg,
          context: [],
          severity: "warning",
        });
      }
    }
  }

  // If no structured errors found, try to extract any error-like message
  if (errors.length === 0 && latexOutput.length > 0) {
    for (const line of lines) {
      if (
        line.includes("error") ||
        line.includes("Error") ||
        line.includes("Misplaced") ||
        line.includes("Missing")
      ) {
        const msg = line.trim();
        if (!seenMessages.has(msg)) {
          seenMessages.add(msg);
          errors.push({
            message: msg,
            context: [],
            severity: "error",
          });
        }
        break;
      }
    }
  }

  // Fallback if absolutely no errors found
  if (errors.length === 0) {
    errors.push({
      message: "Unknown LaTeX compilation error",
      context: [],
      severity: "error",
    });
  }

  return errors;
}
