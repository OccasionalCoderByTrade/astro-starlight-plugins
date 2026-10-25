---
status: accepted
---

# Expressive Code emphasis inlines its font

`expressiveCodeEmphasis` ships its `.fw-supreme` styles in the Expressive Code plugin's own `baseStyles`, so registering the plugin is all a site needs. The font has to be Source Code Pro at weight 900, since it is the only one bold enough for what the emphasis needs. It is inlined as base64 woff2 `@font-face` rules, one per subset (latin and latin-ext only). Expressive Code nests every plugin's `baseStyles` inside its wrapper class. `@font-face` gets unwrapped back to the top level, but `@import url(...)` doesn't, and an `@import` nested in a rule is invalid CSS. That rules out the Google Fonts stylesheet link that an earlier version of the plugin tried. `npm run vendor:fonts` (`scripts/vendor-source-code-pro.mjs`) regenerates the inlined font from Google Fonts.

## Consequences

- Sites that register the plugin carry about 38 KB of font in Expressive Code's stylesheet, even on pages without an `emph` block. That stylesheet is one cached file per site.
- Characters outside latin and latin-ext in an emphasized term fall back to the browser's monospace font.
- The package's `./styles` export no longer carries `.fw-supreme` or the Google Fonts import.
- The OFL notice travels with the font as a legal comment in the generated module.

## Considered Options

- **SCSS in the `./styles` export.** Rejected: it only works if users add `main.scss` to `customCss` and install `sass`, and nothing tells them when they forget.
- **`@font-face` pointing at Google's gstatic URLs.** Rejected: it's a third-party request (privacy, offline), and the URLs are versioned, so they aren't a stable contract.
- **`@fontsource/source-code-pro` read at runtime.** Rejected: same output as vendoring, but with an extra dependency and path resolution at runtime.
- **A Starlight plugin wrapper that adds a CSS file to `customCss`.** Rejected: it changes the public API and only works under Starlight.
