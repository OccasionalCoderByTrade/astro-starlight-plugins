import { expect, it } from "vitest";
import { astroNormalizePaths } from "./index.js";

it("astroNormalizePaths throws a migration message when called", () => {
  expect(() => astroNormalizePaths()).toThrow(
    /astroNormalizePaths.*replaced by `astroLocalLinks/,
  );
});
