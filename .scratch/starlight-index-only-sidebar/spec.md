Status: resolved

# Generate index-only sidebar

Implemented at `src/plugins/starlight-index-only-sidebar`. Kept here as the original spec for historical reference.

**Options**

- `maxDepthNesting` (default: `100`) — controls how deep the nested group structure can go, where the root directory is level `0`. Once this depth is reached, no further child groups are created; instead, any `index.md` or `index.mdx` files found deeper in the subtree are flattened and included as slug items directly at the current level, rather than being discarded.
- `dirnameDeterminesLabels` (default: `true`) — when `true`, all labels (both group labels and slug item labels) are derived from the raw directory name. When `false`, the label for a slug item is instead read from the `title` field in the `index.md` or `index.mdx` file's frontmatter; group labels are still derived from the raw directory name.

---

Write a TypeScript function that takes a root directory path and an options object as input and returns a sidebar configuration of type `TSidebar`:

```ts
type TSidebar = TSidebarItem[];

type TSidebarItem =
  | {
      label: string;
      slug: string;
    }
  | {
      label: string;
      items: TSidebarItem[];
    };

type TOptions = {
  maxDepthNesting?: number; // default: 100, root is level 0
  dirnameDeterminesLabels?: boolean; // default: true
};
```

The function should recursively walk the directory tree and produce a nested sidebar structure according to these rules:

1. **Labels** — when `dirnameDeterminesLabels` is `true`, all labels use the raw directory name as-is with no transformation. For example, `even-more-fundie` stays `"even-more-fundie"`. When `dirnameDeterminesLabels` is `false`, slug item labels are read from the `title` field in the corresponding `index.md` or `index.mdx` file's frontmatter instead; group labels still use the raw directory name. See rule 7 for the special case of flattened slug items.

2. **Slug items** are only produced for `index.md` or `index.mdx` files. The slug is the file's path relative to the content root (e.g. `src/content/docs`), with the `.md` or `.mdx` extension stripped. For example, `src/content/docs/reference/schemas/index.md` becomes `"reference/schemas/index"`. The label follows rule 1, except for flattened slug items (see rule 7).

3. **Group items** are produced for directories. A group has a `label` derived from the raw directory name and an `items` array containing its children.

4. **Truncation**: intermediate directory levels that contain no `index.md` or `index.mdx` file of their own exist purely as organizational folders in the filesystem and have no corresponding doc page — they carry no meaningful content for the sidebar. Therefore, if a group contains no `index.md`/`index.mdx` and has only a single child group, it should be collapsed — skip the intermediate group and promote the child group directly in its place. Apply this truncation repeatedly until the group either has an `index.md`/`index.mdx`, has multiple children, or has no children. In other words, never emit a group whose sole purpose is to wrap another single group.

5. **Assets directories** (named `assets`) should be ignored entirely.

6. **Empty groups** (directories containing no `index.md` or `index.mdx` files anywhere in their subtree) should be excluded entirely.

7. **Depth limiting** — the root directory is level 0. Once the current depth reaches `maxDepthNesting`, stop creating new child groups. Any `index.md` or `index.mdx` files found deeper in the subtree from that point are flattened and included as slug items directly at the current level rather than being nested further. For these flattened slug items only, the label is always the raw immediate parent directory name, regardless of `dirnameDeterminesLabels`.

8. The **top-level** array contains a single group item whose `label` is the raw root directory name and whose `items` are the children of that directory, following all the rules above.

---

To illustrate the intended behavior, consider a root directory `my-course` with the following structure:

```
my-course/
├── index.md                                      (frontmatter title: "My Course Home")
├── notes/                                        (no index.md anywhere inside)
└── lectures/
    ├── fundamentals/
    │   └── index.md                              (frontmatter title: "Fundamentals")
    └── advanced/
        └── intermediate/
            ├── index.md                          (frontmatter title: "Intermediate")
            └── complex/
                └── index.md                      (frontmatter title: "Complex Algorithms")
```

With `dirnameDeterminesLabels: true` (the default, `maxDepthNesting: 100`):

```ts
[
  {
    label: "my-course",
    items: [
      { label: "Overview", slug: "my-course/index" },
      {
        label: "lectures",
        items: [
          {
            label: "fundamentals",
            items: [
              {
                label: "Overview",
                slug: "my-course/lectures/fundamentals/index",
              },
            ],
          },
          {
            label: "intermediate",
            items: [
              {
                label: "Overview",
                slug: "my-course/lectures/advanced/intermediate/index",
              },
              {
                label: "complex",
                items: [
                  {
                    label: "Overview",
                    slug: "my-course/lectures/advanced/intermediate/complex/index",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];
```

With `dirnameDeterminesLabels: false` (`maxDepthNesting: 100`):

```ts
[
  {
    label: "my-course",
    items: [
      { label: "My Course Home", slug: "my-course/index" },
      {
        label: "lectures",
        items: [
          {
            label: "fundamentals",
            items: [
              {
                label: "Fundamentals",
                slug: "my-course/lectures/fundamentals/index",
              },
            ],
          },
          {
            label: "intermediate",
            items: [
              {
                label: "Intermediate",
                slug: "my-course/lectures/advanced/intermediate/index",
              },
              {
                label: "complex",
                items: [
                  {
                    label: "Complex Algorithms",
                    slug: "my-course/lectures/advanced/intermediate/complex/index",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];
```

With `maxDepthNesting: 1` and `dirnameDeterminesLabels: true`. The root `my-course` is level 0, so level 1 is the first child tier (`lectures`, `notes`). No new groups are created beyond level 1 — all three `index.md` files deeper than level 1 are flattened into `lectures`' items, each labeled with their immediate parent directory name:

```ts
[
  {
    label: "my-course",
    items: [
      { label: "Overview", slug: "my-course/index" },
      {
        label: "lectures",
        items: [
          {
            label: "fundamentals",
            slug: "my-course/lectures/fundamentals/index",
          },
          {
            label: "intermediate",
            slug: "my-course/lectures/advanced/intermediate/index",
          },
          {
            label: "complex",
            slug: "my-course/lectures/advanced/intermediate/complex/index",
          },
        ],
      },
    ],
  },
];
```

In all cases: the `notes` group is excluded entirely since it has no `index.md` in its subtree, and `advanced` is collapsed away since it is a single-child group with no `index.md` of its own.

If `src/plugins/tests/test-structures.ts` doesn't have the appropriate test cases covering all these rules, add new test cases to assert that the function behaves as specified.

The purpose of all of this is to be able to create a Starlight plugin that generates a sidebar configuration for documentation sites based on the filesystem structure of the content, declared as such:

```ts
  starlightIndexOnlySidebar({
    maxDepthNesting: 1,
    dirnameDeterminesLabels: true,
    directories: [
      "reference",
      "csci-323-algorithms",
      "csci-340-operating-systems",
      "csci-328-algorithms-for-big-data",
    ],
  }),
```

Naturally, our plugin would make sure to avoid including any markdown files whose frontmatter contains `draft: true` or `sidebar.hidden: true`
