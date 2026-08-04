import {
  LEADERBOARD_PORTRAIT_COUNT,
  portraitForIndex,
  randomPortraitIndex,
} from "./leaderboard/portraits";
import { loadLeaderboard } from "./leaderboard/client";
import { renderWelcomeLeaderboard } from "./leaderboard/render";
import { hashSeed } from "./core/random";
import { canContinueLocalRun, readLocalRunSave } from "./game/LocalRunSave";
import { shouldLoadDungeonRuntime } from "./shellRoute";
import { getBiomeIdentity, isBiomeId } from "./systems/BiomeIdentity";
import { resolveDungeonMood } from "./systems/DungeonMood";
import type { DungeonData } from "./dungeon/types";
import { BiomeScreenParticles } from "./ui/BiomeScreenParticles";
import "./styles.css";

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!(value instanceof HTMLElement)) throw new Error(`Missing shell element #${id}.`);
  return value as T;
}

const shell = document.querySelector<HTMLElement>(".app-shell");
const welcome = element<HTMLElement>("welcome-screen");
const welcomeContent = element<HTMLElement>("welcome-content");
const welcomeHome = element<HTMLElement>("welcome-home");
const welcomeSave = element<HTMLElement>("welcome-save");
const welcomeProfile = element<HTMLElement>("welcome-profile");
const welcomeLeaderboard = element<HTMLElement>("welcome-leaderboard");
const leaderboardList = element<HTMLOListElement>("leaderboard-list");
const leaderboardStatus = element<HTMLElement>("leaderboard-status");
const hallToggle = element<HTMLButtonElement>("welcome-hall-toggle");
const welcomeProfileForm = element<HTMLFormElement>("welcome-profile-form");
const profileName = element<HTMLInputElement>("welcome-profile-name");
const profileAvatar = element<HTMLImageElement>("welcome-profile-avatar-image");
const profileBack = element<HTMLButtonElement>("welcome-profile-back");
const profileSubmit = element<HTMLButtonElement>("welcome-profile-submit");
const continueButton = element<HTMLButtonElement>("welcome-continue");
const boot = element<HTMLElement>("boot-screen");
const bootFill = element<HTMLElement>("boot-fill");
const bootStatus = element<HTMLElement>("boot-status");
const status = element<HTMLElement>("welcome-status");
const particleCanvas = element<HTMLCanvasElement>("welcome-particles");
const particles = new BiomeScreenParticles(particleCanvas, "ancient", { seedSalt: 71 });
let runtimeStarted = false;
let avatarDraft = randomPortraitIndex();

function readShellProfile(): { name: string; avatarIndex: number } | null {
  try {
    const value = JSON.parse(localStorage.getItem("blackflag.dungeon.player.v1") ?? "null") as {
      version?: unknown;
      name?: unknown;
      avatarIndex?: unknown;
    } | null;
    const name = typeof value?.name === "string" ? value.name.trim().slice(0, 20) : "";
    const avatarIndex = value?.avatarIndex;
    if (
      value?.version !== 1 ||
      !name ||
      typeof avatarIndex !== "number" ||
      !Number.isInteger(avatarIndex) ||
      avatarIndex < 0 ||
      avatarIndex >= LEADERBOARD_PORTRAIT_COUNT
    ) {
      return null;
    }
    return { name, avatarIndex };
  } catch {
    return null;
  }
}

function showHome(): void {
  welcomeHome.hidden = false;
  welcomeProfile.hidden = true;
  welcomeLeaderboard.hidden = false;
  welcomeContent.classList.add("is-ranked");
}

function showProfile(required: boolean): void {
  welcomeHome.hidden = true;
  welcomeProfile.hidden = false;
  welcomeLeaderboard.hidden = false;
  welcomeContent.classList.add("is-ranked");
  profileBack.hidden = required;
  profileSubmit.textContent = required ? "START NEW GAME" : "SAVE CHANGES";
  window.requestAnimationFrame(() => profileName.focus());
}

function updateAvatar(): void {
  const portrait = portraitForIndex(avatarDraft);
  profileAvatar.src = portrait.src;
  profileAvatar.title = `Change avatar · ${portrait.title}`;
}

async function refreshLeaderboard(): Promise<void> {
  leaderboardStatus.textContent = "Reading records…";
  try {
    const response = await loadLeaderboard();
    renderWelcomeLeaderboard({
      list: leaderboardList,
      entries: response.entries,
      playerBiomeStars: response.playerBiomeStars ?? {},
      onPlaySeed: (entry) => {
        void loadRuntime({ type: "leaderboard-seed", seed: entry.seed, biome: entry.biome });
      },
    });
    hallToggle.hidden = response.entries.length <= 3;
    leaderboardStatus.textContent = response.entries.length
      ? `${response.entries.length} record${response.entries.length === 1 ? "" : "s"} in the hall.`
      : "No escapes recorded yet.";
  } catch (error) {
    renderWelcomeLeaderboard({
      list: leaderboardList,
      entries: [],
      playerBiomeStars: {},
      onPlaySeed: () => undefined,
    });
    hallToggle.hidden = true;
    leaderboardStatus.textContent = "Leaderboard unavailable.";
    console.warn("Leaderboard could not be loaded", error);
  }
}

function hydrateWelcome(): void {
  const profile = readShellProfile();
  if (profile) {
    avatarDraft = profile.avatarIndex;
    profileName.value = profile.name;
    element<HTMLElement>("welcome-player-name").textContent = profile.name;
    element<HTMLImageElement>("welcome-player-avatar").src = portraitForIndex(
      profile.avatarIndex,
    ).src;
    showHome();
  } else {
    showProfile(true);
  }
  updateAvatar();

  const save = readLocalRunSave();
  const canContinue = canContinueLocalRun(save);
  continueButton.disabled = !canContinue;
  welcomeSave.hidden = !canContinue;
  if (canContinue && save) {
    const biomeId = save.resume?.campaignBiomeId?.trim().toLowerCase();
    const biomeLabel =
      biomeId && isBiomeId(biomeId)
        ? getBiomeIdentity(biomeId).label
        : resolveDungeonMood(
            { seed: save.state.seed, seedHash: hashSeed(save.state.seed) } as DungeonData,
            save.state.profile,
          ).label;
    element<HTMLElement>("welcome-save-title").textContent = biomeLabel;
    element<HTMLElement>("welcome-save-details").textContent =
      `Floor ${save.state.floor} · Saved descent ready.`;
    element<HTMLElement>("welcome-save-meta").textContent = "CONTINUE AVAILABLE";
    status.textContent = "Choose Continue or begin a new descent.";
  } else {
    element<HTMLElement>("welcome-save-title").textContent = "";
    element<HTMLElement>("welcome-save-details").textContent = "";
    element<HTMLElement>("welcome-save-meta").textContent = "";
    status.textContent = "";
  }
  const musicButton = element<HTMLButtonElement>("welcome-music-toggle");
  let musicEnabled = true;
  try {
    musicEnabled = localStorage.getItem("dungeon-escape:music-muted") !== "1";
  } catch {
    // Preference storage is optional.
  }
  musicButton.setAttribute("aria-pressed", String(musicEnabled));
  musicButton.setAttribute("aria-label", musicEnabled ? "Disable music" : "Enable music");
  musicButton.classList.toggle("is-active", musicEnabled);
  musicButton.classList.toggle("is-muted", !musicEnabled);
}

async function loadRuntime(intent?: Window["__DUNGEON_SHELL_INTENT__"]): Promise<void> {
  if (runtimeStarted) return;
  runtimeStarted = true;
  if (shell) shell.dataset.runtimeState = "loading";
  window.__DUNGEON_SHELL_INTENT__ = intent;
  particles.destroy();
  welcome.hidden = true;
  boot.hidden = false;
  boot.classList.remove("is-done");
  boot.setAttribute("aria-busy", "true");
  bootFill.style.width = "12%";
  bootStatus.textContent = "Loading dungeon runtime…";
  document.body.classList.add("is-booting");
  try {
    await import("./main");
  } catch (error) {
    console.error("Dungeon runtime failed to load", error);
    bootStatus.textContent = "Runtime failed to load. Reload to retry.";
  }
}

function bindRouteButton(id: string): void {
  element<HTMLButtonElement>(id).addEventListener("click", (event) => {
    if (runtimeStarted) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void loadRuntime({ type: "click", targetId: id });
  });
}

for (const id of ["welcome-new", "welcome-continue", "welcome-custom"]) bindRouteButton(id);

element<HTMLButtonElement>("welcome-profile-edit").addEventListener("click", () =>
  showProfile(false),
);
profileBack.addEventListener("click", showHome);
element<HTMLButtonElement>("welcome-profile-avatar").addEventListener("click", () => {
  avatarDraft = (avatarDraft + 1) % LEADERBOARD_PORTRAIT_COUNT;
  updateAvatar();
});
welcomeProfileForm.addEventListener("submit", (event) => {
  if (runtimeStarted) return;
  event.preventDefault();
  void loadRuntime({
    type: "profile-submit",
    profileName: profileName.value,
    avatarIndex: avatarDraft,
  });
});

element<HTMLButtonElement>("welcome-hall-toggle").addEventListener("click", () => {
  const hall = element<HTMLElement>("welcome-leaderboard");
  const expanded = hall.classList.toggle("is-expanded");
  element<HTMLButtonElement>("welcome-hall-toggle").setAttribute("aria-expanded", String(expanded));
});
element<HTMLButtonElement>("welcome-music-toggle").addEventListener("click", (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  const musicEnabled = button.getAttribute("aria-pressed") !== "true";
  button.setAttribute("aria-pressed", String(musicEnabled));
  button.setAttribute("aria-label", musicEnabled ? "Disable music" : "Enable music");
  button.classList.toggle("is-active", musicEnabled);
  button.classList.toggle("is-muted", !musicEnabled);
  try {
    localStorage.setItem("dungeon-escape:music-muted", musicEnabled ? "0" : "1");
  } catch {
    // Preference storage is optional.
  }
});

if (shouldLoadDungeonRuntime(window.location.search)) {
  void loadRuntime();
} else {
  hydrateWelcome();
  void refreshLeaderboard();
  shell?.classList.add("is-welcome");
  shell?.setAttribute("data-runtime-state", "deferred");
  welcome.hidden = false;
  particles.setActive(true);
  document.body.classList.remove("is-booting");
  boot.hidden = true;
  boot.setAttribute("aria-busy", "false");
  window.requestAnimationFrame(() =>
    (continueButton.disabled ? element<HTMLButtonElement>("welcome-new") : continueButton).focus(),
  );
}
