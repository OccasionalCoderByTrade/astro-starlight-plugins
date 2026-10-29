import { type MetaOption, MetaOptions } from "@expressive-code/core";
import type { LatexCompileOptions } from "./index.js";
import type { TexCompileFailure } from "./tex-compile-error.js";
import {
  COMPILE_MODES,
  type CompileMode,
  DEFAULT_COMPILE_MODE,
} from "./utils.js";

const DEFAULT_ALT_TEXT = "LaTeX diagram";

/**
 * Whether a code block with this language and meta is a `tex compile` block:
 * a `tex` or `latex` block with a `compile` or `compile=true` meta option.
 * `compile=false` or any other value leaves it a plain code block.
 */
export function isTexCompileBlock(
  lang: string | null | undefined,
  meta: string | null | undefined,
): boolean {
  return (
    (lang === "tex" || lang === "latex") &&
    new MetaOptions(meta ?? "")
      .list(["compile"])
      .some((metaOption) => metaOption.value === true)
  );
}

/** What a `tex compile` block renders with, after its meta options and the site options. */
export interface TTexCompileMetaOptions {
  compileMode: CompileMode;
  /** Classes for the inlined `<svg>` besides `tex-compiled`: the block's `class`, else `svgClassname`. */
  classNames: string[];
  /** The `<svg>`'s accessible label: the block's `alt`, else a generic one. */
  altText: string;
  /** The block's `alt`, if it wrote a non-empty one, shown in the tex diagram zoom view. */
  caption: string | undefined;
  isZoomable: boolean;
}

/**
 * A `tex compile` block's meta options, resolved against the site options,
 * or the tex compile error for its invalid ones. `blockId` is kept either way,
 * so an invalid block still gets its debug tex diagram image.
 */
export type TResolvedMetaOptions = { blockId: number | undefined } & (
  | { ok: true; metaOptions: TTexCompileMetaOptions }
  | { ok: false; failure: TexCompileFailure }
);

/** A `class` or `alt` value, which a block can only give as text. */
function invalidTextValue(
  metaOption: MetaOption,
  example: string,
): string | undefined {
  return metaOption.kind !== "string"
    ? `Invalid ${metaOption.key} "${metaOption.raw.trim()}". Give it a quoted value, such as ${example}.`
    : undefined;
}

/**
 * The meta options a `tex compile` block reads, each with the reason it is a
 * tex compile error when given once, if it is one. Errors are listed in this
 * order.
 */
const invalidReasonByKey: Record<
  string,
  (metaOption: MetaOption) => string | undefined
> = {
  compile: () => undefined,
  mode(metaOption) {
    if (
      metaOption.kind === "string" &&
      (COMPILE_MODES as readonly string[]).includes(metaOption.value)
    ) {
      return undefined;
    }
    const allowedModes = COMPILE_MODES.map((mode) => `mode=${mode}`).join(", ");
    return `Unknown compile mode "${metaOption.raw.trim()}". Use one of: ${allowedModes}.`;
  },
  zoom(metaOption) {
    return metaOption.kind !== "boolean"
      ? `Unknown zoom value "${metaOption.raw.trim()}". Use zoom, zoom=true or zoom=false.`
      : undefined;
  },
  class: (metaOption) => invalidTextValue(metaOption, 'class="my-diagram"'),
  alt: (metaOption) => invalidTextValue(metaOption, 'alt="A labelled graph"'),
  blockid(metaOption) {
    return parseBlockId(metaOption) === undefined
      ? `Invalid blockid "${metaOption.raw.trim()}". Use a whole number, such as blockid=1.`
      : undefined;
  },
};

/** The `blockid`'s number, if it is a whole number. */
function parseBlockId(metaOption: MetaOption): number | undefined {
  return metaOption.kind === "string" && /^\d+$/.test(metaOption.value)
    ? Number(metaOption.value)
    : undefined;
}

/**
 * Resolves a `tex compile` block's meta options against the site options: the
 * block's own meta option wins, then the site option, then the default.
 * Meta options the block doesn't read are ignored.
 */
export function resolveMetaOptions(
  meta: string | null | undefined,
  siteOptions: Pick<LatexCompileOptions, "svgClassname" | "zoom">,
): TResolvedMetaOptions {
  const metaOptions = new MetaOptions(meta ?? "");
  const invalidReasons = Object.entries(invalidReasonByKey).flatMap(
    ([key, findInvalidReason]) => {
      const occurrences = metaOptions.list([key]);
      if (occurrences.length === 0) return [];
      if (occurrences.length > 1) {
        return [`${key} is given more than once. Give each meta option once.`];
      }
      return findInvalidReason(occurrences[0]) ?? [];
    },
  );
  const blockIdOccurrences = metaOptions.list(["blockid"]);
  const blockId =
    blockIdOccurrences.length === 1
      ? parseBlockId(blockIdOccurrences[0])
      : undefined;
  if (invalidReasons.length > 0) {
    return {
      ok: false,
      blockId,
      failure: { kind: "invalid-block", reason: invalidReasons.join("\n") },
    };
  }

  const blockClass = metaOptions.getString("class");
  const blockAltText = metaOptions.getString("alt");
  return {
    ok: true,
    blockId,
    metaOptions: {
      compileMode:
        (metaOptions.getString("mode") as CompileMode | undefined) ??
        DEFAULT_COMPILE_MODE,
      classNames: (blockClass ?? siteOptions.svgClassname ?? "")
        .split(/\s+/)
        .filter(Boolean),
      altText: blockAltText ?? DEFAULT_ALT_TEXT,
      caption: blockAltText || undefined,
      isZoomable: metaOptions.getBoolean("zoom") ?? siteOptions.zoom ?? false,
    },
  };
}
