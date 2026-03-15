import { cp, mkdir, rm, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC_DIR_ROOT = "public/";
const SRC_DOCS_ROOT = "src/content/docs/";

/**
 * Sync txt files from src/content/docs to public/
 * This allows any local files in docs/ to be served by the web server
 */
export async function syncDocsToPublic() {
  const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
  const src = resolve(root, SRC_DOCS_ROOT);
  const dest = resolve(root, PUBLIC_DIR_ROOT);

  await mkdir(dest, { recursive: true });

  // delete all directories in public/ except static/
  const items = await readdir(dest);
  for (const item of items) {
    const itemPath = resolve(dest, item);
    const stats = await stat(itemPath);

    if (item === "static" || !stats.isDirectory()) {
      continue;
    }

    await rm(itemPath, { recursive: true, force: true });
  }

  await cp(src, dest, { recursive: true });
  console.log(
    `Synced ${SRC_DOCS_ROOT} → ${PUBLIC_DIR_ROOT} (preserved public/static/)`
  );
}

(async () => {
  await syncDocsToPublic();
})();
