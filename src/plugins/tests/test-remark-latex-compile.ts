/**
 * Standalone test for LaTeX compilation.
 * Run with: npx tsx src/plugins/tests/remark-latex-compile.ts
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { compileLatexToSvg } from "../astro-latex-compile";

const testOutputDir = resolve("test-latex-output");

async function test() {
  console.log("[test] Starting LaTeX compilation tests...");
  console.log("[test] Output directory:", testOutputDir);

  const testCases = [
    {
      name: "Simple circle",
      code: `\\begin{tikzpicture}
  \\draw (0,0) circle (1cm);
\\end{tikzpicture}`,
    },
    {
      name: "Rectangle with text",
      code: `\\begin{tikzpicture}
  \\draw[fill=blue!20] (0,0) rectangle (3,2);
  \\node at (1.5,1) {Hello};
\\end{tikzpicture}`,
    },
  ];

  for (const testCase of testCases) {
    try {
      console.log(`\n[test] Compiling: ${testCase.name}`);
      const result = await compileLatexToSvg(testCase.code, testOutputDir);
      console.log(`[test]   Hash: ${result.hash}`);
      console.log(`[test]   SVG Path: ${result.svgPath}`);
      console.log(`[test]   Was compiled: ${result.wasCompiled}`);

      if (existsSync(result.svgPath)) {
        const fs = await import("node:fs");
        const size = fs.statSync(result.svgPath).size;
        console.log(`[test]   ✓ SVG file exists (${size} bytes)`);
      } else {
        console.log(`[test]   ✗ SVG file does not exist!`);
      }

      // Test idempotency - compile again and verify it's cached
      console.log(`[test] Testing idempotency...`);
      const result2 = await compileLatexToSvg(testCase.code, testOutputDir);
      console.log(`[test]   Was compiled (2nd run): ${result2.wasCompiled}`);
      if (!result2.wasCompiled) {
        console.log(`[test]   ✓ Correctly skipped recompilation`);
      } else {
        console.log(`[test]   ✗ Should have skipped recompilation!`);
      }
    } catch (err) {
      console.error(`[test]   ✗ Error:`, err);
    }
  }

  console.log("\n[test] Tests complete!");
}

test();
