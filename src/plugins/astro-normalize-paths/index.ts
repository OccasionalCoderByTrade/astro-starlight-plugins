import type { AstroIntegration } from "astro";

/**
 * @deprecated Replaced by `astroLocalLinks({ normalize: true })`, which also normalizes in
 * dev. Calling this throws.
 */
export function astroNormalizePaths(): AstroIntegration {
  throw new Error(
    "[astro-normalize-paths] astroNormalizePaths has been replaced by `astroLocalLinks`. " +
      "Replace `astroNormalizePaths()` in `integrations` with `astroLocalLinks()`. " +
      "See the starlight-cannoli-plugins README.",
  );
}
