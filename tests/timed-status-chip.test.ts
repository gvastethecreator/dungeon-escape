import { describe, expect, test } from "bun:test";
import {
  formatTimedStatusSeconds,
  TIMED_STATUS_URGENT_SECONDS,
} from "../src/ui/TimedStatusChip";

describe("TimedStatusChip", () => {
  test("formats active remaining seconds with urgent threshold", () => {
    const active = formatTimedStatusSeconds(12.34);
    expect(active.active).toBe(true);
    expect(active.label).toBe("12.3s");
    expect(active.dateTime).toBe("PT12.3S");
    expect(active.urgent).toBe(false);

    const urgent = formatTimedStatusSeconds(TIMED_STATUS_URGENT_SECONDS);
    expect(urgent.urgent).toBe(true);
    expect(urgent.label).toBe("5.0s");
  });

  test("treats near-zero as inactive", () => {
    expect(formatTimedStatusSeconds(0).active).toBe(false);
    expect(formatTimedStatusSeconds(0.00005).active).toBe(false);
    expect(formatTimedStatusSeconds(-1).label).toBe("");
  });
});
