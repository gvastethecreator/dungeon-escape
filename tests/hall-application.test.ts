import { describe, expect, test } from "bun:test";

import { createHallApplication } from "../src/leaderboard/application";
import type { LeaderboardEntry } from "../src/leaderboard/contract";
import type { LeaderboardRepository } from "../src/leaderboard/repository";

const ENTRY: LeaderboardEntry = {
  runId: "run_application_0001",
  playerName: "App Runner",
  score: 123_456,
  scoreVersion: 1,
  durationMs: 180_000,
  distanceM: 320,
  stonesFound: 4,
  biome: "Molten",
  seed: "APP-SEED",
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
      return { "App Runner": { Molten: 1 } };
    },
    async create() {
      return ENTRY;
    },
    ...overrides,
  };
}

describe("Hall application", () => {
  test("owns the GET use case and its generated timestamp", async () => {
    let requestedLimit = 0;
    let bodyReads = 0;
    const application = createHallApplication({
      repository: repository({
        async list(limit) {
          requestedLimit = limit;
          return [ENTRY];
        },
      }),
      now: () => new Date("2026-07-30T15:30:00.000Z"),
    });

    const result = await application({
      method: "GET",
      limit: "2",
      async readBody() {
        bodyReads += 1;
        return { ok: true, source: "" };
      },
    });

    expect(requestedLimit).toBe(2);
    expect(bodyReads).toBe(0);
    expect(result).toEqual({
      status: 200,
      body: {
        entries: [ENTRY],
        playerBiomeStars: { "App Runner": { Molten: 1 } },
        generatedAt: "2026-07-30T15:30:00.000Z",
      },
    });
  });

  test("validates and creates a POST submission from transport-neutral source text", async () => {
    let createdPlayer = "";
    const application = createHallApplication({
      repository: repository({
        async create(submission) {
          createdPlayer = submission.playerName;
          return ENTRY;
        },
      }),
    });

    const result = await application({
      method: "POST",
      limit: null,
      async readBody() {
        return {
          ok: true,
          source: JSON.stringify({
            runId: "run_application_0001",
            playerName: "  App   Runner  ",
            durationMs: 180_000,
            distanceM: 320,
            stonesFound: 4,
            biome: "Molten",
            seed: "APP-SEED",
            difficultyValue: 0.5,
            roomCount: 28,
            runSource: "campaign",
          }),
        };
      },
    });

    expect(createdPlayer).toBe("App Runner");
    expect(result).toEqual({ status: 201, body: { entry: ENTRY } });
  });

  test("normalizes empty and malformed JSON without reaching the repository", async () => {
    let createCalls = 0;
    const application = createHallApplication({
      repository: repository({
        async create() {
          createCalls += 1;
          return ENTRY;
        },
      }),
    });

    for (const source of ["", "{"]) {
      const result = await application({
        method: "POST",
        limit: null,
        async readBody() {
          return { ok: true, source };
        },
      });
      expect(result).toEqual({
        status: 400,
        body: {
          error: { code: "INVALID_JSON", message: "Request body must be valid JSON." },
        },
      });
    }
    expect(createCalls).toBe(0);
  });

  test("owns payload and submission validation outcomes", async () => {
    const application = createHallApplication({ repository: repository() });

    const oversized = await application({
      method: "POST",
      limit: null,
      async readBody() {
        return { ok: false, reason: "PAYLOAD_TOO_LARGE" };
      },
    });
    const invalid = await application({
      method: "POST",
      limit: null,
      async readBody() {
        return { ok: true, source: "{}" };
      },
    });

    expect(oversized).toEqual({
      status: 413,
      body: { error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large." } },
    });
    expect(invalid).toEqual({
      status: 400,
      body: {
        error: {
          code: "INVALID_NAME",
          message: "Use 1-20 letters, numbers, spaces or . _ ' -",
        },
      },
    });
  });

  test("rejects unsupported methods without reading the body", async () => {
    let bodyReads = 0;
    const application = createHallApplication({ repository: repository() });

    const result = await application({
      method: "DELETE",
      limit: null,
      async readBody() {
        bodyReads += 1;
        return { ok: true, source: "{}" };
      },
    });

    expect(bodyReads).toBe(0);
    expect(result).toEqual({
      status: 405,
      allow: "GET, POST",
      body: { error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or POST." } },
    });
  });

  test("reports unexpected failures without misclassifying repository SyntaxError", async () => {
    const failure = new SyntaxError("database decoder failed");
    const reported: unknown[] = [];
    const application = createHallApplication({
      repository: repository({
        async create() {
          throw failure;
        },
      }),
      reportError(error) {
        reported.push(error);
      },
    });

    const result = await application({
      method: "POST",
      limit: null,
      async readBody() {
        return {
          ok: true,
          source: JSON.stringify({
            runId: "run_application_0001",
            playerName: "App Runner",
            durationMs: 180_000,
            distanceM: 320,
            stonesFound: 4,
            biome: "Molten",
            seed: "APP-SEED",
            difficultyValue: 0.5,
            roomCount: 28,
          }),
        };
      },
    });

    expect(result).toEqual({
      status: 500,
      body: {
        error: { code: "LEADERBOARD_UNAVAILABLE", message: "Leaderboard is unavailable." },
      },
    });
    expect(reported).toEqual([failure]);
  });
});
