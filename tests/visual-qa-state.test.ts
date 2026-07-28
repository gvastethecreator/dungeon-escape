import { describe, expect, test } from "bun:test";

import { readVisualQaSeed, readVisualQaState } from "../src/systems/VisualQaState";

describe("deterministic visual QA states", () => {
  test("remain disabled on normal player URLs", () => {
    expect(readVisualQaState("?qaState=dead")).toBeNull();
    expect(readVisualQaState("?mode=play")).toBeNull();
  });

  test("accept only release states behind perfAudit", () => {
    expect(readVisualQaState("?perfAudit=1&qaState=dead")).toBe("dead");
    expect(readVisualQaState("?perfAudit=1&qaState=critical")).toBe("critical");
    expect(readVisualQaState("?perfAudit=1&qaState=portal")).toBe("portal");
    expect(readVisualQaState("?perfAudit=1&qaState=won")).toBe("won");
  });

  test("accepts a fixed campaign seed only behind perfAudit", () => {
    expect(readVisualQaSeed("?seed=MODEL-QA-0")).toBeNull();
    expect(readVisualQaSeed("?perfAudit=1&seed=MODEL-QA-0")).toBe("MODEL-QA-0");
    expect(readVisualQaSeed("?perfAudit=1&seed=%20%20")).toBeNull();
    expect(readVisualQaSeed(`?perfAudit=1&seed=${"x".repeat(120)}`)).toHaveLength(96);
  });
});
