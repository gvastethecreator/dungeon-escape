import { formatTime } from "../ui/copy";
import { expandBiomeStars } from "../systems/BiomeUi";
import type { LeaderboardEntry, PlayerBiomeStars } from "./contract";
import { frameForRank, portraitForIndex, portraitForName } from "./portraits";

export interface WelcomeLeaderboardRenderOptions {
  readonly list: HTMLOListElement;
  readonly entries: readonly LeaderboardEntry[];
  readonly playerBiomeStars: PlayerBiomeStars;
  readonly onPlaySeed: (entry: LeaderboardEntry) => void;
}

/** Render the Hall identically in the deferred welcome shell and full runtime. */
export function renderWelcomeLeaderboard(options: WelcomeLeaderboardRenderOptions): void {
  const { list, entries, playerBiomeStars, onPlaySeed } = options;
  const document = list.ownerDocument;
  const fragment = document.createDocumentFragment();

  for (const entry of entries) {
    const portrait =
      entry.portraitIndex !== undefined && entry.portraitIndex !== null
        ? portraitForIndex(entry.portraitIndex)
        : portraitForName(entry.playerName);
    const frame = frameForRank(entry.rank);
    const playerStars = playerBiomeStars[entry.playerName] ?? {};
    const starTokens = expandBiomeStars(playerStars);
    const item = document.createElement("li");
    const face = document.createElement("div");
    const portraitImg = document.createElement("img");
    const frameImg = document.createElement("img");
    const rank = document.createElement("span");
    const body = document.createElement("div");
    const top = document.createElement("div");
    const nameBlock = document.createElement("div");
    const name = document.createElement("span");
    const stars = document.createElement("div");
    const score = document.createElement("span");
    const meta = document.createElement("div");
    const time = document.createElement("span");
    const biome = document.createElement("span");
    const seed = document.createElement("button");

    item.className = `leaderboard-entry is-${frame.kind}`;
    face.className = `leaderboard-face is-${frame.kind}`;
    portraitImg.className = "leaderboard-portrait";
    frameImg.className = "leaderboard-frame";
    rank.className = "leaderboard-rank";
    body.className = "leaderboard-body";
    top.className = "leaderboard-top";
    nameBlock.className = "leaderboard-name-block";
    name.className = "leaderboard-name";
    stars.className = "leaderboard-stars";
    score.className = "leaderboard-score";
    meta.className = "leaderboard-meta";
    time.className = "leaderboard-time";
    biome.className = "leaderboard-biome";
    seed.className = "leaderboard-seed";
    seed.type = "button";

    portraitImg.src = portrait.src;
    portraitImg.alt = "";
    portraitImg.decoding = "async";
    portraitImg.loading = "lazy";
    portraitImg.draggable = false;
    frameImg.src = frame.src;
    frameImg.alt = "";
    frameImg.decoding = "async";
    frameImg.loading = "lazy";
    frameImg.draggable = false;
    frameImg.setAttribute("aria-hidden", "true");
    rank.textContent = String(entry.rank);
    rank.setAttribute("aria-label", `Rank ${entry.rank}`);
    name.textContent = entry.playerName;
    name.title = `${entry.biome} · ${entry.difficulty}`;
    if (starTokens.length > 0) {
      const counts = Object.entries(playerStars)
        .filter(([, count]) => count > 0)
        .map(([biomeLabel, count]) => `${biomeLabel}: ${count}`)
        .join(" · ");
      stars.title = counts;
      stars.setAttribute("aria-label", `Biome stars: ${counts}`);
      for (const token of starTokens) {
        const star = document.createElement("span");
        star.className = "leaderboard-star";
        if (token.id) star.dataset.biome = token.id;
        star.textContent = "★";
        star.style.color = token.color;
        star.title = token.label;
        stars.append(star);
      }
    } else {
      stars.hidden = true;
    }
    score.textContent = entry.score.toLocaleString("en-US");
    score.title = "Score";
    time.textContent = formatTime(entry.durationMs / 1000);
    time.title = "Escape time";
    biome.textContent = entry.biome;
    biome.title = "Biome";
    seed.textContent = entry.seed;
    seed.title = `Play seed ${entry.seed}`;
    seed.setAttribute("aria-label", `Play seed ${entry.seed}`);
    seed.addEventListener("click", (event) => {
      event.preventDefault();
      onPlaySeed(entry);
    });

    face.append(portraitImg, frameImg, rank);
    nameBlock.append(name, stars);
    top.append(nameBlock, score);
    meta.append(time, biome, seed);
    body.append(top, meta);
    item.append(face, body);
    fragment.append(item);
  }

  list.replaceChildren(fragment);
}
