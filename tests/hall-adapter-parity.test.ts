import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, test } from "bun:test";

import { createLeaderboardMiddleware } from "../server/leaderboard/middleware";
import { handleLeaderboardApi } from "../worker/leaderboardApi";
import type { LeaderboardEntry } from "../src/leaderboard/contract";
import type { LeaderboardRepository } from "../src/leaderboard/repository";

const ENTRY: LeaderboardEntry = {
  runId: "run_adapter_0001",
  playerName: "Adapter Runner",
  score: 123_456,
  scoreVersion: 1,
  durationMs: 180_000,
  distanceM: 320,
  stonesFound: 4,
  biome: "Molten",
  seed: "ADAPTER-SEED",
  difficulty: "STANDARD",
  difficultyValue: 0.5,
  roomCount: 28,
  completedAt: "2026-07-30T12:00:00.000Z",
  rank: 1,
};

function repository(overrides: Partial<LeaderboardRepository> = {}): LeaderboardRepository {
  return {
    async list() {
      return [ENTRY];
    },
    async listBiomeStars() {
      return { "Adapter Runner": { Molten: 1 } };
    },
    async create() {
      return ENTRY;
    },
    ...overrides,
  };
}

interface AdapterResult {
  status: number;
  allow: string | null;
  body: unknown;
}

async function runNode(
  method: string,
  body: string,
  store: LeaderboardRepository,
  path = "/api/leaderboard",
): Promise<AdapterResult & { nextCalls: number }> {
  const request = Readable.from(body ? [Buffer.from(body)] : []) as unknown as IncomingMessage;
  request.method = method;
  request.url = `http://localhost${path}`;

  const headers = new Map<string, string>();
  let responseBody = "";
  const response = {
    statusCode: 200,
    setHeader(name: string, value: string | number | readonly string[]) {
      headers.set(name.toLowerCase(), Array.isArray(value) ? value.join(", ") : String(value));
      return this;
    },
    end(value?: string) {
      responseBody = value ?? "";
      return this;
    },
  } as unknown as ServerResponse;

  let nextCalls = 0;
  const middleware = await createLeaderboardMiddleware({
    repository: store,
    now: () => new Date("2026-07-30T16:00:00.000Z"),
    reportError: () => undefined,
  });
  await middleware.handle(request, response, () => {
    nextCalls += 1;
  });
  middleware.close();

  return {
    status: response.statusCode,
    allow: headers.get("allow") ?? null,
    body: responseBody ? (JSON.parse(responseBody) as unknown) : null,
    nextCalls,
  };
}

async function runFetch(
  method: string,
  body: string,
  store: LeaderboardRepository,
  path = "/api/leaderboard",
): Promise<AdapterResult> {
  const response = await handleLeaderboardApi(
    new Request(`https://example.test${path}`, {
      method,
      ...(method === "GET" || method === "HEAD" ? {} : { body }),
    }),
    store,
    {
      now: () => new Date("2026-07-30T16:00:00.000Z"),
      reportError: () => undefined,
    },
  );
  return {
    status: response.status,
    allow: response.headers.get("allow"),
    body: await response.json(),
  };
}

describe("Hall transport adapters", () => {
  test("produce the same GET, invalid JSON, and method outcomes", async () => {
    for (const [method, body] of [
      ["GET", ""],
      ["POST", "{"],
      ["DELETE", ""],
    ] as const) {
      const store = repository();
      const [node, fetch] = await Promise.all([
        runNode(method, body, store),
        runFetch(method, body, store),
      ]);

      expect({ status: node.status, allow: node.allow, body: node.body }).toEqual(fetch);
      expect(node.nextCalls).toBe(0);
    }
  });

  test("both enforce their concrete 12 KB body boundary", async () => {
    const body = "x".repeat(12_001);
    const store = repository();
    const [node, fetch] = await Promise.all([
      runNode("POST", body, store),
      runFetch("POST", body, store),
    ]);

    expect({ status: node.status, allow: node.allow, body: node.body }).toEqual(fetch);
    expect(node.status).toBe(413);
  });

  test("both map repository failures to the same unavailable response", async () => {
    const store = repository({
      async list() {
        throw new Error("offline");
      },
    });
    const [node, fetch] = await Promise.all([
      runNode("GET", "", store),
      runFetch("GET", "", store),
    ]);

    expect({ status: node.status, allow: node.allow, body: node.body }).toEqual(fetch);
    expect(node.status).toBe(500);
  });

  test("Node keeps non-Hall path forwarding in the transport adapter", async () => {
    const result = await runNode("GET", "", repository(), "/assets/game.js");

    expect(result.nextCalls).toBe(1);
    expect(result.body).toBeNull();
  });
});
