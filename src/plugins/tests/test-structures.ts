// @ts-expect-error no types available for lodash
import _ from "lodash";
import type { TSidebarItem } from "../starlight-index-only-sidebar/types";

const { isEqual } = _;

export function testSidebarStructure(
  dir_root: string,
  sidebar: TSidebarItem[],
) {
  const expected: Record<string, TSidebarItem[]> = {
    "src/content/docs/csci-323-algorithms": [
      {
        label: "CSCI 323 Algorithms",
        items: [
          { label: "Overview", slug: "csci-323-algorithms" },
          {
            label: "Complex",
            items: [
              {
                label: "Overview",
                slug: "csci-323-algorithms/lectures/advanced/intermediate/complex",
              },
            ],
          },
          {
            label: "Even More Fundie",
            items: [
              {
                label: "Overview",
                slug: "csci-323-algorithms/lectures/fundamentals/even-more-fundie",
              },
            ],
          },
        ],
      },
    ],
    "src/content/docs/csci-328-algorithms-for-big-data": [
      {
        label: "CSCI 328 Algorithms For Big Data",
        items: [
          {
            label: "Overview",
            slug: "csci-328-algorithms-for-big-data",
          },
          {
            label: "Distributed",
            items: [
              {
                label: "Overview",
                slug: "csci-328-algorithms-for-big-data/systems/cloud/distributed",
              },
            ],
          },
          {
            label: "Frameworks",
            items: [
              {
                label: "Overview",
                slug: "csci-328-algorithms-for-big-data/systems/frameworks",
              },
            ],
          },
        ],
      },
    ],
    "src/content/docs/csci-340-operating-systems": [
      {
        label: "CSCI 340 Operating Systems",
        items: [
          { label: "Overview", slug: "csci-340-operating-systems" },
          {
            label: "Concurrency",
            items: [
              {
                label: "Overview",
                slug: "csci-340-operating-systems/concepts/concurrency",
              },
            ],
          },
          {
            label: "Kernels",
            items: [
              {
                label: "Overview",
                slug: "csci-340-operating-systems/concepts/security/hardening/kernels",
              },
            ],
          },
        ],
      },
    ],
    "src/content/docs/reference": [
      {
        label: "Reference",
        items: [
          { label: "Overview", slug: "reference" },
          {
            label: "Schemas",
            items: [
              { label: "Overview", slug: "reference/schemas" },
              {
                label: "Data",
                items: [
                  { label: "Overview", slug: "reference/schemas/data" },
                ],
              },
              {
                label: "Rules",
                items: [
                  {
                    label: "Overview",
                    slug: "reference/schemas/validation/rules",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const expectedResult = expected[dir_root];

  if (!expectedResult) {
    console.warn(`No test case found for directory: ${dir_root}`);
    return;
  }

  if (isEqual(sidebar, expectedResult)) {
    console.log(`✓ Test passed for: ${dir_root}`);
  } else {
    console.error(`✗ Test failed for: ${dir_root}`);
    console.error("Expected:", JSON.stringify(expectedResult, null, 2));
    console.error("Got:", JSON.stringify(sidebar, null, 2));
    process.exit(1);
  }
}
