# Demonstration of `%n.`, `%nn.`, and `%a.` list markers

These three tokens extend Markdown's ordered list syntax with unambiguous
sigil-based markers for the three most common list numbering styles.

`%n.` declares an auto-numbered decimal list item (1, 2, 3, …). `%nn.`
declares an auto-numbered roman numeral list item (i, ii, iii, …). `%a.`
declares an auto-numbered alphabetical list item (a, b, c, …). In each case,
the author writes the same marker for every item in the list — the renderer
handles incrementing the counter automatically, just as it does for standard
Markdown `1.` lists.

The `%` prefix was chosen specifically to avoid collisions with existing
Markdown syntax and to sidestep the ambiguity problems that plague approaches
which mirror the display format in the source (such as writing `a.` for an
alpha item, which is indistinguishable from a sentence beginning with the
letter "a"). Because `%n.`, `%nn.`, and `%a.` cannot occur naturally in
prose, no heuristics or lookahead are required to parse them reliably.

---

## Basic Usage

A simple numeric list:

%n. Apples
%n. Bananas
%n. Cherries

A simple roman numeral list:

%nn. Introduction
%nn. Methodology
%nn. Results

A simple alphabetical list:

%a. Red
%a. Green
%a. Blue

---

## Starting Mid-Sequence

Numeric starting at 5:

%n. Fifth item
%n. Sixth item
%n. Seventh item

Alpha starting at d:

%a. Delta
%a. Epsilon
%a. Zeta

Roman starting at iv:

%nn. Four
%nn. Five
%nn. Six

---

## Mixed Nesting: Numeric > Alpha > Roman

%n. First top-level item
    %a. First sub-item
        %nn. First sub-sub-item
        %nn. Second sub-sub-item
        %nn. Third sub-sub-item
    %a. Second sub-item
        %nn. First sub-sub-item
        %nn. Second sub-sub-item
    %a. Third sub-item
%n. Second top-level item
    %a. First sub-item
    %a. Second sub-item
%n. Third top-level item

---

## Mixed Nesting: Alpha > Numeric > Roman

%a. First alphabetical item
    %n. First numeric child
        %nn. Roman grandchild one
        %nn. Roman grandchild two
    %n. Second numeric child
        %nn. Roman grandchild one
        %nn. Roman grandchild two
        %nn. Roman grandchild three
%a. Second alphabetical item
    %n. Only numeric child
%a. Third alphabetical item

---

## Mixed Nesting: Roman > Alpha > Numeric

%nn. First roman item
    %a. Alpha child one
        %n. Numeric grandchild
        %n. Numeric grandchild
    %a. Alpha child two
        %n. Numeric grandchild
%nn. Second roman item
    %a. Alpha child one
    %a. Alpha child two
    %a. Alpha child three
%nn. Third roman item

---

## List Items Containing Paragraphs

%n. This item has a continuation paragraph.

    The continuation paragraph belongs to this list item because it is
    indented to align with the text above. It can be as long as needed.

%n. This item also has a continuation paragraph, plus a code block.

    Here is some explanatory text in the continuation.

    ```js
    const x = 42;
    console.log(x);
    ```

%n. And this item has two continuation paragraphs.

    First continuation. Lorem ipsum dolor sit amet, consectetur
    adipiscing elit. Sed do eiusmod tempor incididunt ut labore.

    Second continuation. Ut enim ad minim veniam, quis nostrud
    exercitation ullamco laboris nisi ut aliquip ex ea commodo.

---

## List Items Containing Blockquotes

%a. First item, no blockquote.

%a. This item contains a blockquote:

    > "The only way to do great work is to love what you do."
    > — Steve Jobs

%a. This item contains a nested blockquote:

    > Outer quote text here.
    >
    > > Inner quote, nested one level deeper.

%a. Back to a normal item.

---

## List Items Containing Tables

%n. This item introduces a comparison table:

    | Feature     | Option A | Option B |
    |-------------|----------|----------|
    | Speed       | Fast     | Slow     |
    | Cost        | High     | Low      |
    | Reliability | High     | Medium   |

%n. This item introduces a second table:

    | Name    | Role      | Department  |
    |---------|-----------|-------------|
    | Alice   | Engineer  | Backend     |
    | Bob     | Designer  | Frontend    |
    | Charlie | Manager   | Operations  |

%n. Final item with no table.

---

## List Items Containing Sub-lists of a Different Standard Type

%a. Alphabetical item with an unordered child list:

    - Bullet one
    - Bullet two
    - Bullet three

%a. Alphabetical item with a standard ordered child list:

    1. First
    2. Second
    3. Third

%a. Alphabetical item with a task list child:

    - [ ] Unchecked task
    - [x] Checked task
    - [ ] Another unchecked task

---

## Standard Lists Containing Auto-List Children

- Unordered item one
    %n. Numeric child one
    %n. Numeric child two
    %n. Numeric child three
- Unordered item two
    %a. Alpha child one
    %a. Alpha child two
- Unordered item three
    %nn. Roman child one
    %nn. Roman child two

1. Standard ordered item one
    %a. Alpha child one
        %nn. Roman grandchild
        %nn. Roman grandchild
    %a. Alpha child two
2. Standard ordered item two
    %n. Numeric child
    %n. Numeric child
3. Standard ordered item three

---

## Inline Markdown Within List Items

%n. This item has **bold text**, _italic text_, and `inline code`.

%n. This item contains a [hyperlink](https://example.com) and an
    image reference: ![Alt text](./image.png)

%n. This item has ~~strikethrough~~ and ==highlighted text== and a
    footnote reference.[^1]

%a. An alphabetical item with **bold** and a child:

    %n. Numeric child with _italic_ text
    %n. Numeric child with `code` and a [link](https://example.com)

%a. An alphabetical item with an inline `code span` in the label itself.

---

## Deeply Nested: Four Levels

%n. Level one — numeric
    %a. Level two — alpha
        %nn. Level three — roman
            - Level four — unordered bullet
            - Another unordered bullet
        %nn. Back to roman
            - Bullet under second roman item
    %a. Back to alpha at level two
        %nn. Roman under second alpha
        %nn. Second roman under second alpha
%n. Back to numeric level one
    %a. Alpha under second numeric
    %a. Second alpha under second numeric

---

## Deeply Nested: Four Levels Reversed

%a. Level one — alpha
    %nn. Level two — roman
        %n. Level three — numeric
            %a. Level four — alpha
            %a. Second alpha at level four
        %n. Second numeric at level three
            %a. Alpha under second numeric
    %nn. Second roman at level two
        %n. Numeric child
%a. Second alpha at level one

---

## Auto-Lists Inside Blockquotes

> %n. A numeric list inside a blockquote
> %n. Second item
> %n. Third item

> %a. An alpha list inside a blockquote
>
>     %n. Numeric child inside the blockquote
>     %n. Second numeric child
>
> %a. Second alpha item in the blockquote

> %nn. Roman item inside a blockquote
> %nn. Second roman item
>     %a. Alpha child of roman, still inside the blockquote
>     %a. Second alpha child

---

## Auto-Lists Inside a Starlight Aside

:::note
%n. First step in this note
%n. Second step in this note
%n. Third step in this note
:::

:::tip[Installation Steps]
%n. Install dependencies

    ```sh
    npm install
    ```

%n. Configure your project

    %a. Edit `astro.config.mjs`
    %a. Edit `src/env.d.ts`

%n. Run the dev server

    ```sh
    npm run dev
    ```
:::

:::caution
%nn. First warning point
%nn. Second warning point
    %a. Sub-point alpha
    %a. Sub-point bravo
%nn. Third warning point
:::

---

## Auto-Lists Inside a Definition List

Term One
:   A definition that contains a numeric list:

    %n. First point of the definition
    %n. Second point
    %n. Third point

Term Two
:   A definition that contains an alpha list:

    %a. First aspect
    %a. Second aspect
        %nn. Roman sub-point
        %nn. Roman sub-point

Term Three
:   A simple definition with no nested list.

---

## Auto-Lists Inside Code Callout (Non-rendered, for documentation)

Below is source markdown showing intended usage — these are fenced and
will not render as lists:

```md
%n. First auto-numbered item
%n. Second auto-numbered item

%nn. First roman item
%nn. Second roman item

%a. First alpha item
%a. Second alpha item
```

---

## Continuation With Interrupted Lists

Two separate numeric lists interrupted by a paragraph:

%n. First item of first list
%n. Second item of first list

This paragraph interrupts and resets the list counter.

%n. First item of second list
%n. Second item of second list

Two alpha lists interrupted by a heading:

%a. Item one
%a. Item two

### A Heading That Interrupts

%a. Item one of new alpha list
%a. Item two of new alpha list

---

[^1]: This is the footnote referenced above in the inline markdown section.
