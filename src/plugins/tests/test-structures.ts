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
        label: "CSCI 323 - Algorithms",
        items: [
          { label: "Overview", slug: "csci-323-algorithms/index" },
          {
            label: "Complex",
            items: [
              {
                label: "Overview",
                slug: "csci-323-algorithms/lectures/advanced/intermediate/complex/index",
              },
            ],
          },
          {
            label: "Even More Fundie",
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
        label: "CSCI 328 - Algorithms for Big Data",
        items: [
          { label: "Overview", slug: "csci-328-algorithms-for-big-data/index" },
          {
            label: "Distributed",
            items: [
              {
                label: "Overview",
                slug: "csci-328-algorithms-for-big-data/systems/cloud/distributed/index",
              },
            ],
          },
          {
            label: "Frameworks",
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
        label: "CSCI 340 - Operating Systems",
        items: [
          {
            label: "Concurrency",
            items: [
              {
                label: "Overview",
                slug: "csci-340-operating-systems/concepts/concurrency/index",
              },
            ],
          },
          {
            label: "Kernels",
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
        label: "Reference",
        items: [
          { label: "Overview", slug: "reference/index" },
          {
            label: "Schemas",
            items: [
              { label: "Overview", slug: "reference/schemas/index" },
              {
                label: "Data",
                items: [
                  { label: "Overview", slug: "reference/schemas/data/index" },
                ],
              },
              {
                label: "Rules",
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
