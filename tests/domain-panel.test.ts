import { describe, expect, test } from "bun:test";

import { formatDomainPanelError } from "../src/domain/panel";

describe("Dungeon domain panel copy", () => {
  test("turns transport noise into a useful local fallback message", () => {
    expect(
      formatDomainPanelError(
        "Failed to execute 'json' on 'Response': Unexpected end of JSON input",
      ),
    ).toBe("Backend unavailable. Local dungeon remains active.");
    expect(formatDomainPanelError("backend unreachable")).toBe(
      "Backend unavailable. Local dungeon remains active.",
    );
  });

  test("keeps short domain errors and bounds long output", () => {
    expect(formatDomainPanelError("Revision conflict")).toBe("Revision conflict");
    expect(formatDomainPanelError("x".repeat(160))).toHaveLength(120);
  });
});
