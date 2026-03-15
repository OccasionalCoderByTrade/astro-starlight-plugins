import * as fs from "fs";
import * as path from "path";

type TSidebar = TSidebarItem[];

type TSidebarItem =
  | {
      label: string;
      slug: string;
    }
  | {
      label: string;
      items: TSidebarItem[];
    };

function iterDir(dirPath: string): Array<string> {
  const entries = fs.readdirSync(dirPath);
  return entries.map((entry) => path.join(dirPath, entry));
}

function isDir(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isFileExists(filePath: string): boolean {
  try {
    fs.statSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function getFileLabel(filePath: string): string {
  const baseName = path.basename(filePath, path.extname(filePath));
  return baseName === "index" ? "Home" : baseName;
}

function getSlug(file: string, rootDir: string): string {
  // Normalize to avoid mismatches like trailing slashes
  const normalizedRoot = rootDir.replace(/[\\/]+$/, "");

  if (file.startsWith(normalizedRoot)) {
    let slug = file.slice(normalizedRoot.length);
    if (!slug.startsWith("/")) {
      slug = "/" + slug;
    }

    return slug;
  }

  return file;
}

function collectSidebarItems(rootDir: string, dir: string): TSidebarItem[] {
  const sidebarSingleItems: TSidebarItem[] = [];

  for (const item of iterDir(dir)) {
    if (isDir(item)) {
      continue;
    }

    if (isFile(item) && /\bindex\.mdx?/.test(item)) {
      sidebarSingleItems.push({
        label: getFileLabel(item),
        slug: getSlug(item, rootDir),
      });
    }
  }

  let sidebarGroupedItems: TSidebarItem[] = [];

  for (const item of iterDir(dir)) {
    if (!isDir(item)) continue;

    if (sidebarGroupedItems.length !== 0) {
      sidebarGroupedItems = [
        ...sidebarGroupedItems,
        ...collectSidebarItems(rootDir, dir),
      ];
    } else {
      sidebarGroupedItems = [
        ...sidebarGroupedItems,
        ...collectSidebarItems(rootDir, dir),
      ];
    }
  }

  return [...sidebarSingleItems, ...sidebarGroupedItems];
}

function getIndexMdSidebarItems(
  directory: string,
  dirnameDeterminesLabel: boolean,
): TSidebarItem[] {
  const sidebar = collectSidebarItems(directory, directory);
}

(() => {
  const path = "src/content/docs/reference";
  const items = getIndexMdSidebarItems(path, true);
  // console.log(JSON.stringify(items, null, 2));
})();
