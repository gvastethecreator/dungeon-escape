import { COPY, STONE_ORDER, formatTime, type StoneId } from "../ui/copy";

export interface StoneFindRecord {
  id: StoneId;
  foundAt: number;
}

export interface QuestSnapshot {
  stonesFound: number;
  stonesTotal: number;
  foundIds: StoneId[];
  portalOpen: boolean;
  escaped: boolean;
  runSeconds: number;
  perStoneSeconds: Partial<Record<StoneId, number>>;
  objectiveText: string;
  timerLabel: string;
  stoneTimerLabel: string;
}

export interface PersistedQuestState {
  foundIds: StoneId[];
  escaped: boolean;
  running: boolean;
}

export class QuestState {
  readonly totalStones = STONE_ORDER.length;
  private readonly found = new Set<StoneId>();
  private readonly foundAt = new Map<StoneId, number>();
  private startedAt = 0;
  private escapedAt: number | null = null;
  private running = false;

  start(nowMs = performance.now()): void {
    this.found.clear();
    this.foundAt.clear();
    this.startedAt = nowMs;
    this.escapedAt = null;
    this.running = true;
  }

  restore(state: PersistedQuestState, nowMs = performance.now()): void {
    this.found.clear();
    this.foundAt.clear();
    this.startedAt = nowMs;
    for (const id of STONE_ORDER) {
      if (!state.foundIds.includes(id)) continue;
      this.found.add(id);
      this.foundAt.set(id, 0);
    }
    this.escapedAt = state.escaped ? nowMs : null;
    this.running = state.running && !state.escaped;
  }

  stop(): void {
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  get stonesFound(): number {
    return this.found.size;
  }

  get portalOpen(): boolean {
    return this.found.size >= this.totalStones;
  }

  get escaped(): boolean {
    return this.escapedAt !== null;
  }

  hasStone(id: StoneId): boolean {
    return this.found.has(id);
  }

  collectStone(id: StoneId, nowMs = performance.now()): boolean {
    if (!this.running || this.found.has(id)) return false;
    this.found.add(id);
    this.foundAt.set(id, Math.max(0, (nowMs - this.startedAt) / 1000));
    return true;
  }

  markEscaped(nowMs = performance.now()): void {
    if (this.escapedAt !== null) return;
    this.escapedAt = nowMs;
    this.running = false;
  }

  runSeconds(nowMs = performance.now()): number {
    const end = this.escapedAt ?? nowMs;
    return Math.max(0, (end - this.startedAt) / 1000);
  }

  perStoneSeconds(): Partial<Record<StoneId, number>> {
    const out: Partial<Record<StoneId, number>> = {};
    for (const id of STONE_ORDER) {
      const t = this.foundAt.get(id);
      if (t !== undefined) out[id] = t;
    }
    return out;
  }

  objectiveText(): string {
    if (this.escaped) return COPY.objective.escape;
    if (this.portalOpen) return COPY.objective.openPortal;
    return COPY.objective.findStones(this.found.size, this.totalStones);
  }

  snapshot(nowMs = performance.now()): QuestSnapshot {
    const per = this.perStoneSeconds();
    const stoneBits = STONE_ORDER.map((id) => {
      const t = per[id];
      return t === undefined
        ? `${COPY.stones[id].slice(0, 1)}—`
        : `${COPY.stones[id].slice(0, 1)}${formatTime(t)}`;
    }).join(" ");
    return {
      stonesFound: this.found.size,
      stonesTotal: this.totalStones,
      foundIds: STONE_ORDER.filter((id) => this.found.has(id)),
      portalOpen: this.portalOpen,
      escaped: this.escaped,
      runSeconds: this.runSeconds(nowMs),
      perStoneSeconds: per,
      objectiveText: this.objectiveText(),
      timerLabel: `${COPY.timer.run} ${formatTime(this.runSeconds(nowMs))}`,
      stoneTimerLabel: `${COPY.timer.stones} ${stoneBits}`,
    };
  }

  endSummary(nowMs = performance.now()): string {
    const per = this.perStoneSeconds();
    const stones = STONE_ORDER.map((id) => {
      const t = per[id];
      return `${COPY.stones[id]} ${t === undefined ? "—" : formatTime(t)}`;
    }).join(" · ");
    return COPY.end.winCopy(this.runSeconds(nowMs), stones);
  }
}
