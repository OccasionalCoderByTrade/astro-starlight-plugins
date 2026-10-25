# 01: Extract the processor registration into a shared helper, and move heading IDs onto it

**Status:** ready-for-agent

**Blocked by:** None (can start immediately)

**What to build:** move the "register into the active Markdown processor" logic out of `astroVscodeHeadingIds` (`src/plugins/astro-vscode-heading-ids/index.ts`) into `src/plugins/utils/markdown-processor-registration.ts`, so `astroLatexCompile` can use it in ticket 02. ADR 0017 states the rule.

Shape:

- `createProcessorRegistration({ pluginName, remarkPlugin, satteriPlugin })` returns:
  - `register(config, updateConfig)`, called from the plugin's own `astro:config:setup`:
    - `unified`: push `remarkPlugin` into `processor.options.remarkPlugins`.
    - `satteri`: push `satteriPlugin` into `processor.options.mdastPlugins`.
    - No processor (before Astro 7): `updateConfig({ markdown: { remarkPlugins: [remarkPlugin] } })`. Never spread the existing list.
    - Anything else: throw, naming the plugin and the processor.
  - `assertStillRegistered(config)`, called from the plugin's own `astro:config:done`: throw if the registered plugin is no longer in the processor's list (or in `markdown.remarkPlugins` before Astro 7).
- `remarkPlugin` may be a `[attacher, options]` tuple. Ticket 02 needs that to carry `texInputsHash`. The `config:done` check must find the tuple too.
- Each plugin keeps its own hooks object and only calls these two functions.

`astroVscodeHeadingIds` behaves exactly as before. Its error messages stay the same apart from coming from the helper.

**Tests:**

- Unit tests for the helper: `unified`, `satteri`, no processor (exactly one entry added, existing entries not duplicated), unsupported processor, processor replaced before `config:done`, tuple form.
- Keep heading IDs' registration tests (`src/plugins/astro-vscode-heading-ids/index.test.ts`) passing against the helper.

**Done when:** `npm test` and `npm run lib:build` pass. ADR 0017 is already written.
