import type { AuthorityClient } from "../authority/client";

export interface AuthorityWriteCommand {
  readonly type: string;
  readonly payload?: unknown;
  readonly ordered: boolean;
}

export interface AuthorityWriteStatusPatch {
  readonly online: boolean;
  readonly lastError: string | null;
  readonly lastPushAt?: number;
}

export interface AuthorityWriteContext {
  readonly authority: AuthorityClient | null;
  readonly epoch: number;
  readonly expectedRunId: string | null;
  readonly localRevision: number;
}

export interface AuthorityWriteQueueOptions {
  readonly authority?: AuthorityClient | null;
  readonly expectedRunId?: string | null;
  readonly clientId?: string;
  readonly pushTimeoutMs?: number;
  readonly exploreDebounceMs?: number;
  readonly now?: () => number;
  readonly onStatus?: (patch: AuthorityWriteStatusPatch) => void;
}

interface RemoteJob {
  readonly type: string;
  readonly payload?: unknown;
  readonly revisions: readonly number[];
  readonly clientRevision: number;
  readonly expectedRunId?: string;
  readonly reconcilesThrough?: number;
}

interface ActivePush {
  readonly epoch: number;
  readonly controller: AbortController;
  readonly job: RemoteJob;
}

interface DrainWaiter {
  readonly epoch: number;
  readonly resolve: (ok: boolean) => void;
}

function positiveDuration(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function defaultClientId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `dungeon-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export class AuthorityWriteQueue {
  private authority: AuthorityClient | null;
  private expectedRunId: string | null;
  private readonly clientId: string;
  private readonly pushTimeoutMs: number;
  private readonly exploreDebounceMs: number;
  private readonly now: () => number;
  private readonly onStatus: (patch: AuthorityWriteStatusPatch) => void;

  private epoch = 0;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingExplore: RemoteJob | null = null;
  private readonly remoteQueue: RemoteJob[] = [];
  private activePush: ActivePush | null = null;
  private localRevision = 0;
  private remoteCommandRevision = 0;
  private acknowledgedRevision = 0;
  private unreconciledPushError: string | null = null;
  private reconciliationPending = false;
  private readonly acknowledgedOutOfOrder = new Set<number>();
  private readonly drainWaiters = new Set<DrainWaiter>();

  constructor(options: AuthorityWriteQueueOptions = {}) {
    this.authority = options.authority ?? null;
    this.expectedRunId = options.expectedRunId?.trim() || null;
    this.clientId = options.clientId?.trim() || defaultClientId();
    this.pushTimeoutMs = positiveDuration(options.pushTimeoutMs, 10_000);
    this.exploreDebounceMs = positiveDuration(options.exploreDebounceMs, 1_200);
    this.now = options.now ?? Date.now;
    this.onStatus = options.onStatus ?? (() => undefined);
  }

  recordMutation(command?: AuthorityWriteCommand): number {
    const revision = ++this.localRevision;
    if (command) this.schedule(command, revision);
    return revision;
  }

  isClean(): boolean {
    return (
      this.isIdle() &&
      this.acknowledgedRevision === this.localRevision &&
      this.unreconciledPushError === null
    );
  }

  getUnreconciledError(): string | null {
    return this.unreconciledPushError;
  }

  context(): AuthorityWriteContext {
    return {
      authority: this.authority,
      epoch: this.epoch,
      expectedRunId: this.expectedRunId,
      localRevision: this.localRevision,
    };
  }

  isAuthorityContextCurrent(context: AuthorityWriteContext): boolean {
    return (
      context.authority === this.authority &&
      context.epoch === this.epoch &&
      context.expectedRunId === this.expectedRunId
    );
  }

  canHydrate(context: AuthorityWriteContext): boolean {
    return (
      this.isAuthorityContextCurrent(context) &&
      context.localRevision === this.localRevision &&
      this.isClean()
    );
  }

  setExpectedRunId(runId: string): void {
    this.expectedRunId = runId;
  }

  replaceAuthority(
    authority: AuthorityClient | null,
    expectedRunId: string | undefined,
    reconciliationPayload: unknown,
  ): boolean {
    if (
      this.authority === authority &&
      (expectedRunId === undefined || expectedRunId === this.expectedRunId)
    ) {
      return false;
    }

    this.epoch += 1;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = null;
    this.pendingExplore = null;
    this.remoteQueue.length = 0;
    const previousPush = this.activePush;
    this.activePush = null;
    previousPush?.controller.abort();
    for (const waiter of this.drainWaiters) waiter.resolve(false);
    this.drainWaiters.clear();
    this.acknowledgedRevision = 0;
    this.acknowledgedOutOfOrder.clear();
    this.unreconciledPushError = null;
    this.reconciliationPending = false;
    this.authority = authority;
    if (expectedRunId !== undefined) this.expectedRunId = expectedRunId;
    this.onStatus({ online: false, lastError: null });

    if (authority) this.queueReconciliation(reconciliationPayload);
    this.flush();
    return true;
  }

  async drain(): Promise<boolean> {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = null;
    this.queuePendingExplore();
    this.flush();
    if (this.isIdle()) return this.isClean();
    const epoch = this.epoch;
    return new Promise<boolean>((resolve) => {
      this.drainWaiters.add({ epoch, resolve });
    });
  }

  reconcile(reconciliationPayload: unknown): boolean {
    const needsReconciliation =
      this.unreconciledPushError !== null || this.acknowledgedRevision !== this.localRevision;
    if (!this.authority || !needsReconciliation || this.reconciliationPending) return false;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = null;
    this.queuePendingExplore();
    this.queueReconciliation(reconciliationPayload);
    this.flush();
    return true;
  }

  private schedule(command: AuthorityWriteCommand, revision: number): void {
    if (!this.authority) return;
    const job: RemoteJob = {
      type: command.type,
      payload: command.payload,
      revisions: [revision],
      clientRevision: ++this.remoteCommandRevision,
      ...(this.expectedRunId ? { expectedRunId: this.expectedRunId } : {}),
    };

    if (command.type === "dungeons/syncExplore" && !command.ordered) {
      this.pendingExplore = this.pendingExplore
        ? { ...job, revisions: [...this.pendingExplore.revisions, revision] }
        : job;
      if (this.pushTimer) return;
      this.pushTimer = setTimeout(() => {
        this.pushTimer = null;
        this.queuePendingExplore();
        this.flush();
      }, this.exploreDebounceMs);
      return;
    }

    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = null;
    this.queuePendingExplore();
    this.remoteQueue.push(job);
    this.flush();
  }

  private queueReconciliation(payload: unknown): void {
    this.remoteQueue.push({
      type: "dungeons/hydrate",
      payload,
      revisions: [],
      clientRevision: ++this.remoteCommandRevision,
      ...(this.expectedRunId ? { expectedRunId: this.expectedRunId } : {}),
      reconcilesThrough: this.localRevision,
    });
    this.reconciliationPending = true;
  }

  private queuePendingExplore(): void {
    if (!this.pendingExplore) return;
    this.remoteQueue.push(this.pendingExplore);
    this.pendingExplore = null;
  }

  private isIdle(): boolean {
    return !this.pendingExplore && this.remoteQueue.length === 0 && !this.activePush;
  }

  private acknowledge(job: RemoteJob): void {
    if (job.reconcilesThrough !== undefined) {
      this.acknowledgedRevision = Math.max(this.acknowledgedRevision, job.reconcilesThrough);
      for (const revision of this.acknowledgedOutOfOrder) {
        if (revision <= this.acknowledgedRevision) this.acknowledgedOutOfOrder.delete(revision);
      }
      return;
    }
    for (const revision of job.revisions) this.acknowledgedOutOfOrder.add(revision);
    while (this.acknowledgedOutOfOrder.delete(this.acknowledgedRevision + 1)) {
      this.acknowledgedRevision += 1;
    }
  }

  private settleDrainWaiters(): void {
    if (!this.isIdle()) return;
    for (const waiter of this.drainWaiters) {
      this.drainWaiters.delete(waiter);
      waiter.resolve(waiter.epoch === this.epoch && this.isClean());
    }
  }

  private async postRemote(
    authority: AuthorityClient,
    job: RemoteJob,
    controller: AbortController,
  ) {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        authority.postCommand({ type: job.type, payload: job.payload }, "dungeon", {
          clientId: this.clientId,
          clientRevision: job.clientRevision,
          expectedRunId: job.expectedRunId,
          signal: controller.signal,
        }),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () => reject(new Error("push aborted")), {
            once: true,
          });
        }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new Error(`push timed out after ${this.pushTimeoutMs}ms`));
          }, this.pushTimeoutMs);
        }),
      ]);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`push timed out after ${this.pushTimeoutMs}ms`);
      }
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private flush(): void {
    if (!this.authority || this.remoteQueue.length === 0 || this.activePush) {
      this.settleDrainWaiters();
      return;
    }
    const job = this.remoteQueue.shift();
    if (!job) return;
    const authority = this.authority;
    const push: ActivePush = {
      epoch: this.epoch,
      controller: new AbortController(),
      job,
    };
    this.activePush = push;

    void (async () => {
      try {
        const result = await this.postRemote(authority, job, push.controller);
        if (this.activePush !== push || this.epoch !== push.epoch) return;
        if (result.ok) {
          this.acknowledge(job);
          if (job.reconcilesThrough !== undefined) this.unreconciledPushError = null;
        } else {
          this.unreconciledPushError = result.error?.message ?? "push failed";
        }
        this.onStatus({
          online: true,
          lastPushAt: this.now(),
          lastError: this.unreconciledPushError,
        });
      } catch (error) {
        if (this.activePush !== push || this.epoch !== push.epoch) return;
        this.unreconciledPushError = error instanceof Error ? error.message : String(error);
        this.onStatus({ online: false, lastError: this.unreconciledPushError });
      } finally {
        if (this.activePush === push && this.epoch === push.epoch) {
          if (job.reconcilesThrough !== undefined) this.reconciliationPending = false;
          this.activePush = null;
          this.flush();
          this.settleDrainWaiters();
        }
      }
    })();
  }
}
