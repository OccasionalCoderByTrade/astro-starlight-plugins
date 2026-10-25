# 04: Compiled tex diagrams lose their fonts in optimized MDX on `unified`

**Status:** needs-triage

**Blocked by:** None

On the `unified` processor, an `.mdx` doc compiled with `@astrojs/mdx`'s `optimize` option loses the compiled tex diagram's font CSS. Astro's optimized MDX moves a `<style>` whose children are all text into a `set:html` prop, then its static optimizer writes that prop out as a literal attribute. The browser never reads CSS from an attribute, so the diagram's `@font-face` rules are lost and its text falls back to other fonts.

This was already the case before the processor registration work, and it shows on the demo site. Ticket 03 fixed the same problem for the Sätteri adapter by giving each `<style>` an empty comment child, which opts it out of the move (see the implementation notes in `03-latex-compile-runs-on-satteri.md`). The remark adapter splices raw `html` nodes, so it doesn't have that workaround yet.

The test `keeps the compiled tex diagram's font CSS in an optimized mdx doc` in `src/plugins/astro-latex-compile/index.test.ts` covers it, and is skipped on `unified` with a TODO.

**Done when:**

- [ ] On `unified`, an optimized MDX doc keeps the compiled tex diagram's `@font-face` CSS in a `<style>` element, not in an attribute.
- [ ] The skipped test runs, and passes, under both processors.
- [ ] Browser check on the demo site: compiled tex diagrams in an MDX page use their fonts on `unified`.
