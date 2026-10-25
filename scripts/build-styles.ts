// Compiles the shipped stylesheets into dist/ (ADR 0015). Runs after tsup in
// `npm run lib:build`, since tsup wipes dist/ first.
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { compileAsync } from "sass-embedded";
import { stylesheetBuildTargets } from "./stylesheet-build-targets.js";

const rootDirPath = fileURLToPath(new URL("..", import.meta.url));
const srcDirPath = join(rootDirPath, "src");
const distDirPath = join(rootDirPath, "dist");

const srcRelativeFilePaths = (
  await readdir(srcDirPath, { recursive: true })
).map((relativeFilePath) => relativeFilePath.split(sep).join("/"));

for (const buildTarget of stylesheetBuildTargets(srcRelativeFilePaths)) {
  const compileResult = await compileAsync(
    join(srcDirPath, buildTarget.sourceRelativeFilePath),
    { quietDeps: true },
  );
  const outputFilePath = join(distDirPath, buildTarget.outputRelativeFilePath);
  await mkdir(dirname(outputFilePath), { recursive: true });
  await writeFile(outputFilePath, compileResult.css);
  console.log(`styles: dist/${buildTarget.outputRelativeFilePath}`);
}
