/** A match within one line; `columnEnd` is exclusive. */
export type TEmphasisRange = { columnStart: number; columnEnd: number };

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Unicode `\w`: letters, combining marks, digits and `_`. Needs the `u` flag. */
const WORD_CHAR_CLASS = "[\\p{L}\\p{M}\\p{N}_]";

/**
 * Regex source matching `term` as a whole unit: an edge that is a word
 * character can't sit against another one, a punctuation edge is unconstrained.
 */
function termBoundaryPattern(term: string): string {
  const startsWithWordChar = new RegExp(`^${WORD_CHAR_CLASS}`, "u").test(term);
  const endsWithWordChar = new RegExp(`${WORD_CHAR_CLASS}$`, "u").test(term);
  return [
    startsWithWordChar ? `(?<!${WORD_CHAR_CLASS})` : "",
    escapeRegex(term),
    endsWithWordChar ? `(?!${WORD_CHAR_CLASS})` : "",
  ].join("");
}

/**
 * Builds the pattern for a code block's terms once and returns a function that
 * finds their non-overlapping matches in a line, in line order. Duplicate terms
 * count once, and at the same start the longer term wins.
 */
export function createEmphasisMatcher(
  terms: string[],
): (lineText: string) => TEmphasisRange[] {
  if (terms.length === 0) return () => [];
  // Longest first, so an alternation tries `foo.bar` before `foo`.
  const uniqueTerms = [...new Set(terms)].sort(
    (firstTerm, secondTerm) => secondTerm.length - firstTerm.length,
  );
  const emphasisTermsPattern = new RegExp(
    uniqueTerms.map(termBoundaryPattern).join("|"),
    "gu",
  );
  return (lineText) =>
    [...lineText.matchAll(emphasisTermsPattern)].map((match) => ({
      columnStart: match.index,
      columnEnd: match.index + match[0].length,
    }));
}
