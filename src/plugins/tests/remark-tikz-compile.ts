/**
 * Standalone test for TikZ compilation.
 * Run with: npx tsx src/plugins/tests/remark-tikz-compile.ts
 */
import { compileTikzToSvg } from "../remark-tikz-compile/compile.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const testOutputDir = resolve("test-tikz-output");

async function test() {
  console.log("[test] Starting TikZ compilation tests...");
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
      const result = compileTikzToSvg(testCase.code, testOutputDir);
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
      const result2 = compileTikzToSvg(testCase.code, testOutputDir);
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
