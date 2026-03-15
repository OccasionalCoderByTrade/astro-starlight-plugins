// @ts-expect-error no types available for lodash
import _ from "lodash";
import type { TSidebarItem } from "../utils/types";

const { isEqual } = _;

export function testSidebarStructure(
  dir_root: string,
  sidebar: TSidebarItem[],
) {
  const expected: Record<string, TSidebarItem[]> = {
    "src/content/docs/csci-323-algorithms": [
      {
        label: "csci-323-algorithms",
        items: [
          { label: "Overview", slug: "csci-323-algorithms/index" },
          {
            label: "complex",
            items: [
              {
                label: "Overview",
                slug: "csci-323-algorithms/lectures/advanced/intermediate/complex/index",
              },
            ],
          },
          {
            label: "even-more-fundie",
            items: [
              {
                label: "Overview",
                slug: "csci-323-algorithms/lectures/fundamentals/even-more-fundie/index",
              },
            ],
          },
        ],
      },
    ],
    "src/content/docs/csci-328-algorithms-for-big-data": [
      {
        label: "csci-328-algorithms-for-big-data",
        items: [
          {
            label: "Overview",
            slug: "csci-328-algorithms-for-big-data/index",
          },
          {
            label: "distributed",
            items: [
              {
                label: "Overview",
                slug: "csci-328-algorithms-for-big-data/systems/cloud/distributed/index",
              },
            ],
          },
          {
            label: "frameworks",
            items: [
              {
                label: "Overview",
                slug: "csci-328-algorithms-for-big-data/systems/frameworks/index",
              },
            ],
          },
        ],
      },
    ],
    "src/content/docs/csci-340-operating-systems": [
      {
        label: "csci-340-operating-systems",
        items: [
          { label: "Overview", slug: "csci-340-operating-systems/index" },
          {
            label: "concurrency",
            items: [
              {
                label: "Overview",
                slug: "csci-340-operating-systems/concepts/concurrency/index",
              },
            ],
          },
          {
            label: "kernels",
            items: [
              {
                label: "Overview",
                slug: "csci-340-operating-systems/concepts/security/hardening/kernels/index",
              },
            ],
          },
        ],
      },
    ],
    "src/content/docs/reference": [
      {
        label: "reference",
        items: [
          { label: "Overview", slug: "reference/index" },
          {
            label: "schemas",
            items: [
              { label: "Overview", slug: "reference/schemas/index" },
              {
                label: "data",
                items: [
                  { label: "Overview", slug: "reference/schemas/data/index" },
                ],
              },
              {
                label: "rules",
                items: [
                  {
                    label: "Overview",
                    slug: "reference/schemas/validation/rules/index",
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
