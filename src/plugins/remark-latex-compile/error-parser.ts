/**
 * LaTeX error parser - extracts meaningful error messages from verbose LaTeX output
 */

export interface ParsedLatexError {
  message: string;
  line?: number;
  context: string[];
}

/**
 * Parse LaTeX error output and extract the key error message with context.
 * Filters out noise and presents only the relevant error information.
 *
 * @param latexOutput - Raw stderr/stdout from LaTeX compilation
 * @returns Parsed error with message, line number, and context lines
 */
export function parseLatexError(latexOutput: string): ParsedLatexError {
  const lines = latexOutput.split("\n");
  const errorLines: string[] = [];
  let mainError = "";
  let errorLineNum: number | undefined;

  // Find the first error line (starts with "!")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("!")) {
      mainError = line.substring(1).trim();

      // Collect context: the error line and a few lines after
      errorLines.push(line);
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const contextLine = lines[j];
        if (contextLine.trim()) {
          errorLines.push(contextLine);
        }
        // Stop collecting after we hit the source line (starts with "l.")
        if (contextLine.startsWith("l.")) {
          break;
        }
      }

      // Extract line number if present (format: "l.123 ...")
      for (let j = i; j < Math.min(i + 10, lines.length); j++) {
        const lineMatch = lines[j].match(/^l\.(\d+)/);
        if (lineMatch) {
          errorLineNum = parseInt(lineMatch[1], 10);
          break;
        }
      }

      break;
    }
  }

  // If no "!" error found, look for other common error patterns
  if (!mainError) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (
        line.toLowerCase().includes("emergency stop") ||
        line.toLowerCase().includes("fatal error")
      ) {
        // Look back to find the actual error
        for (let j = Math.max(0, i - 5); j < i; j++) {
          if (lines[j].startsWith("!")) {
            mainError = lines[j].substring(1).trim();
            errorLines.push(lines[j]);
            break;
          }
        }
        if (!mainError) {
          mainError = line.trim();
        }
        break;
      }
    }
  }

  // Last resort: check if there's any indication of what went wrong
  if (!mainError && latexOutput.length > 0) {
    // Try to find any line with meaningful error-like content
    for (const line of lines) {
      if (
        line.length > 20 &&
        (line.includes("undefined") ||
          line.includes("Undefined") ||
          line.includes("error") ||
          line.includes("Error") ||
          line.includes("Misplaced") ||
          line.includes("unknown"))
      ) {
        mainError = line.trim();
        errorLines.push(mainError);
        break;
      }
    }
  }

  // Format the final message
  const message = mainError || "Unknown LaTeX compilation error";

  return {
    message,
    line: errorLineNum,
    context: errorLines.slice(0, 6),
  };
}

/**
 * Format a parsed LaTeX error into a readable message suitable for logging.
 *
 * @param error - Parsed error object
 * @returns Formatted error message string
 */
export function formatLatexError(error: ParsedLatexError): string {
  let output = `LaTeX Error: ${error.message}`;

  if (error.line) {
    output += ` (line ${error.line})`;
  }

  if (error.context.length > 0) {
    output += "\n\nContext:";
    for (const contextLine of error.context) {
      output += `\n  ${contextLine}`;
    }
  }

  return output;
}

/**
 * Create a user-friendly error message from LaTeX source and raw error output.
 *
 * @param latexSource - The LaTeX code that was compiled
 * @param rawError - Raw stderr/stdout from LaTeX
 * @returns User-friendly error message
 */
export function createCompilationErrorMessage(
  latexSource: string,
  rawError: string
): string {
  const parsed = parseLatexError(rawError);
  const formatted = formatLatexError(parsed);

  return (
    `[remark-latex-compile] LaTeX compilation failed\n\n` +
    `${formatted}\n\n` +
    `LaTeX source:\n${latexSource}`
  );
}
