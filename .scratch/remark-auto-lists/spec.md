Status: resolved

# Implement a Remark Plugin for Auto-Incrementing List Tokens

Implemented at `src/plugins/remark-auto-lists`. Kept here as the original spec for historical reference.

### Overview

You are to implement a remark plugin for use in an Astro/Starlight project that
introduces three new Markdown list marker tokens:

| Token  | List style      | HTML output               |
| ------ | --------------- | ------------------------- |
| `%n.`  | Decimal numeric | `<ol type="1">` (default) |
| `%nn.` | Roman numeral   | `<ol type="i">`           |
| `%a.`  | Alphabetical    | `<ol type="a">`           |

Each token is written identically for every item in a given list. The renderer
is responsible for incrementing the counter. Nesting is supported: indented
tokens of any type may appear as children of any list item, including items
from standard Markdown ordered and unordered lists and vice versa.

The plugin must be wired into Astro via `remarkPlugins` in `astro.config.mjs`
and must work correctly inside Starlight's content pipeline, including inside
`:::note` / `:::tip` / `:::caution` / `:::danger` aside blocks.

---

### Architecture

The implementation consists of two layers, exported together as a single
function. Follow the same structural pattern as Starlight's own
`starlightAsides` export in `packages/starlight/integrations/asides.ts`, which
returns an array of `[lowLevelPlugin, transformerPlugin]` to be spread into
`remarkPlugins`.

#### Layer 1 — Micromark Extension

Write a micromark extension that teaches the tokenizer to recognise `%n.`,
`%nn.`, and `%a.` as block-level list marker constructs. This must hook into
micromark's `constructs` at the block (flow) level, not the inline level.

The extension must:

- Recognise a line beginning with `%n. `, `%nn. `, or `%a. ` (marker followed
  by at least one space) as the opening of a list item of the corresponding
  type.
- Tokenize the marker itself separately from the list item content, so the
  remark transformer can inspect the marker type.
- Handle continuation lines for the same list item (indented content,
  continuation paragraphs, nested blocks) using the same indentation rules as
  CommonMark ordered lists: content must be indented to align with the first
  non-space character after the marker.
- Handle nested auto-list items (an indented `%a.` inside a `%n.` item, etc.)
  by delegating back to the same construct recognition recursively.
- Emit the following token types into the mdast:
  - `autoListItem` — wraps a single list item including all its children
  - `autoList` — wraps a sequence of consecutive `autoListItem` nodes of the
    same token type
  - `autoListMarker` — the literal `%n.`, `%nn.`, or `%a.` token, used by the
    transformer to determine list style

The extension must be structured as a micromark `extension` object with
`flow` and `flowInitial` hooks, compatible with passing into
`micromark-util-combine-extensions` and ultimately into `remark-parse` via
`options.micromarkExtensions`.

Also provide a corresponding `fromMarkdown` mdast utility extension (for
`mdast-util-from-markdown`) that converts the raw micromark tokens into mdast
nodes. The `autoList` node should be shaped as:

```ts
interface AutoListNode {
  type: "autoList";
  listStyle: "decimal" | "lower-roman" | "lower-alpha";
  children: AutoListItemNode[];
}

interface AutoListItemNode {
  type: "autoListItem";
  children: MdastBlockContent[];
}
```

#### Layer 2 — Remark Transformer

Write a remark plugin (a function returning a transformer) that visits all
`autoList` nodes in the mdast tree produced after Layer 1 has run, and
transforms each one into a standard mdast `html` node containing the
appropriate `<ol>` HTML, with `type` attribute set according to `listStyle`:

- `decimal` → `<ol type="1">`
- `lower-roman` → `<ol type="i">`
- `lower-alpha` → `<ol type="a">`

Each `autoListItem`'s children should be serialised recursively through the
existing remark-to-rehype pipeline rather than manually stringified, so that
any nested Markdown content (bold, links, code spans, nested lists of any
kind, nested `autoList` nodes, etc.) renders correctly.

To achieve this, do not emit a raw `html` node with hand-serialised children.
Instead, transform `autoList` into a standard mdast `list` node and
`autoListItem` into standard mdast `listItem` nodes, and attach the
`listStyle` as custom data on the `list` node:

```ts
{
  type: 'list',
  ordered: true,
  start: 1,
  data: {
    hName: 'ol',
    hProperties: { type: listStyleToHtmlType(listStyle) }
  },
  children: [ /* listItem nodes */ ]
}
```

This approach lets remark-rehype handle all child serialisation automatically
and avoids raw HTML injection entirely.

Use `unist-util-visit` to traverse the tree. The transformer must handle
`autoList` nodes at any depth — top-level, inside blockquotes, inside asides,
inside definition list definitions, inside other list items.

---

### Exported API

Export a single function `remarkAutoLists` that returns the two-element array:

```ts
import type { RemarkPlugins } from "astro";

export function remarkAutoLists(): RemarkPlugins[number][] {
  return [micromarkAutoListsExtension, remarkAutoListsTransformer];
}
```

The micromark extension must be wrapped appropriately so remark-parse picks it
up via its `micromarkExtensions` and `fromMarkdownExtensions` options. Follow
the pattern used by `remark-directive` for how it registers its micromark
extension with remark-parse.

---

### Astro Integration

The plugin is added to `astro.config.mjs` as follows:

```js
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { remarkAutoLists } from "./src/plugins/remark-auto-lists";

export default defineConfig({
  integrations: [starlight({ title: "My Docs" })],
  markdown: {
    remarkPlugins: [remarkAutoLists],
  },
});
```

No other configuration is required. The plugin must not conflict with
`remark-directive` (used by Starlight for asides) or `remark-gfm` (included
by Astro by default).

---

### Behaviour Requirements

#### Counter reset

A new list begins — and the counter resets to 1 / a / i — whenever:

- A different token type appears (`%n.` after `%a.`, etc.)
- A non-list block intervenes (a paragraph, heading, blockquote, aside, etc.)
- The indentation level changes (a dedented item starts a new parent-level list)

#### Nesting

Any token type may be nested inside any other, and inside standard Markdown
ordered (`1.`) and unordered (`-`, `*`, `+`) list items, and vice versa.
Nesting is determined purely by indentation, using CommonMark's indentation
rules.

#### Inline content

All inline Markdown must work inside auto-list items: bold, italic, inline
code, links, images, strikethrough, footnote references, etc.

#### Block content in list items

Continuation paragraphs, fenced code blocks, blockquotes, tables, and nested
lists of any type must work as children of auto-list items, using the same
indentation rules as CommonMark.

#### Interaction with Starlight asides

Auto-list items must render correctly inside Starlight's `:::note`,
`:::tip`, `:::caution`, and `:::danger` containers, since those are
processed by a separate remark plugin (`remark-directive`) that runs in the
same pipeline.

#### Test fixture

An extensive reference document covering all of the above — nesting
combinations, inline content, block content within list items, blockquotes,
tables, Starlight asides, definition lists, and interrupted lists — is
available at:

```
src/content/docs/reference/auto-list-syntax.md
```

All constructs demonstrated in that file must parse and render correctly. Use
it as the primary test fixture when verifying the implementation.

---

### File Structure

Place the plugin at:

```
src/
  plugins/
    remark-auto-lists/
      index.ts          — exported remarkAutoLists function
      micromark.ts      — micromark extension and fromMarkdown utility
      transformer.ts    — remark AST transformer
      types.ts          — shared TypeScript types for the new AST nodes
```

---

### Dependencies

The implementation should rely only on packages already present in a standard
Astro/Starlight project, plus:

- `micromark-util-types` — for TypeScript types
- `micromark-util-symbol` — for token type constants
- `micromark-util-combine-extensions` — to merge the extension into remark-parse
- `mdast-util-from-markdown` — for the fromMarkdown extension type
- `unist-util-visit` — for AST traversal in the transformer

All of the above are transitive dependencies of remark/Astro and will already
be present in the `node_modules` of any Astro project. No additional
`package.json` entries should be required beyond adding the plugin files
themselves.
