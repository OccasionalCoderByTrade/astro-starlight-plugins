import { expect, it } from "vitest";
import { rehypeValidateLinks } from "./rehype-validate-links.js";

it("rehypeValidateLinks throws a migration message when called", () => {
  expect(() => rehypeValidateLinks({ skipPatterns: [] })).toThrow(
    /rehypeValidateLinks.*replaced by `astroLocalLinks/,
  );
});
