export interface FrameGapSnapshot {
  samples: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  over25: number;
  over33: number;
  over50: number;
  longTasks: number;
  longestTask: number;
}

function percentile(sorted: readonly number[], quantile: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * quantile));
  return sorted[index] ?? 0;
}

/** Bounded frame-gap ring. Recording has no allocations; snapshots are slow-path diagnostics. */
export class FrameGapProfiler {
  private readonly gaps: Float32Array;
  private count = 0;
  private cursor = 0;
  private longTaskCount = 0;
  private longestTaskMs = 0;

  constructor(capacity = 1200) {
    this.gaps = new Float32Array(Math.max(60, Math.floor(capacity)));
  }

  reset(): void {
    this.count = 0;
    this.cursor = 0;
    this.longTaskCount = 0;
    this.longestTaskMs = 0;
  }

  record(gapMs: number): void {
    if (!Number.isFinite(gapMs) || gapMs <= 0) return;
    this.gaps[this.cursor] = gapMs;
    this.cursor = (this.cursor + 1) % this.gaps.length;
    this.count = Math.min(this.count + 1, this.gaps.length);
  }

  recordLongTask(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 50) return;
    this.longTaskCount += 1;
    this.longestTaskMs = Math.max(this.longestTaskMs, durationMs);
  }

  snapshot(): FrameGapSnapshot {
    const start = this.count === this.gaps.length ? this.cursor : 0;
    const values = Array.from(
      { length: this.count },
      (_, index) => this.gaps[(start + index) % this.gaps.length] ?? 0,
    );
    values.sort((left, right) => left - right);
    return {
      samples: values.length,
      p50: percentile(values, 0.5),
      p95: percentile(values, 0.95),
      p99: percentile(values, 0.99),
      max: values.at(-1) ?? 0,
      over25: values.filter((value) => value > 25).length,
      over33: values.filter((value) => value > 33.34).length,
      over50: values.filter((value) => value > 50).length,
      longTasks: this.longTaskCount,
      longestTask: this.longestTaskMs,
    };
  }
}
