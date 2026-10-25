import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { toDisplayPath } from "../utils/display-path.js";
import {
  computeDebugImagePath,
  diagramFileName,
  diagramHashOf,
} from "./utils.js";

export interface TexDiagramLedgerOptions {
  /** Absolute path of the directory compiled tex diagrams are written to. */
  svgDir: string;
  /** Absolute path of the debug tex diagram image directory, when debug is on. */
  debugImageDir?: string;
  /** When `false`, compiled tex diagrams are never deleted. */
  removeOrphanedSvgs: boolean;
  command: "dev" | "build";
  /** Absolute path of the Astro project root, which messages print paths relative to. */
  rootDirPath: string;
}

/** What one render of a doc's `tex compile` blocks produced. */
export interface DocOutputs {
  /** Content hashes of the compiled tex diagrams the doc references. */
  hashes: string[];
  /** The `blockid` of every block that carries one, in document order. */
  blockIds: number[];
}

/** One in-progress render of a doc, from `beginDoc` to `recordDoc` or `abandonDoc`. */
export interface DocRender {
  readonly docPath: string;
  /** Order in which renders began; a later render of the same doc wins. */
  readonly seq: number;
}

/**
 * Owns the lifecycle of compiled tex diagrams and debug tex diagram images:
 * where they live, which doc references which, and when one is orphaned and
 * deleted.
 *
 * Dev keeps Starlight's content layer cache, so docs that weren't edited never
 * report what they reference. Dev therefore only deletes compiled tex diagrams
 * first written during the session, and leaves the full orphan sweep to build.
 * See docs/adr/0002-dev-keeps-content-cache-build-owns-orphan-sweep.md.
 */
export interface TexDiagramLedger {
  /** Absolute path of the directory compiled tex diagrams are written to. */
  readonly svgDir: string;
  /**
   * Where the debug tex diagram image for a block goes, or `undefined` when
   * debug is off.
   */
  debugImagePath(docPath: string, blockId: number): string | undefined;
  /** Prepares the output dirs. Call once, before any doc is rendered. */
  start(): Promise<void>;
  /**
   * Marks a doc as rendering. While any doc is rendering, orphans are held
   * back, so a doc that found a compiled tex diagram already on disk doesn't
   * lose it before it records its outputs.
   */
  beginDoc(docPath: string): DocRender;
  /**
   * Ends a render and records the doc's outputs, replacing its previous ones.
   * A doc with no `tex compile` blocks left is recorded with empty outputs.
   * Ignored if a later render of the same doc was already recorded. Once no
   * doc is rendering, deletes the outputs no doc references anymore.
   */
  recordDoc(render: DocRender, outputs: DocOutputs): Promise<void>;
  /**
   * Ends a render without recording it, e.g. when it threw. A no-op for a
   * render that was already recorded.
   */
  abandonDoc(render: DocRender): Promise<void>;
  /** Deletes every compiled tex diagram no doc references, when the mode allows. */
  sweep(): Promise<void>;
}

/** Which doc references which output, for one kind of output. */
class ReferenceIndex {
  private readonly byDoc = new Map<string, Set<string>>();

  /**
   * Sets a doc's references and returns the ones it dropped that no doc
   * references anymore.
   */
  reassign(docPath: string, refs: Set<string>): string[] {
    const previous = this.byDoc.get(docPath) ?? new Set<string>();
    if (refs.size > 0) this.byDoc.set(docPath, refs);
    else this.byDoc.delete(docPath);
    return [...previous].filter((ref) => !refs.has(ref) && !this.has(ref));
  }

  has(ref: string): boolean {
    for (const refs of this.byDoc.values()) {
      if (refs.has(ref)) return true;
    }
    return false;
  }
}

/** When compiled tex diagrams may be deleted, per mode. */
interface DiagramRules {
  start(): Promise<void>;
  /** Whether a diagram no doc references anymore may be deleted during the session. */
  deletesOnDrop(hash: string): boolean;
  /** Deletes every diagram `isReferenced` rejects, if the mode sweeps. */
  sweep(isReferenced: (hash: string) => boolean): Promise<void>;
}

async function listDir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function removeAll(paths: string[]): Promise<void> {
  await Promise.all(paths.map((path) => rm(path, { force: true })));
}

async function listDiagramHashes(svgDir: string): Promise<string[]> {
  return (await listDir(svgDir)).flatMap(
    (fileName) => diagramHashOf(fileName) ?? [],
  );
}

const keepDiagrams: DiagramRules = {
  start: async () => {},
  deletesOnDrop: () => false,
  sweep: async () => {},
};

/**
 * Dev: a cached doc may still show any diagram that was on disk at startup, so
 * only diagrams first written this session are deleted.
 */
function sessionOwnedRules(svgDir: string): DiagramRules {
  const onDiskAtStart = new Set<string>();
  return {
    async start() {
      for (const hash of await listDiagramHashes(svgDir)) {
        onDiskAtStart.add(hash);
      }
    },
    deletesOnDrop: (hash) => !onDiskAtStart.has(hash),
    sweep: async () => {},
  };
}

/** Build: every doc runs, so orphans are swept once at the end. */
function sweepAtEndRules(svgDir: string): DiagramRules {
  return {
    start: async () => {},
    deletesOnDrop: () => false,
    async sweep(isReferenced) {
      const orphans = (await listDiagramHashes(svgDir)).filter(
        (hash) => !isReferenced(hash),
      );
      await removeAll(
        orphans.map((hash) => join(svgDir, diagramFileName(hash))),
      );
      if (orphans.length > 0) {
        console.log(
          `[astro-latex-compile] Removed ${orphans.length} orphaned tex diagram${orphans.length === 1 ? "" : "s"}.`,
        );
      }
    },
  };
}

function diagramRulesFor(options: TexDiagramLedgerOptions): DiagramRules {
  if (!options.removeOrphanedSvgs) return keepDiagrams;
  return options.command === "dev"
    ? sessionOwnedRules(options.svgDir)
    : sweepAtEndRules(options.svgDir);
}

export function createLedger(
  options: TexDiagramLedgerOptions,
): TexDiagramLedger {
  const { svgDir, debugImageDir, rootDirPath } = options;
  const diagramRules = diagramRulesFor(options);
  // Build re-renders every doc, so every debug tex diagram image is
  // regenerated; dev keeps the ones cached docs produced earlier.
  const wipesDebugImagesAtStart = options.command === "build";
  const diagrams = new ReferenceIndex();
  const debugImages = new ReferenceIndex();
  const warnedDuplicateBlockIds = new Set<string>();

  let nextSeq = 0;
  const rendering = new Set<DocRender>();
  const latestRecordedSeq = new Map<string, number>();
  /** Orphans waiting for no doc to be rendering before they're deleted. */
  const heldDiagrams = new Set<string>();
  const heldImages = new Set<string>();

  function debugImagePath(docPath: string, blockId: number) {
    return debugImageDir
      ? computeDebugImagePath(debugImageDir, docPath, blockId)
      : undefined;
  }

  function warnOnDuplicateBlockIds(docPath: string, blockIds: number[]) {
    if (
      new Set(blockIds).size === blockIds.length ||
      warnedDuplicateBlockIds.has(docPath)
    ) {
      return;
    }
    warnedDuplicateBlockIds.add(docPath);
    const consequence = debugImageDir
      ? "only the last one's debug tex diagram image is kept"
      : "each blockid should be unique within a doc";
    console.warn(
      `[astro-latex-compile] ${toDisplayPath(rootDirPath, docPath)}: two or more tex compile blocks share a blockid; ${consequence}.`,
    );
  }

  /**
   * Deletes held orphans once no doc is rendering, re-checking each one, since
   * a doc recorded meanwhile may reference it again.
   */
  async function deleteHeldOrphans() {
    if (rendering.size > 0) return;
    const orphanedDiagrams = [...heldDiagrams].filter(
      (hash) => !diagrams.has(hash),
    );
    const orphanedImages = [...heldImages].filter(
      (path) => !debugImages.has(path),
    );
    heldDiagrams.clear();
    heldImages.clear();

    for (const hash of orphanedDiagrams) {
      console.warn(
        `[astro-latex-compile] Removing orphaned tex diagram: ${diagramFileName(hash)}`,
      );
    }
    for (const path of orphanedImages) {
      console.warn(
        `[astro-latex-compile] Removing orphaned debug tex diagram image: ${toDisplayPath(rootDirPath, path)}`,
      );
    }
    await removeAll([
      ...orphanedDiagrams.map((hash) => join(svgDir, diagramFileName(hash))),
      ...orphanedImages,
    ]);
  }

  return {
    svgDir,
    debugImagePath,

    async start() {
      await diagramRules.start();
      if (wipesDebugImagesAtStart && debugImageDir) {
        const images = (await listDir(debugImageDir)).filter((fileName) =>
          fileName.endsWith(".jpg"),
        );
        await removeAll(
          images.map((fileName) => join(debugImageDir, fileName)),
        );
      }
    },

    beginDoc(docPath) {
      const render: DocRender = { docPath, seq: nextSeq++ };
      rendering.add(render);
      return render;
    },

    async recordDoc(render, outputs) {
      if (!rendering.delete(render)) return;
      const { docPath, seq } = render;
      if (seq > (latestRecordedSeq.get(docPath) ?? -1)) {
        latestRecordedSeq.set(docPath, seq);
        warnOnDuplicateBlockIds(docPath, outputs.blockIds);

        const droppedDiagrams = diagrams.reassign(
          docPath,
          new Set(outputs.hashes),
        );
        for (const hash of droppedDiagrams) {
          if (diagramRules.deletesOnDrop(hash)) heldDiagrams.add(hash);
        }
        const droppedImages = debugImages.reassign(
          docPath,
          new Set(
            outputs.blockIds.flatMap((id) => debugImagePath(docPath, id) ?? []),
          ),
        );
        for (const path of droppedImages) heldImages.add(path);
      }
      await deleteHeldOrphans();
    },

    async abandonDoc(render) {
      if (!rendering.delete(render)) return;
      await deleteHeldOrphans();
    },

    sweep: () => diagramRules.sweep((hash) => diagrams.has(hash)),
  };
}
