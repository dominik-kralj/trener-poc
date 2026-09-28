import { describe, expect, it } from "vitest";
import { coreInfo } from "./index";

describe("core scaffold", () => {
  it("resolves @trener/shared through the workspace", () => {
    expect(coreInfo().timeZone).toBe("Europe/Zagreb");
  });
});
