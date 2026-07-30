import { createHallApplication, type HallBodyReadResult } from "../src/leaderboard/application";
import type { LeaderboardRepository } from "../src/leaderboard/repository";

function json(value: unknown, status = 200, allow?: string): Response {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(allow ? { Allow: allow } : {}),
    },
  });
}

async function readBody(request: Request, maxBytes = 12_000): Promise<HallBodyReadResult> {
  const declaredSize = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (declaredSize > maxBytes) return { ok: false, reason: "PAYLOAD_TOO_LARGE" };
  if (!request.body) return { ok: true, source: "" };

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let source = "";
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) {
        try {
          await reader.cancel("Leaderboard request body exceeded its byte limit.");
        } catch {
          // A failed cancellation does not change the closed 413 outcome.
        }
        return { ok: false, reason: "PAYLOAD_TOO_LARGE" };
      }
      source += decoder.decode(next.value, { stream: true });
    }
    source += decoder.decode();
    return { ok: true, source };
  } finally {
    reader.releaseLock();
  }
}

export interface LeaderboardApiOptions {
  readonly now?: () => Date;
  readonly reportError?: (error: unknown) => void;
}

export async function handleLeaderboardApi(
  request: Request,
  repository: LeaderboardRepository,
  options: LeaderboardApiOptions = {},
): Promise<Response> {
  const url = new URL(request.url);
  const application = createHallApplication({
    repository,
    ...(options.now ? { now: options.now } : {}),
    ...(options.reportError ? { reportError: options.reportError } : {}),
  });
  const result = await application({
    method: request.method,
    limit: url.searchParams.get("limit"),
    readBody: () => readBody(request),
  });
  return json(result.body, result.status, "allow" in result ? result.allow : undefined);
}
