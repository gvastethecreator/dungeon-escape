import {
  leaderboardLimit,
  parseLeaderboardSubmission,
  type LeaderboardErrorResponse,
} from "../src/leaderboard/contract";
import type { LeaderboardRepository } from "../src/leaderboard/repository";

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function error(status: number, code: string, message: string): Response {
  const body: LeaderboardErrorResponse = { error: { code, message } };
  return json(body, status);
}

async function readJson(request: Request, maxBytes = 12_000): Promise<unknown> {
  const declaredSize = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (declaredSize > maxBytes) throw new Error("PAYLOAD_TOO_LARGE");
  const source = await request.text();
  if (new TextEncoder().encode(source).byteLength > maxBytes) throw new Error("PAYLOAD_TOO_LARGE");
  if (!source) throw new SyntaxError("Empty JSON body");
  return JSON.parse(source) as unknown;
}

export async function handleLeaderboardApi(
  request: Request,
  repository: LeaderboardRepository,
): Promise<Response> {
  const url = new URL(request.url);
  try {
    if (request.method === "GET") {
      const limit = leaderboardLimit(url.searchParams.get("limit"));
      const [entries, playerBiomeStars] = await Promise.all([
        repository.list(limit),
        repository.listBiomeStars(),
      ]);
      return json({ entries, playerBiomeStars, generatedAt: new Date().toISOString() });
    }
    if (request.method === "POST") {
      const parsed = parseLeaderboardSubmission(await readJson(request));
      if (!parsed.ok) return error(400, parsed.code, parsed.message);
      return json({ entry: await repository.create(parsed.value) }, 201);
    }
    return new Response(
      JSON.stringify({ error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or POST." } }),
      {
        status: 405,
        headers: {
          Allow: "GET, POST",
          "Cache-Control": "no-store",
          "Content-Type": "application/json; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (caught) {
    if (caught instanceof SyntaxError)
      return error(400, "INVALID_JSON", "Request body must be valid JSON.");
    if (caught instanceof Error && caught.message === "PAYLOAD_TOO_LARGE") {
      return error(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
    }
    console.error("Leaderboard API failed", caught);
    return error(500, "LEADERBOARD_UNAVAILABLE", "Leaderboard is unavailable.");
  }
}
