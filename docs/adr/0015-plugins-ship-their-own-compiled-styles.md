---
status: accepted
---

# Plugins ship their own compiled styles

A plugin's styles apply as soon as the plugin is registered. The site doesn't have to add anything to `customCss` or install `sass`. Styles are still written in SCSS, and `scripts/build-styles.ts` compiles every non-partial `.scss` under `src/plugins/**` and `src/styles/**` to its matching path in `dist/` during `lib:build`, after tsup. Each plugin imports its compiled CSS with `injectScript("page-ssr", pluginStylesImportScript([...]))`, so Vite bundles it into the page's `<link>` and dedupes it. When run from source (the demo site), a plugin imports its `.scss` directly.

Styles are kept DRY in four ways:

- **Shared partials** (`src/styles/_*.scss`) hold Sass variables, mixins and placeholders. They emit no CSS, so `@use`-ing them from many entries doesn't duplicate output.
- **Design tokens** are `--cannoli-*` custom properties declared once in `tokens.css`. Plugin styles and plugin scripts (inline styles use `var(--cannoli-...)`) read them, and the utility stylesheet can too. Every plugin that needs them imports `tokens.css`, and Vite emits it once.
- **Plugin styles** live next to the plugin that emits the markup. A **shared component** moves to `src/styles/components/` only once a second plugin emits the class. Each plugin imports it, and Vite emits it once.
- A plugin may use Starlight's classes, but never a class from the utility stylesheet or from another plugin. A drift test enforces this for classes set through `className`, `classList`, `setAttribute("class", ...)` or a `class="..."` attribute.

Plugin styles open with `@layer starlight, cannoli;` and sit in `@layer cannoli`. That puts them above every Starlight layer and below any unlayered CSS, so a site's `customCss` always wins, whichever file the bundle puts first.

The utility stylesheet is shipped as compiled CSS through a single `./styles/utilities.css` export and stays unlayered, because its Bootstrap rules use `!important`, which inverts inside layers. Styles the demo site uses only for itself stay out of the package.

## Consequences

- Breaking release: `./styles/*` and `main.scss` are gone with no shim, and undocumented plugin classes get a `cannoli-` prefix (`details-wrapper`, `page-src-*`). A class family that README documents keeps its names (`tabbed-content-*`, `toggle-checkbox-btn`, `yt-icon`, `tex-compiled`, `fw-supreme`).
- Consumers no longer need `sass`.
- `tokens.css`, shared components and plugin CSS are build outputs with no export, like `page-script`.
- `expressive-code-emphasis` keeps its `baseStyles` (ADR 0014).
- A plugin with options, such as `starlight-dom-patches`, splits its CSS into files and imports only the ones its options call for. A file that two options need (`action-panel`) is imported once, and an option can have a file for when it's off (`details-height-unlimited`).
- In a production build the minifier merges every plugin's `@layer cannoli` block into one and keeps `starlight` declared ahead of it.

## Considered Options

- **SCSS in the `./styles` export, added to `customCss` by the site.** Rejected, as in ADR 0014: plugins break silently when it's left out, and the site needs `sass`.
- **Runtime `<style>` injection through `injectScript("page")`.** The earlier approach. Rejected: the styles aren't bundled or deduped, and they flash in after load.
- **Adding CSS to Starlight's `customCss` through `updateConfig`.** Rejected: it only works under Starlight (ADR 0014).
- **Every component style in `src/styles/components/` from the start.** Rejected: styles end up away from the code that emits the markup, and `components/` stops meaning "shared". Promoting a style later is one file move, because the delivery is the same.
- **Unlayered plugin styles.** Rejected: they tie with the site's `customCss`, so whether a user override wins depends on bundle order.
