const DEFAULT_SAVE_DELAY_MS = 1_000;

export interface LocalRunSaveClock {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface LocalRunSaveCoordinatorOptions {
  readonly isActive: () => boolean;
  readonly persist: () => boolean;
  readonly onFailure: () => void;
  readonly defaultDelayMs?: number;
  readonly clock?: LocalRunSaveClock;
}

const SYSTEM_CLOCK: LocalRunSaveClock = {
  setTimeout(callback, delayMs) {
    return globalThis.setTimeout(callback, delayMs);
  },
  clearTimeout(handle) {
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

/** Owns local-run save timing and failure feedback; storage remains a host concern. */
export class LocalRunSaveCoordinator {
  readonly #isActive: () => boolean;
  readonly #persist: () => boolean;
  readonly #onFailure: () => void;
  readonly #defaultDelayMs: number;
  readonly #clock: LocalRunSaveClock;
  #timer: unknown | null = null;
  #failureNotified = false;
  #disposed = false;

  constructor(options: LocalRunSaveCoordinatorOptions) {
    this.#isActive = options.isActive;
    this.#persist = options.persist;
    this.#onFailure = options.onFailure;
    this.#defaultDelayMs = normalizeDelay(options.defaultDelayMs ?? DEFAULT_SAVE_DELAY_MS);
    this.#clock = options.clock ?? SYSTEM_CLOCK;
  }

  /** Keep the first pending deadline; later calls coalesce into it. */
  schedule(delayMs = this.#defaultDelayMs): boolean {
    if (this.#disposed || !this.#isActive() || this.#timer !== null) return false;
    this.#timer = this.#clock.setTimeout(() => {
      this.#timer = null;
      this.#persistOnce();
    }, normalizeDelay(delayMs));
    return true;
  }

  /** Cancel a pending deadline and synchronously attempt one active save. */
  flush(): boolean {
    if (this.#disposed) return false;
    this.#cancelTimer();
    return this.#persistOnce();
  }

  /** Cancel pending work. Shutdown callers should flush explicitly before disposal. */
  dispose(): void {
    if (this.#disposed) return;
    this.#cancelTimer();
    this.#disposed = true;
  }

  #cancelTimer(): void {
    if (this.#timer === null) return;
    this.#clock.clearTimeout(this.#timer);
    this.#timer = null;
  }

  #persistOnce(): boolean {
    if (this.#disposed || !this.#isActive()) return false;
    let saved = false;
    try {
      saved = this.#persist();
    } catch {
      saved = false;
    }
    if (saved) {
      this.#failureNotified = false;
      return true;
    }
    if (!this.#failureNotified) {
      this.#failureNotified = true;
      this.#onFailure();
    }
    return false;
  }
}

function normalizeDelay(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : DEFAULT_SAVE_DELAY_MS;
}
