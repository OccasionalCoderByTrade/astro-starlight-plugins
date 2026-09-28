/**
 * LaTeX error parser - extracts meaningful error messages from verbose LaTeX output
 */

export interface LatexErrorMessage {
  message: string;
  line?: number;
  context: string[];
  severity: "error" | "warning";
}

/**
 * Parse LaTeX error output and extract ALL error messages (not just the first).
 * Continues scanning after each error to find subsequent ones.
 *
 * @param latexOutput - Raw stderr/stdout from LaTeX compilation
 * @returns Errors and warnings with messages, line numbers, and context lines
 */
export function parseLatexErrors(latexOutput: string): LatexErrorMessage[] {
  const lines = latexOutput.split("\n");
  const errors: LatexErrorMessage[] = [];
  const seenMessages = new Set<string>(); // avoid duplicate messages

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
