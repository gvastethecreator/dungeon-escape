import {
  forgePresentationMessage,
  forgeProceduralSeedMessage,
  forgeVisibilityMessage,
  isForgeAnimationCompleteMessage,
  type ForgeHostMessage,
  type ForgePresentationInput,
} from "./ForgeFrameProtocol";

export type ForgeLoadResult = "loaded" | "timeout" | "aborted" | "disposed";
export type ForgeAnimationResult =
  | "completed"
  | "timeout"
  | "cancelled"
  | "superseded"
  | "disposed";

export interface ForgeFrameClock {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface ForgeFrameMessageEvent {
  readonly origin: string;
  readonly source: unknown;
  readonly data: unknown;
}

export interface ForgeFramePort {
  readonly baseSource: string;
  readonly hostOrigin: string;
  mount(source: string): void;
  currentSource(): unknown;
  post(message: ForgeHostMessage): boolean;
  onLoad(listener: () => void): () => void;
  onMessage(listener: (event: ForgeFrameMessageEvent) => void): () => void;
}

export interface ForgePresentationSession {
  readonly completion: Promise<ForgeAnimationResult>;
  stop(): void;
}

export type ForgePresentationStartResult =
  | { readonly ok: true; readonly session: ForgePresentationSession }
  | {
      readonly ok: false;
      readonly reason: "load-timeout" | "post-failed" | "aborted" | "disposed";
    };

interface LoadWaiter {
  readonly timer: unknown;
  readonly settle: (result: ForgeLoadResult) => void;
}

interface ActivePresentation {
  readonly presentationId: number;
  readonly acceptLegacyCompletion: boolean;
  readonly session: ForgePresentationSession;
  readonly settle: (result: ForgeAnimationResult) => void;
  supersede(): void;
}

const SYSTEM_CLOCK: ForgeFrameClock = {
  setTimeout(callback, delayMs) {
    return globalThis.setTimeout(callback, delayMs);
  },
  clearTimeout(handle) {
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

/** Owns the Forge iframe transport, trust boundary, queues, and presentation lifecycle. */
export class ForgeFrameClient {
  readonly #port: ForgeFramePort;
  readonly #clock: ForgeFrameClock;
  readonly #loadWaiters = new Set<LoadWaiter>();
  readonly #trustedMessageListeners = new Set<(data: unknown) => void>();
  readonly #loadListeners = new Set<() => void>();
  readonly #unsubscribeLoad: () => void;
  readonly #unsubscribeMessage: () => void;
  #state: "unmounted" | "loading" | "loaded" | "disposed" = "unmounted";
  #desiredVisibility = false;
  #postedVisibility: boolean | null = null;
  #pendingProceduralSeed: number | null = null;
  #activePresentation: ActivePresentation | null = null;
  #nextPresentationId = 1;
  #legacyCompletionSafe = true;

  constructor(port: ForgeFramePort, clock: ForgeFrameClock = SYSTEM_CLOCK) {
    this.#port = port;
    this.#clock = clock;
    this.#unsubscribeLoad = port.onLoad(() => this.#handleLoad());
    this.#unsubscribeMessage = port.onMessage((event) => this.#handleMessage(event));
  }

  ensureLoaded(
    options: {
      readonly presentation?: boolean;
      readonly timeoutMs?: number;
      readonly signal?: AbortSignal;
    } = {},
  ): Promise<ForgeLoadResult> {
    if (this.#state === "disposed") return Promise.resolve("disposed");
    if (options.signal?.aborted) return Promise.resolve("aborted");
    if (this.#state === "loaded") return Promise.resolve("loaded");

    const timeoutMs = normalizeTimeout(options.timeoutMs ?? 8_000);
    let settleWaiter: (result: ForgeLoadResult) => void = () => undefined;
    const result = new Promise<ForgeLoadResult>((resolve) => {
      let settled = false;
      const timer = this.#clock.setTimeout(() => settleWaiter("timeout"), timeoutMs);
      const waiter: LoadWaiter = {
        timer,
        settle: (loadResult) => {
          if (settled) return;
          settled = true;
          this.#clock.clearTimeout(timer);
          options.signal?.removeEventListener("abort", abort);
          this.#loadWaiters.delete(waiter);
          if (
            (loadResult === "timeout" || loadResult === "aborted") &&
            this.#state === "loading" &&
            this.#loadWaiters.size === 0
          ) {
            // A navigation that never loaded must not poison every later try.
            // A late load remains valid and will promote this state to loaded.
            this.#state = "unmounted";
          }
          resolve(loadResult);
        },
      };
      const abort = (): void => waiter.settle("aborted");
      settleWaiter = waiter.settle;
      this.#loadWaiters.add(waiter);
      options.signal?.addEventListener("abort", abort, { once: true });
    });

    if (this.#state === "unmounted") {
      this.#state = "loading";
      this.#port.mount(this.#sourceFor(Boolean(options.presentation)));
    }
    return result;
  }

  setVisible(visible: boolean): void {
    if (this.#state === "disposed") return;
    this.#desiredVisibility = visible;
    this.#flushVisibility();
  }

  setProceduralSeed(seed: number): void {
    if (this.#state === "disposed") return;
    this.#pendingProceduralSeed = seed;
    this.#flushProceduralSeed();
  }

  async startPresentation(options: {
    readonly presentation: ForgePresentationInput;
    readonly loadTimeoutMs?: number;
    readonly completionTimeoutMs: number;
    readonly signal?: AbortSignal;
  }): Promise<ForgePresentationStartResult> {
    const loadResult = await this.ensureLoaded({
      presentation: true,
      timeoutMs: options.loadTimeoutMs,
      signal: options.signal,
    });
    if (loadResult === "disposed") return { ok: false, reason: "disposed" };
    if (loadResult === "aborted") return { ok: false, reason: "aborted" };
    if (loadResult === "timeout") return { ok: false, reason: "load-timeout" };
    if (options.signal?.aborted) return { ok: false, reason: "aborted" };

    this.#activePresentation?.supersede();
    this.setVisible(true);
    const presentationId = this.#nextPresentationId;
    this.#nextPresentationId = presentationId === Number.MAX_SAFE_INTEGER ? 1 : presentationId + 1;

    let settleCompletion: (result: ForgeAnimationResult) => void = () => undefined;
    let detachAbort = (): void => undefined;
    let stopped = false;
    const completion = new Promise<ForgeAnimationResult>((resolve) => {
      let settled = false;
      const timer = this.#clock.setTimeout(
        () => settleCompletion("timeout"),
        normalizeTimeout(options.completionTimeoutMs, 200),
      );
      settleCompletion = (result) => {
        if (settled) return;
        settled = true;
        // An uncorrelated v1 completion is safe only for the first presentation.
        // Once any session settles, a later legacy message could be a duplicate.
        this.#legacyCompletionSafe = false;
        this.#clock.clearTimeout(timer);
        detachAbort();
        resolve(result);
      };
    });

    const session: ForgePresentationSession = {
      completion,
      stop: () => {
        if (stopped) return;
        stopped = true;
        if (this.#activePresentation?.session !== session) return;
        settleCompletion("cancelled");
        this.#activePresentation = null;
        this.#postPresentationEnd(presentationId);
      },
    };
    const active: ActivePresentation = {
      presentationId,
      acceptLegacyCompletion: this.#legacyCompletionSafe,
      session,
      settle: settleCompletion,
      supersede: () => {
        if (stopped) return;
        stopped = true;
        settleCompletion("superseded");
        if (this.#activePresentation === active) this.#activePresentation = null;
      },
    };
    this.#activePresentation = active;
    if (options.signal) {
      const abort = (): void => session.stop();
      options.signal.addEventListener("abort", abort, { once: true });
      detachAbort = () => options.signal?.removeEventListener("abort", abort);
      if (options.signal.aborted) abort();
    }

    if (options.signal?.aborted) return { ok: false, reason: "aborted" };

    if (!this.#port.post(forgePresentationMessage(true, options.presentation, presentationId))) {
      active.supersede();
      this.#postPresentationEnd(presentationId);
      return { ok: false, reason: "post-failed" };
    }
    return { ok: true, session };
  }

  cancelPresentation(): void {
    const active = this.#activePresentation;
    if (!active) return;
    active.settle("cancelled");
    this.#activePresentation = null;
    this.#postPresentationEnd(active.presentationId);
  }

  onTrustedMessage(listener: (data: unknown) => void): () => void {
    if (this.#state === "disposed") return () => undefined;
    this.#trustedMessageListeners.add(listener);
    return () => this.#trustedMessageListeners.delete(listener);
  }

  onLoaded(listener: () => void): () => void {
    if (this.#state === "disposed") return () => undefined;
    this.#loadListeners.add(listener);
    return () => this.#loadListeners.delete(listener);
  }

  dispose(): void {
    if (this.#state === "disposed") return;
    this.#state = "disposed";
    this.#unsubscribeLoad();
    this.#unsubscribeMessage();
    for (const waiter of this.#loadWaiters) waiter.settle("disposed");
    this.#activePresentation?.settle("disposed");
    this.#activePresentation = null;
    this.#trustedMessageListeners.clear();
    this.#loadListeners.clear();
    this.#pendingProceduralSeed = null;
  }

  #handleLoad(): void {
    if (this.#state === "disposed") return;
    this.#state = "loaded";
    this.#postedVisibility = null;
    this.#flushVisibility();
    this.#flushProceduralSeed();
    for (const waiter of this.#loadWaiters) waiter.settle("loaded");
    for (const listener of this.#loadListeners) listener();
  }

  #handleMessage(event: ForgeFrameMessageEvent): void {
    if (this.#state === "disposed" || event.origin !== this.#port.hostOrigin) return;
    const source = this.#port.currentSource();
    if (source === null || source === undefined || event.source !== source) return;
    if (isForgeAnimationCompleteMessage(event.data)) {
      const active = this.#activePresentation;
      if (
        active &&
        (active.presentationId === event.data.presentationId ||
          (event.data.presentationId === undefined && active.acceptLegacyCompletion))
      ) {
        active.settle("completed");
      }
      return;
    }
    for (const listener of this.#trustedMessageListeners) listener(event.data);
  }

  #flushProceduralSeed(): void {
    if (this.#state !== "loaded" || this.#pendingProceduralSeed === null) return;
    if (!this.#port.post(forgeProceduralSeedMessage(this.#pendingProceduralSeed))) return;
    this.#pendingProceduralSeed = null;
  }

  #flushVisibility(): void {
    if (this.#state !== "loaded" || this.#postedVisibility === this.#desiredVisibility) return;
    if (!this.#port.post(forgeVisibilityMessage(this.#desiredVisibility))) return;
    this.#postedVisibility = this.#desiredVisibility;
  }

  #postPresentationEnd(presentationId: number): void {
    if (this.#state !== "loaded") return;
    this.#port.post(forgePresentationMessage(false, { animate: false }, presentationId));
    this.setVisible(false);
  }

  #sourceFor(presentation: boolean): string {
    if (!presentation) return this.#port.baseSource;
    const url = new URL(this.#port.baseSource, this.#port.hostOrigin);
    url.searchParams.set("presentation", "1");
    return `${url.pathname}${url.search}${url.hash}`;
  }
}

export function createBrowserForgeFramePort(options: {
  readonly frame: HTMLIFrameElement;
  readonly browserWindow?: Window;
  readonly hostOrigin?: string;
}): ForgeFramePort {
  const browserWindow = options.browserWindow ?? window;
  const hostOrigin = options.hostOrigin ?? browserWindow.location.origin;
  return {
    baseSource: options.frame.dataset.src ?? "/forge.html",
    hostOrigin,
    mount(source) {
      options.frame.src = source;
    },
    currentSource() {
      return options.frame.contentWindow;
    },
    post(message) {
      const target = options.frame.contentWindow;
      if (!target) return false;
      target.postMessage(message, hostOrigin);
      return true;
    },
    onLoad(listener) {
      options.frame.addEventListener("load", listener);
      return () => options.frame.removeEventListener("load", listener);
    },
    onMessage(listener) {
      const handleMessage = (event: MessageEvent): void => listener(event);
      browserWindow.addEventListener("message", handleMessage);
      return () => browserWindow.removeEventListener("message", handleMessage);
    },
  };
}

function normalizeTimeout(value: number, minimum = 0): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.floor(value));
}
