// The option type is copied here, not shared, so astroLocalLinks' own options can change freely.
type TRehypeValidateLinksOptions = {
  skipPatterns?: string[];
};

/**
 * @deprecated Replaced by `astroLocalLinks({ validate: { skipPatterns } })`, which also
 * validates `<img src>`, raw HTML and component output. Calling this throws.
 */
export function rehypeValidateLinks(
  _options?: TRehypeValidateLinksOptions,
): never {
  throw new Error(
    "[rehype-validate-links] rehypeValidateLinks has been replaced by `astroLocalLinks`. " +
      "Remove it from `markdown.rehypePlugins` and add " +
      "`astroLocalLinks({ validate: { skipPatterns } })` to `integrations` instead. " +
      "See the starlight-cannoli-plugins README.",
  );
}
