import type {
  LeaderboardCreateResponse,
  LeaderboardErrorResponse,
  LeaderboardListResponse,
  LeaderboardSubmissionInput,
} from "./contract";

const LEADERBOARD_ENDPOINT = "/api/leaderboard";

async function responseError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as LeaderboardErrorResponse;
    if (body.error?.message) return new Error(body.error.message);
  } catch {
    // Use stable fallback below when an upstream proxy returns HTML or no body.
  }
  return new Error(`Leaderboard request failed (${response.status}).`);
}

async function fetchLeaderboardJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...init?.headers,
      },
    });
    if (!response.ok) throw await responseError(response);
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Leaderboard request timed out.");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export function loadLeaderboard(limit = 8): Promise<LeaderboardListResponse> {
  return fetchLeaderboardJson(`${LEADERBOARD_ENDPOINT}?limit=${encodeURIComponent(limit)}`);
}

export function submitLeaderboardEntry(
  submission: LeaderboardSubmissionInput,
): Promise<LeaderboardCreateResponse> {
  return fetchLeaderboardJson(LEADERBOARD_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(submission),
  });
}
