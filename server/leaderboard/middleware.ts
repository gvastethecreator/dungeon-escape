import type { IncomingMessage, ServerResponse } from "node:http";

import {
  createHallApplication,
  type HallBodyReadResult,
} from "../../src/leaderboard/application.ts";
import type { LeaderboardRepository } from "../../src/leaderboard/repository.ts";
import { SqliteLeaderboardRepository } from "./SqliteLeaderboardRepository.ts";

type Next = (error?: unknown) => void;

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}

async function readBody(request: IncomingMessage, maxBytes = 12_000): Promise<HallBodyReadResult> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) return { ok: false, reason: "PAYLOAD_TOO_LARGE" };
    chunks.push(buffer);
  }
  return { ok: true, source: Buffer.concat(chunks).toString("utf8") };
}

export interface LeaderboardMiddlewareOptions {
  readonly repository?: LeaderboardRepository;
  readonly now?: () => Date;
  readonly reportError?: (error: unknown) => void;
}

export async function createLeaderboardMiddleware(
  options: LeaderboardMiddlewareOptions = {},
): Promise<{
  handle(request: IncomingMessage, response: ServerResponse, next: Next): Promise<void>;
  close(): void;
}> {
  const ownedRepository = options.repository ? null : await SqliteLeaderboardRepository.open();
  const repository = options.repository ?? ownedRepository!;
  const application = createHallApplication({
    repository,
    ...(options.now ? { now: options.now } : {}),
    ...(options.reportError ? { reportError: options.reportError } : {}),
  });
  return {
    async handle(request, response, next): Promise<void> {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (url.pathname !== "/api/leaderboard") {
        next();
        return;
      }
      const result = await application({
        method: request.method ?? "",
        limit: url.searchParams.get("limit"),
        readBody: () => readBody(request),
      });
      if ("allow" in result) response.setHeader("Allow", result.allow);
      sendJson(response, result.status, result.body);
    },
    close(): void {
      ownedRepository?.close();
    },
  };
}
