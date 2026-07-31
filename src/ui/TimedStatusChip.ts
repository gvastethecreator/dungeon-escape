/**
 * Timed utility HUD chips (time freeze, ward, pulse).
 * One owner for active flag, 0.1s display latch, ISO duration, and urgent threshold.
 */

export const TIMED_STATUS_URGENT_SECONDS = 5;
export const TIMED_STATUS_ACTIVE_EPSILON = 0.0001;

export interface TimedStatusDisplay {
  active: boolean;
  seconds: number;
  /** Human label such as `12.3s`. Empty when inactive. */
  label: string;
  /** HTML `<time datetime>` value such as `PT12.3S`. Empty when inactive. */
  dateTime: string;
  urgent: boolean;
}

/** Format remaining seconds for a utility chip. */
export function formatTimedStatusSeconds(remaining: number): TimedStatusDisplay {
  const seconds = Math.max(0, Number.isFinite(remaining) ? remaining : 0);
  const active = seconds > TIMED_STATUS_ACTIVE_EPSILON;
  if (!active) {
    return { active: false, seconds: 0, label: "", dateTime: "", urgent: false };
  }
  const label = `${seconds.toFixed(1)}s`;
  return {
    active: true,
    seconds,
    label,
    dateTime: `PT${seconds.toFixed(1)}S`,
    urgent: seconds <= TIMED_STATUS_URGENT_SECONDS,
  };
}

export interface TimedStatusChipElements {
  root: HTMLElement;
  value: HTMLElement & { dateTime?: string };
}

export interface TimedStatusChipPorts {
  elements: TimedStatusChipElements;
  /** Shell dataset key written as `"true"` / `"false"`. */
  shellDatasetKey: string;
  shell: HTMLElement;
  /** e.g. "time freeze remaining" → aria `${label} time freeze remaining`. */
  ariaRemaining: string;
}

/**
 * Latch that skips DOM writes when the 0.1s label is unchanged.
 * Call `reset()` when a run ends or a map rebinds.
 */
export class TimedStatusChip {
  private lastLabel = "";

  constructor(private readonly ports: TimedStatusChipPorts) {}

  reset(): void {
    this.lastLabel = "";
    this.sync(0);
  }

  sync(remaining: number): void {
    const display = formatTimedStatusSeconds(remaining);
    const { elements, shell, shellDatasetKey, ariaRemaining } = this.ports;
    elements.root.hidden = !display.active;
    shell.dataset[shellDatasetKey] = display.active ? "true" : "false";
    if (!display.active) {
      this.lastLabel = "";
      elements.root.removeAttribute("data-urgent");
      return;
    }
    if (display.label === this.lastLabel) return;
    this.lastLabel = display.label;
    elements.value.textContent = display.label;
    if ("dateTime" in elements.value) {
      elements.value.dateTime = display.dateTime;
    } else {
      elements.value.setAttribute("datetime", display.dateTime);
    }
    elements.value.setAttribute("aria-label", `${display.label} ${ariaRemaining}`);
    elements.root.toggleAttribute("data-urgent", display.urgent);
  }
}
