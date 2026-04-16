#!/usr/bin/env node

import { readdir, readFile, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  hashLatexCode,
  LATEX_BLOCK_REGEX,
} from "../../src/plugins/astro-latex-compile/utils.js";

// Parse CLI arguments
const args = process.argv.slice(2);
let svgDir: string | null = null;
let docsDir = "src/content/docs";
let checkMode = false;
let deleteMode = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--svg-dir" && i + 1 < args.length) {
    svgDir = args[++i];
  } else if (args[i] === "--docs-dir" && i + 1 < args.length) {
    docsDir = args[++i];
  } else if (args[i] === "--check") {
    checkMode = true;
  } else if (args[i] === "--delete") {
    deleteMode = true;
  }
}

// Validate arguments
if (!svgDir) {
  console.error("Error: --svg-dir is required");
  process.exit(1);
}

if (!checkMode && !deleteMode) {
  console.error("Error: either --check or --delete must be specified");
  process.exit(1);
}

// Resolve paths
const svgDirPath = resolve(svgDir);
const docsDirPath = resolve(docsDir);

async function scanMarkdownForHashes(
  dir: string,
  hashes: Set<string>,
): Promise<void> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await scanMarkdownForHashes(fullPath, hashes);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".md") || entry.name.endsWith(".mdx"))
      ) {
        const content = await readFile(fullPath, "utf-8");
        const latexBlockRegex = new RegExp(
          LATEX_BLOCK_REGEX.source,
          LATEX_BLOCK_REGEX.flags,
        );
        const matches = content.matchAll(latexBlockRegex);

        for (const match of matches) {
          const latexCode = match[1];
          const hash = hashLatexCode(latexCode);
          hashes.add(hash);
        }
      }
    }
  } catch (err) {
    console.error(`Error scanning directory ${dir}:`, err);
    throw err;
  }
}

async function findOrphanedSvgs(
  svgPath: string,
  usedHashes: Set<string>,
): Promise<string[]> {
  const orphaned: string[] = [];

  try {
    const entries = await readdir(svgPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".svg")) {
        // Extract hash from filename (format: hash.svg)
        const hash = entry.name.replace(".svg", "");
        if (!usedHashes.has(hash)) {
          orphaned.push(join(svgPath, entry.name));
        }
      }
    }
  } catch (err) {
    if ((err as { code: string }).code === "ENOENT") {
      console.warn(`SVG directory does not exist: ${svgPath}`);
      return [];
    }
    throw err;
  }

  return orphaned;
}

async function main(): Promise<void> {
  try {
    // Scan markdown files for hashes
    console.log(`Scanning markdown files in ${docsDirPath}...`);
    const usedHashes = new Set<string>();
    await scanMarkdownForHashes(docsDirPath, usedHashes);
    console.log(`Found ${usedHashes.size} unique tex compile blocks\n`);

    // Find orphaned SVGs
    console.log(`Scanning SVG directory ${svgDirPath}...`);
    const orphanedSvgs = await findOrphanedSvgs(svgDirPath, usedHashes);

    if (orphanedSvgs.length === 0) {
      console.log("No orphaned SVGs found ✓");
      process.exit(0);
    }

    console.log(`\nFound ${orphanedSvgs.length} orphaned SVG(s):`);
    orphanedSvgs.forEach((svg) => {
      const filename = svg.split("/").pop();
      console.log(`  - ${filename}`);
    });

    if (checkMode) {
      console.log("\n(Use --delete to remove these files)");
      process.exit(0);
    }

    if (deleteMode) {
      console.log("\nDeleting orphaned SVGs...");
      let deleted = 0;
      for (const svg of orphanedSvgs) {
        try {
          await unlink(svg);
          deleted++;
          console.log(`  ✓ Deleted ${svg.split("/").pop()}`);
        } catch (err) {
          console.error(`  ✗ Failed to delete ${svg}:`, err);
        }
      }
      console.log(`\nDeleted ${deleted}/${orphanedSvgs.length} files`);
      process.exit(0);
    }
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

main();
