import { describe, expect, test } from "bun:test";

import { readVisualQaState } from "../src/systems/VisualQaState";

describe("deterministic visual QA states", () => {
  test("remain disabled on normal player URLs", () => {
    expect(readVisualQaState("?qaState=dead")).toBeNull();
    expect(readVisualQaState("?mode=play")).toBeNull();
  });

  test("accept only release states behind perfAudit", () => {
    expect(readVisualQaState("?perfAudit=1&qaState=dead")).toBe("dead");
    expect(readVisualQaState("?perfAudit=1&qaState=critical")).toBe("critical");
    expect(readVisualQaState("?perfAudit=1&qaState=won")).toBe("won");
  });
});
