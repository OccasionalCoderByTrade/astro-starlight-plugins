/**
 * LaTeX error parser - extracts meaningful error messages from verbose LaTeX output
 */

interface LatexErrorMessage {
  message: string;
  line?: number;
  context: string[];
  severity: "error" | "warning" | "fatal";
}

interface ParsedLatexError {
  errors: LatexErrorMessage[];
  hasFatal: boolean;
}

/**
 * Parse LaTeX error output and extract ALL error messages (not just the first).
 * Continues scanning after each error to find subsequent ones.
 *
 * @param latexOutput - Raw stderr/stdout from LaTeX compilation
 * @returns Parsed errors with messages, line numbers, and context lines
 */
export function parseLatexError(latexOutput: string): ParsedLatexError {
  const lines = latexOutput.split("\n");
  const errors: LatexErrorMessage[] = [];
  const seenMessages = new Set<string>(); // avoid duplicate messages
  let hasFatal = false;

  // Scan for all "!" errors (most common LaTeX errors)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("!")) {
      const message = line.substring(1).trim();

      // Skip if we've already captured this error
      if (seenMessages.has(message)) continue;
      seenMessages.add(message);

      // Extract context and line number
      const context: string[] = [];
      let lineNum: number | undefined;

      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const contextLine = lines[j];
        if (contextLine.trim()) {
          context.push(contextLine);
        }
        if (contextLine.startsWith("l.")) {
          const lineMatch = contextLine.match(/^l\.(\d+)/);
          if (lineMatch) {
            lineNum = parseInt(lineMatch[1], 10);
          }
          break; // stop at source line
        }
      }

      errors.push({
        message,
        line: lineNum,
        context: context.slice(0, 3),
        severity: "error",
      });
    }
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

  // Detect fatal errors (emergency stop, missing file)
  for (const line of lines) {
    if (
      line.toLowerCase().includes("emergency stop") ||
      line.toLowerCase().includes("fatal error") ||
      line.toLowerCase().includes("not found")
    ) {
      hasFatal = true;
      break;
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

  return { errors, hasFatal };
}

/**
 * Format parsed LaTeX errors into a readable report.
 *
 * @param parsed - Parsed error object containing all errors found
 * @returns Formatted error message string
 */
export function formatLatexError(parsed: ParsedLatexError): string {
  const RED = "\x1b[31m";
  const YELLOW = "\x1b[33m";
  const RESET = "\x1b[0m";

  const errorCount = parsed.errors.filter((e) => e.severity === "error").length;
  const warningCount = parsed.errors.filter(
    (e) => e.severity === "warning",
  ).length;

  let output = `${RED}[remark-latex-compile] LaTeX compilation failed${RESET}\n`;
  output += `${RED}${errorCount} error${errorCount !== 1 ? "s" : ""}${RESET}`;
  if (warningCount > 0) {
    output += `, ${YELLOW}${warningCount} warning${warningCount !== 1 ? "s" : ""}${RESET}`;
  }
  output += "\n\n";

  // Group by severity: errors first, then warnings
  const errorsByType = parsed.errors.reduce(
    (acc, e) => {
      if (!acc[e.severity]) acc[e.severity] = [];
      acc[e.severity].push(e);
      return acc;
    },
    {} as Record<string, LatexErrorMessage[]>,
  );

  // Display errors
  for (const err of errorsByType["error"] || []) {
    output += `${RED}Error${RESET}`;
    if (err.line) output += ` (line ${err.line})`;
    output += `: ${err.message}\n`;
    if (err.context.length > 0) {
      output += `  Context: ${err.context[0]}\n`;
    }
  }

  // Display warnings
  for (const warn of errorsByType["warning"] || []) {
    output += `${YELLOW}Warning${RESET}: ${warn.message}\n`;
  }

  return output;
}

/**
 * Format LaTeX source with line numbers.
 */
function formatLatexSourceWithLineNumbers(
  latexSource: string,
  errors: LatexErrorMessage[],
): string {
  const RED = "\x1b[31m";
  const RESET = "\x1b[0m";

  const lines = latexSource.split("\n");
  const maxLineNum = lines.length;
  const lineNumWidth = String(maxLineNum).length;
  const errorLineNumbers = new Set(errors.map((e) => e.line).filter(Boolean));

  const formattedLines = lines
    .map((line, index) => {
      const lineNum = index + 1;
      const lineNumStr = String(lineNum);
      const padding = lineNumStr.length < lineNumWidth ? " " : "";

      if (errorLineNumbers.has(lineNum)) {
        return `${padding}${RED}[${lineNumStr}]:${RESET} ${line}`;
      }
      return `${padding}[${lineNumStr}]: ${line}`;
    })
    .join("\n");

  return formattedLines;
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
  rawError: string,
): string {
  const parsed = parseLatexError(rawError);
  const formatted = formatLatexError(parsed);
  const formattedSource = formatLatexSourceWithLineNumbers(
    latexSource,
    parsed.errors,
  );

  return `${formatted}\n` + `LaTeX source:\n${formattedSource}\n`;
}
