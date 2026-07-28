import type { IncomingMessage, ServerResponse } from "node:http";

import {
  leaderboardLimit,
  parseLeaderboardSubmission,
  type LeaderboardErrorResponse,
} from "../../src/leaderboard/contract";
import { SqliteLeaderboardRepository } from "./SqliteLeaderboardRepository";

type Next = (error?: unknown) => void;

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}

function sendError(response: ServerResponse, status: number, code: string, message: string): void {
  const body: LeaderboardErrorResponse = { error: { code, message } };
  sendJson(response, status, body);
}

async function readJson(request: IncomingMessage, maxBytes = 12_000): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new Error("PAYLOAD_TOO_LARGE");
    chunks.push(buffer);
  }
  const source = Buffer.concat(chunks).toString("utf8");
  if (!source) throw new Error("EMPTY_BODY");
  return JSON.parse(source) as unknown;
}

export async function createLeaderboardMiddleware(): Promise<{
  handle(request: IncomingMessage, response: ServerResponse, next: Next): Promise<void>;
  close(): void;
}> {
  const repository = await SqliteLeaderboardRepository.open();
  return {
    async handle(request, response, next): Promise<void> {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (url.pathname !== "/api/leaderboard") {
        next();
        return;
      }
      try {
        if (request.method === "GET") {
          const limit = leaderboardLimit(url.searchParams.get("limit"));
          const [entries, playerBiomeStars] = await Promise.all([
            repository.list(limit),
            repository.listBiomeStars(),
          ]);
          sendJson(response, 200, {
            entries,
            playerBiomeStars,
            generatedAt: new Date().toISOString(),
          });
          return;
        }
        if (request.method === "POST") {
          const parsed = parseLeaderboardSubmission(await readJson(request));
          if (!parsed.ok) {
            sendError(response, 400, parsed.code, parsed.message);
            return;
          }
          const entry = await repository.create(parsed.value);
          sendJson(response, 201, { entry });
          return;
        }
        response.setHeader("Allow", "GET, POST");
        sendError(response, 405, "METHOD_NOT_ALLOWED", "Use GET or POST.");
      } catch (error) {
        if (error instanceof SyntaxError) {
          sendError(response, 400, "INVALID_JSON", "Request body must be valid JSON.");
          return;
        }
        if (error instanceof Error && error.message === "PAYLOAD_TOO_LARGE") {
          sendError(response, 413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
          return;
        }
        console.error("Leaderboard API failed", error);
        sendError(response, 500, "LEADERBOARD_UNAVAILABLE", "Leaderboard is unavailable.");
      }
    },
    close(): void {
      repository.close();
    },
  };
}
