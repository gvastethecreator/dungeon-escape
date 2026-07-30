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
  const source = await request.text();
  if (new TextEncoder().encode(source).byteLength > maxBytes) {
    return { ok: false, reason: "PAYLOAD_TOO_LARGE" };
  }
  return { ok: true, source };
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
