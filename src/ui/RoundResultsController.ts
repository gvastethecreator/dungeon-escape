import { compareLeaderboardScore } from "../leaderboard/comparison";
import type { LeaderboardEntry } from "../leaderboard/contract";
import { COPY } from "./copy";

export type RoundResultsState = {
  kind: "loading" | "ranked" | "empty" | "outside" | "unavailable" | "custom";
  rank: string;
  detail: string;
};

export type RoundResultsPublisher = (state: RoundResultsState) => void;
export type RoundResultsLoader = (
  limit: number,
) => Promise<{ entries: readonly LeaderboardEntry[] }>;

const TIMEOUT_MESSAGE = "Leaderboard request timed out.";

function scoreGap(score: number, leaderScore: number): string {
  const difference = score - leaderScore;
  if (difference > 0) return COPY.leaderboard.comparisonAhead(difference);
  if (difference === 0) return COPY.leaderboard.comparisonTied;
  return COPY.leaderboard.comparisonBehind(Math.abs(difference), leaderScore);
}

/** Owns the asynchronous Hall comparison shown on the round-results screen. */
export class RoundResultsController {
  private sequence = 0;
  private savedRank: number | null = null;
  private leaderScore: number | null = null;

  constructor(
    private readonly load: RoundResultsLoader,
    private readonly limit = 50,
  ) {}

  async begin(score: number, publish: RoundResultsPublisher): Promise<void> {
    const sequence = ++this.sequence;
    this.savedRank = null;
    this.leaderScore = null;
    publish({
      kind: "loading",
      rank: COPY.leaderboard.comparisonLoadingTitle,
      detail: COPY.leaderboard.comparisonLoading,
    });

    try {
      const response = await this.loadWithRetry(sequence);
      if (!response || sequence !== this.sequence) return;
      const comparison = compareLeaderboardScore(score, response.entries, this.limit);
      this.leaderScore = comparison.kind === "empty" ? null : comparison.leaderScore;
      if (this.savedRank !== null) {
        publish(this.savedState(this.savedRank, score));
        return;
      }
      if (comparison.kind === "empty") {
        publish({
          kind: "empty",
          rank: COPY.leaderboard.comparisonEmptyTitle,
          detail: COPY.leaderboard.comparisonEmpty,
        });
        return;
      }
      if (comparison.kind === "outside") {
        publish({
          kind: "outside",
          rank: COPY.leaderboard.comparisonOutside(comparison.limit),
          detail: scoreGap(score, comparison.leaderScore),
        });
        return;
      }
      publish({
        kind: "ranked",
        rank: COPY.leaderboard.comparisonProjected(comparison.projectedRank),
        detail: scoreGap(score, comparison.leaderScore),
      });
    } catch {
      if (sequence !== this.sequence) return;
      this.leaderScore = null;
      publish({
        kind: "unavailable",
        rank: COPY.leaderboard.comparisonUnavailableTitle,
        detail: COPY.leaderboard.comparisonUnavailable,
      });
    }
  }

  save(rank: number, score: number, publish: RoundResultsPublisher): void {
    this.savedRank = rank;
    publish(this.savedState(rank, score));
  }

  showCustom(publish: RoundResultsPublisher): void {
    this.reset();
    publish({
      kind: "custom",
      rank: COPY.leaderboard.comparisonCustomTitle,
      detail: COPY.leaderboard.customExcluded,
    });
  }

  reset(): void {
    this.sequence += 1;
    this.savedRank = null;
    this.leaderScore = null;
  }

  private async loadWithRetry(
    sequence: number,
  ): Promise<{ entries: readonly LeaderboardEntry[] } | null> {
    try {
      return await this.load(this.limit);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== TIMEOUT_MESSAGE) throw error;
      if (sequence !== this.sequence) return null;
      return this.load(this.limit);
    }
  }

  private savedState(rank: number, score: number): RoundResultsState {
    const detail =
      rank === 1
        ? COPY.leaderboard.comparisonLeader
        : this.leaderScore === null
          ? COPY.leaderboard.comparisonSavedDetail
          : scoreGap(score, this.leaderScore);
    return {
      kind: "ranked",
      rank: COPY.leaderboard.comparisonSavedRank(rank),
      detail,
    };
  }
}
