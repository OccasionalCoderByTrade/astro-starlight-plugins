# Spec: LaTeX compile registers into the active Markdown processor

**Status:** resolved

## Problem Statement

A site owner adds `astroLatexCompile` to an Astro 7 site, writes a `tex compile` block, and sees the LaTeX source rendered as a plain code block instead of a compiled tex diagram. No error is raised. Astro only prints a generic deprecation warning about `markdown.remarkPlugins` among the startup output.

This happens because the integration registers its transformer through `markdown.remarkPlugins`, which Astro 7 deprecated. Astro still runs legacy remark plugins, but only when the site ends up on the `unified` processor. Sätteri is the default, and a site gets `unified` only if its own config already has legacy remark or rehype plugins (such as `remarkMath`), or if it sets `processor: unified()`. So whether LaTeX compile works depends on unrelated config. The demo site only worked because of `remarkMath`. Removing its `markdown` block makes every `tex compile` block render as raw code.

There's a second, quieter problem. When LaTeX compile registers itself, it copies the site's existing remark plugins into its update. Astro concatenates arrays when merging, so each of the site's own remark plugins runs twice on every doc. This was confirmed at runtime with `remarkMath`.

`astroVscodeHeadingIds` already solved the first problem for itself (ADR 0016), but that logic lives inside that one plugin.

## Solution

`astroLatexCompile` works on whichever Markdown processor the site uses, with no extra config:

- On `unified`, it runs as a remark plugin.
- On Sätteri (Astro 7's default), it runs as an mdast plugin.
- Before Astro 7, where there's no processor, it falls back to `markdown.remarkPlugins`, adding only itself.

Any other processor, or a processor that a later integration replaces, fails `astro dev` and `astro build` at startup with a message that names the plugin and says what to do. LaTeX compile never silently renders `tex compile` blocks as code again, and it no longer duplicates the site's own remark plugins.

The registration logic moves into one helper that both `astroLatexCompile` and `astroVscodeHeadingIds` use, as ADR 0017 sets out. Behaviour for site owners is the same across the two plugins.

## User Stories

1. As a site owner on Astro 7's default processor, I want `tex compile` blocks to render as compiled tex diagrams, so that I don't have to switch processors to use LaTeX compile.
2. As a site owner who set `processor: unified()`, I want `tex compile` blocks to keep rendering as compiled tex diagrams, so that my existing setup keeps working.
3. As a site owner who set `processor: satteri()` explicitly, I want `tex compile` blocks to render as compiled tex diagrams, so that the explicit choice behaves like the default.
4. As a site owner with legacy `markdown.remarkPlugins` such as `remarkMath`, I want each of my remark plugins to run once per doc, so that builds don't do duplicate work or produce doubled output.
5. As a site owner on Astro 5 or 6, I want LaTeX compile to keep working through `markdown.remarkPlugins`, so that I can upgrade the package without upgrading Astro.
6. As a site owner on Astro 5 or 6, I want LaTeX compile to add only itself to `markdown.remarkPlugins`, so that my own remark plugins aren't registered twice.
7. As a site owner using a third-party Markdown processor, I want `astro dev` and `astro build` to fail at startup with a message that names the processor and the supported ones, so that I find out immediately instead of shipping raw LaTeX.
8. As a site owner whose integration list has another integration after LaTeX compile that replaces `markdown.processor`, I want startup to fail with a message saying so, so that I know to configure the processor in `markdown.processor` instead.
9. As a site owner, I want LaTeX compile's position in `integrations` not to matter, so that I can order integrations however I like.
10. As a site owner on either processor, I want a tex compile error shown in the page in place of the diagram in dev, so that I see the error where the block is.
11. As a site owner on either processor, I want a tex compile error to report the block's `file:line` in the original source, frontmatter included, so that I can jump straight to it.
12. As a site owner on either processor, I want `astro build` to fail at the end with every tex compile error listed, so that broken diagrams never deploy.
13. As a site owner on either processor, I want a missing TeX tool to stop `astro dev` and fail `astro build`, as it does today, so that the toolchain behaviour doesn't depend on the processor.
14. As a site owner on either processor, I want orphaned tex diagrams cleaned up after a build, so that unused SVGs don't pile up.
15. As a site owner on either processor, I want a debug tex diagram image written for each block with a `blockid`, and only the last block's image kept when two blocks in a doc share one, so that debug output works the same everywhere.
16. As a site owner on either processor, I want the `class`, `alt` and `mode` meta options on a `tex compile` block to work as they do today, so that my docs don't need changes.
17. As a site owner on either processor, I want blocks in a doc to compile in parallel, so that switching processors doesn't slow builds down.
18. As a site owner on either processor, I want changing a tex input file to recompile every compiled tex diagram on the next dev start or build, so that diagrams never show stale macros.
19. As a site owner using MDX on either processor, I want `tex compile` blocks in `.mdx` docs to render as compiled tex diagrams, so that MDX docs aren't left out.
20. As a site owner using Markdoc, I understand that `.mdoc` docs aren't processed by either processor's plugins, so that I don't expect diagrams there.
21. As a site owner on Sätteri, I want the compiled tex diagram inlined as the same `<svg>` markup that `unified` produces, so that styles and accessibility attributes are identical.
22. As a site owner using `astroVscodeHeadingIds`, I want heading IDs to behave exactly as before, so that moving to the shared helper doesn't change my VS Code heading IDs.
23. As a site owner using both plugins, I want their startup errors for an unsupported or replaced processor to read the same way apart from the plugin name, so that I recognise the problem in either.
24. As a maintainer adding a future Markdown plugin, I want one helper that registers a remark adapter and an mdast adapter into the active processor, so that I don't reimplement the processor branching.
25. As a maintainer, I want the reason for this registration rule recorded in an ADR, so that nobody goes back to `markdown.remarkPlugins`.
26. As a maintainer, I want the LaTeX compile logic to have no knowledge of either processor, so that each processor's adapter stays thin and both stay in step.
27. As a maintainer, I want the README's LaTeX compile section to state which processors are supported and when startup fails, so that site owners don't need to read the ADR.

## Implementation Decisions

- **Shared registration helper.** A new module in the plugins' shared utils exposes `createProcessorRegistration({ pluginName, remarkPlugin, satteriPlugin })`. It returns two functions, and each plugin calls them from its own hooks:
  - `register(config, updateConfig)`, from `astro:config:setup`:
    - `unified`: push the remark plugin into the processor's `remarkPlugins`.
    - `satteri`: push the mdast plugin into the processor's `mdastPlugins`.
    - No processor (before Astro 7): `updateConfig` with a `remarkPlugins` list holding only this plugin.
    - Anything else: throw.
  - `assertStillRegistered(config)`, from `astro:config:done`: throw if the registered plugin is no longer in the active processor's list, or in `markdown.remarkPlugins` before Astro 7.
- The remark plugin may be an `[attacher, options]` tuple, and the `config:done` check finds it by identity.
- Plugins keep full control of their own hooks. The helper owns only the processor branching and the error messages.
- **Heading IDs.** `astroVscodeHeadingIds` moves onto the helper. Its behaviour and error message wording stay the same, apart from the plugin name being filled in by the helper.
- **LaTeX compile split into a core and two adapters.**
  - The core doesn't know about either processor. Per doc, it:
    - finds `tex compile` blocks
    - works out each block's compile mode, `blockid`, `class` and `alt`
    - compiles all blocks in parallel
    - applies the "last `blockid` wins" rule for debug tex diagram images
    - produces one HTML string per block, either the inlined compiled tex diagram or the tex compile error
    - drives the ledger: begin, record, and always abandon, even when something throws
  - The remark adapter walks the tree and splices the HTML in, as today.
  - The Sätteri adapter is a factory entry that reads the doc's `fileURL` per document. A `before` hook collects and compiles the blocks, a `code` visitor replaces each block with raw HTML (MDX expressions off), and an `after` hook records the doc in the ledger.
- **Cache invalidation.** The tex inputs hash stays in the config Astro hashes to invalidate the content layer cache. Under `unified` it's the options of the `[attacher, options]` tuple. Under Sätteri it's a plain field on the mdast plugin object. Astro's config digest keeps plain data and drops functions, so both survive. Dev still restarts when a tex input file changes.
- **Line numbers.** Both processors receive the doc body without frontmatter, so the existing frontmatter offset applies to both. The Sätteri adapter gets the file path from `fileURL`.
- **Errors.** An unsupported processor and a replaced processor are startup faults: they throw in both dev and build (ADR 0008). Tex compile errors keep their existing per-page behaviour (ADR 0006).
- **No duplicated user plugins.** No registration path copies the site's existing plugin list.
- **Public API unchanged.** `astroLatexCompile` options and exports don't change. ADR 0001 still holds: no standalone remark or Sätteri export.
- **Docs.** ADR 0017 (already written) records the registration rule, and ADR 0016 points to it. The README's LaTeX compile section gets a processor support paragraph matching the heading IDs one.
- **Versioning.** No version bump. This lands on the road to 4.0.0.

## Testing Decisions

- **One seam: the integration run against a real processor.** A test:
  1. builds `unified()` or `satteri()`
  2. runs the integration's `astro:config:setup` and `astro:config:done` hooks with that processor in `config.markdown`
  3. renders Markdown through the processor's renderer
  4. checks the rendered HTML and what the integration reports: the build failing at `astro:build:done`, and ledger effects on disk such as SVGs written and orphans removed
- **No other seams.** There are no unit tests for the shared helper, and no direct tests of the core or the adapters. The helper's cases (tuple form, pre-Astro-7 fallback, unsupported processor, replaced processor) are tested through the two integrations.
- A good test checks external behaviour only: rendered HTML, thrown errors, files on disk, build failure messages. It never checks which list an adapter was pushed into, or the shape of internal objects.
- **Both processors.** Cases run under both with `describe.each`.
  - LaTeX compile covers at least: a compiled tex diagram, a tex compile error with the right `file:line` (frontmatter included), the "last `blockid` wins" debug image rule, ledger recording, and `class`/`alt`/`mode` meta.
- **Registration cases.** Each integration covers: an unsupported processor throws at startup, a replaced processor throws at `config:done`, and the pre-Astro-7 fallback adds exactly one entry.
- **Existing tests.** Tests that call the LaTeX compile transformer directly move up to this seam. Tests that need the TeX toolchain stay skipped when it's missing. The tex compile error rendering mock stays where it isolates TeX output.
- **Prior art.** The heading IDs integration tests already use this seam with `describe.each` over both processors and the config hook runner. LaTeX compile's existing integration tests (the setup runner with a temporary project) show how the build-failure and tex input dir cases are driven.
- **Manual check.** On the demo site, `tex compile` blocks render as compiled tex diagrams with the `markdown` block removed (Sätteri) and restored (`unified`). The browser console has no new errors or warnings.

## Out of Scope

- Markdoc support for either plugin.
- Moving the demo site off legacy `markdown.remarkPlugins`/`rehypePlugins` (`remarkMath`, `rehypeKatex`).
- Moving other plugins onto the helper, unless they transform Markdown. None do today.
- A standalone remark or Sätteri export of LaTeX compile (ADR 0001).
- Supporting third-party Markdown processors other than `unified` and `satteri`.
- Version bumps or publishing.

## Further Notes

- Implementation tickets, a linear chain:
  - `issues/01-shared-processor-registration-helper.md`: the helper and heading IDs.
  - `issues/02-latex-compile-registers-into-unified.md`: core, remark adapter, registration. Sätteri throws until 03.
  - `issues/03-latex-compile-runs-on-satteri.md`: the Sätteri adapter and README.
- The runtime evidence for the double-registration bug and the Sätteri fallthrough is recorded in ticket 02.
