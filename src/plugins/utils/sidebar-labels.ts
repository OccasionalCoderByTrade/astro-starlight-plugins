/**
 * A sidebar label made from a path segment (a directory name, or a file name without its
 * extension): each `-`-separated word capitalized, and a leading word followed by a number
 * of 2+ digits upper-cased, e.g. `csci-316` becomes `CSCI 316`.
 */
export function pathSegmentToLabel(pathSegment: string): string {
  let label = pathSegment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  const courseCodeMatch = label.match(/^([a-z]+) [0-9]{2,}/i);
  if (courseCodeMatch) {
    const courseCodeLetters = courseCodeMatch[1];
    label =
      courseCodeLetters.toUpperCase() +
      label.substring(courseCodeLetters.length);
  }

  return label;
}
