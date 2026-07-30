import {
  leaderboardLimit,
  parseLeaderboardSubmission,
  type LeaderboardCreateResponse,
  type LeaderboardErrorResponse,
  type LeaderboardListResponse,
} from "./contract";
import type { LeaderboardRepository } from "./repository";

export type HallBodyReadResult =
  | { readonly ok: true; readonly source: string }
  | { readonly ok: false; readonly reason: "PAYLOAD_TOO_LARGE" };

export interface HallApplicationRequest {
  readonly method: string;
  readonly limit: string | null;
  /** Lazy: only POST reads a body. The transport remains responsible for its byte limit. */
  readBody(): Promise<HallBodyReadResult>;
}

export type HallApplicationResult =
  | { readonly status: 200; readonly body: LeaderboardListResponse }
  | { readonly status: 201; readonly body: LeaderboardCreateResponse }
  | {
      readonly status: 400 | 413 | 500;
      readonly body: LeaderboardErrorResponse;
    }
  | {
      readonly status: 405;
      readonly allow: "GET, POST";
      readonly body: LeaderboardErrorResponse;
    };

export type HallApplication = (request: HallApplicationRequest) => Promise<HallApplicationResult>;

export interface HallApplicationOptions {
  readonly repository: LeaderboardRepository;
  readonly now?: () => Date;
  readonly reportError?: (error: unknown) => void;
}

const ALLOWED_METHODS = "GET, POST";

function errorBody(code: string, message: string): LeaderboardErrorResponse {
  return { error: { code, message } };
}

function invalidJson(): HallApplicationResult {
  return {
    status: 400,
    body: errorBody("INVALID_JSON", "Request body must be valid JSON."),
  };
}

function parseJson(source: string): { ok: true; value: unknown } | { ok: false } {
  if (!source) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(source) as unknown };
  } catch {
    return { ok: false };
  }
}

export function createHallApplication(options: HallApplicationOptions): HallApplication {
  const now = options.now ?? (() => new Date());
  const reportError =
    options.reportError ?? ((error: unknown) => console.error("Leaderboard API failed", error));

  return async (request) => {
    try {
      if (request.method === "GET") {
        const [entries, playerBiomeStars] = await Promise.all([
          options.repository.list(leaderboardLimit(request.limit)),
          options.repository.listBiomeStars(),
        ]);
        return {
          status: 200,
          body: { entries, playerBiomeStars, generatedAt: now().toISOString() },
        };
      }

      if (request.method === "POST") {
        const body = await request.readBody();
        if (!body.ok) {
          return {
            status: 413,
            body: errorBody("PAYLOAD_TOO_LARGE", "Request body is too large."),
          };
        }

        const json = parseJson(body.source);
        if (!json.ok) return invalidJson();

        const submission = parseLeaderboardSubmission(json.value);
        if (!submission.ok) {
          return {
            status: 400,
            body: errorBody(submission.code, submission.message),
          };
        }

        return {
          status: 201,
          body: { entry: await options.repository.create(submission.value) },
        };
      }

      return {
        status: 405,
        allow: ALLOWED_METHODS,
        body: errorBody("METHOD_NOT_ALLOWED", "Use GET or POST."),
      };
    } catch (error) {
      try {
        reportError(error);
      } catch {
        // Error reporting must not change the public failure contract.
      }
      return {
        status: 500,
        body: errorBody("LEADERBOARD_UNAVAILABLE", "Leaderboard is unavailable."),
      };
    }
  };
}
