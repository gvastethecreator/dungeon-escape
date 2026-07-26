import type { GameCommand, SurfaceId, SurfaceProjection } from "../domain/core";

export type RunEnvelope = {
  id: string;
  seed: string;
  worldTicks: number;
  schemaVersion: number;
  contentVersion: string;
};

export type CommandResponse = {
  ok: boolean;
  events: Array<{ type: string; payload?: unknown; at: { worldTicks: number } }>;
  pendingDecisions: Array<{ id: string; summary: string; options: string[] }>;
  projection: SurfaceProjection;
  run: RunEnvelope;
  error?: { code: string; message: string };
};

export type DomainStateResponse = {
  domainId: string;
  state: unknown;
  projection: SurfaceProjection & {
    domainId?: string;
    domain?: { summary?: string; metrics?: Record<string, unknown>; lines?: string[] };
  };
  run: RunEnvelope;
};

export type RunListResponse = {
  activeRunId: string;
  runs: Array<{ id: string; seed: string; updatedAt: string; label: string }>;
};

/** `clientId` and `clientRevision` bind each remote mutation to a local ordering. */
export type CommandRequestMetadata = {
  clientId?: string;
  clientRevision?: number;
  expectedRunId?: string;
  signal?: AbortSignal;
};

/** Optional authority seam. Dungeon Escape works locally when no service is available. */
export type AuthorityClient = {
  health: () => Promise<{ ok: boolean; service: string; activeRunId?: string; runCount?: number }>;
  listSurfaces: () => Promise<{ surfaces: SurfaceId[] }>;
  getRun: () => Promise<{
    run: RunEnvelope;
    notes: string[];
    pendingDecisions: CommandResponse["pendingDecisions"];
    activeRunId?: string;
  }>;
  getProjection: (surfaceId: SurfaceId) => Promise<SurfaceProjection>;
  getDomain: (domainId: string) => Promise<DomainStateResponse>;
  postCommand: (
    command: GameCommand,
    surfaceId?: SurfaceId,
    metadata?: CommandRequestMetadata,
  ) => Promise<CommandResponse>;
  listRuns: () => Promise<RunListResponse>;
  createRun: (body?: {
    id?: string;
    seed?: string;
    label?: string;
  }) => Promise<RunListResponse & { run: RunEnvelope }>;
  activateRun: (runId: string) => Promise<RunListResponse & { run: RunEnvelope }>;
  deleteRun: (runId: string) => Promise<RunListResponse>;
  isReachable: () => Promise<boolean>;
};

export type AuthorityClientOptions = {
  /** Base URL without a trailing slash. Empty means the current origin. */
  baseUrl?: string;
  devPlayer?: string;
  fetchImpl?: typeof fetch;
};

export function createAuthorityClient(options: AuthorityClientOptions = {}): AuthorityClient {
  const base = (options.baseUrl ?? "").replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = (): HeadersInit => {
    const values: Record<string, string> = { "content-type": "application/json" };
    if (options.devPlayer) values["x-dev-player"] = options.devPlayer;
    return values;
  };
  const getJson = async <T>(path: string): Promise<T> => {
    const response = await fetchImpl(`${base}${path}`, { headers: headers() });
    if (!response.ok) throw new Error(`GET ${path} → ${response.status}: ${await response.text()}`);
    return (await response.json()) as T;
  };

  return {
    health: () => getJson("/health"),
    listSurfaces: () => getJson("/v0/surfaces"),
    getRun: () => getJson("/v0/run"),
    getProjection: (surfaceId) => getJson(`/v0/surfaces/${surfaceId}/projection`),
    getDomain: (domainId) => getJson(`/v0/domains/${domainId}`),
    postCommand: async (command, surfaceId, metadata) => {
      const response = await fetchImpl(`${base}/v0/run/commands`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          ...command,
          surfaceId,
          ...(metadata?.clientId === undefined ? {} : { clientId: metadata.clientId }),
          ...(metadata?.clientRevision === undefined
            ? {}
            : { clientRevision: metadata.clientRevision }),
          ...(metadata?.expectedRunId === undefined
            ? {}
            : { expectedRunId: metadata.expectedRunId }),
        }),
        signal: metadata?.signal,
      });
      const body = (await response.json()) as CommandResponse;
      if (!response.ok && body.ok !== false)
        throw new Error(`POST /v0/run/commands → ${response.status}`);
      return body;
    },
    listRuns: () => getJson("/v0/runs"),
    createRun: async (body = {}) => {
      const response = await fetchImpl(`${base}/v0/runs`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`POST /v0/runs → ${response.status}`);
      return (await response.json()) as RunListResponse & { run: RunEnvelope };
    },
    activateRun: async (runId) => {
      const response = await fetchImpl(`${base}/v0/runs/${runId}/activate`, {
        method: "POST",
        headers: headers(),
      });
      if (!response.ok) throw new Error(`POST /v0/runs/${runId}/activate → ${response.status}`);
      return (await response.json()) as RunListResponse & { run: RunEnvelope };
    },
    deleteRun: async (runId) => {
      const response = await fetchImpl(`${base}/v0/runs/${runId}`, {
        method: "DELETE",
        headers: headers(),
      });
      if (!response.ok) throw new Error(`DELETE /v0/runs/${runId} → ${response.status}`);
      return (await response.json()) as RunListResponse;
    },
    isReachable: async () => {
      try {
        return (await fetchImpl(`${base}/health`, { headers: headers() })).ok;
      } catch {
        return false;
      }
    },
  };
}
