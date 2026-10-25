# 01: Shared processor registration helper, with heading IDs moved onto it

**What to build:** a prefactor that makes tickets 02 and 03 easy. The "register into the active Markdown processor" logic moves out of `astroVscodeHeadingIds` into a shared helper in the plugins' utils, as ADR 0017 describes. Site owners see no change: VS Code heading IDs behave exactly as before, on either processor.

The helper is `createProcessorRegistration({ pluginName, remarkPlugin, satteriPlugin })`. It returns two functions, and each plugin calls them from its own hooks:

- `register(config, updateConfig)`, from `astro:config:setup`:
  - `unified`: push the remark plugin into the processor's `remarkPlugins`.
  - `satteri`: push the mdast plugin into the processor's `mdastPlugins`.
  - No processor (before Astro 7): `updateConfig` with a `remarkPlugins` list holding only this plugin. Never spread the existing list.
  - Anything else: throw, naming the plugin and the processor.
- `assertStillRegistered(config)`, from `astro:config:done`: throw if the plugin is no longer in the active processor's list, or in `markdown.remarkPlugins` before Astro 7.

The remark plugin may be an `[attacher, options]` tuple, which ticket 02 needs. The `config:done` check must find it by identity.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] `astroVscodeHeadingIds` registers only through the helper. It keeps its own hooks and no longer contains processor branching.
- [x] Heading IDs' integration tests pass unchanged in what they assert, under both processors.
- [x] Heading IDs' integration tests cover the no-processor fallback (exactly one entry added, existing entries not duplicated), an unsupported processor (startup throw), and a replaced processor (`config:done` throw).
- [x] Error messages read the same as before, with the plugin name filled in by the helper.
- [x] No unit tests target the helper directly. It's tested through the integrations (spec, Testing Decisions).
- [x] `npm test` and `npm run lib:build` pass.

## Comments

- Error wording change, on purpose: heading IDs' "replaced `markdown.processor`" error used to end with "so headings won't get VS Code heading IDs". The helper words it generically for every plugin, "so <exportName> won't run" (here "so astroVscodeHeadingIds won't run"), so both plugins' errors read the same apart from the name (spec story 23). The tests match on the shared prefix, so they didn't need to change.
- Tuple match: Astro's `validateConfigRefined` re-parses `markdown.remarkPlugins` after `astro:config:setup` and copies each `[attacher, options]` tuple, so before Astro 7 the `config:done` check can't find a tuple by identity, as the ticket asked. It matches a tuple by its attacher (`entry[0] === attacher`) instead. A bare attacher, and anything in `processor.options` (which Astro keeps by reference), is still matched by identity.
- Review follow-up: the helper now takes an explicit `exportName` option instead of deriving it from `pluginName` with a regex.
