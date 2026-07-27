import { D1LeaderboardRepository } from "./D1LeaderboardRepository";
import { handleLeaderboardApi } from "./leaderboardApi";

export interface Env {
  LEADERBOARD_DB: D1Database;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/leaderboard") {
      return handleLeaderboardApi(request, new D1LeaderboardRepository(env.LEADERBOARD_DB));
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
