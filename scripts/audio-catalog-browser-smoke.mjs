import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:24211";
const allBiomes = [
  "ancient",
  "molten",
  "frost",
  "grim",
  "verdant",
  "ash",
  "iron",
  "obsidian",
  "sunken",
  "fungal",
  "backrooms",
];
const requestedBiomes = (process.env.BIOMES || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const biomes = requestedBiomes.length
  ? allBiomes.filter((biome) => requestedBiomes.includes(biome))
  : allBiomes;
const gestures = ["pointer", "keyboard", "touch"];
const forcedGesture = gestures.includes(process.env.GESTURE) ? process.env.GESTURE : null;
const results = [];
const errors = [];
const cdpPort = 9333;
const profile = await mkdtemp(join(tmpdir(), "dungeon-audio-smoke-"));
const chrome = Bun.spawn(
  [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profile}`,
    "--headless=new",
    "--disable-gpu-sandbox",
    "--no-first-run",
    "--window-size=1280,720",
    "about:blank",
  ],
  { stdout: "ignore", stderr: "ignore" },
);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let socket = null;
let currentBiome = "boot";

try {
  let debuggerUrl = "";
  for (let attempt = 0; attempt < 120 && !debuggerUrl; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        debuggerUrl = targets.find((target) => target.type === "page")?.webSocketDebuggerUrl ?? "";
      }
    } catch {
      // Chrome is still starting.
    }
    if (!debuggerUrl) await sleep(250);
  }
  if (!debuggerUrl) throw new Error("Chrome CDP did not become ready.");

  socket = new WebSocket(debuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error("Chrome CDP WebSocket failed."));
  });

  let nextId = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(request.timeout);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
      return;
    }
    if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") {
      errors.push(`${currentBiome}: ${message.params.entry.text}`);
    }
    if (message.method === "Runtime.exceptionThrown") {
      errors.push(`${currentBiome}: ${JSON.stringify(message.params?.exceptionDetails ?? {})}`);
    }
    if (message.method === "Network.responseReceived") {
      const response = message.params?.response;
      if (response?.url?.includes("/assets/audio/") && response.status >= 400) {
        errors.push(`${currentBiome}: ${response.status} ${response.url}`);
      }
    }
    if (message.method === "Network.loadingFailed" && !message.params?.canceled) {
      errors.push(`${currentBiome}: ${message.params?.errorText ?? "network load failed"}`);
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 30_000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expression) => {
    const response = await send("Runtime.evaluate", { expression, returnByValue: true });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result?.value;
  };

  const waitFor = async (expression, label, timeoutMilliseconds = 45_000) => {
    const deadline = Date.now() + timeoutMilliseconds;
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return;
      await sleep(250);
    }
    const diagnostics = await evaluate(`(() => ({
      location: location.href,
      rendererReady: document.querySelector('.app-shell')?.dataset.rendererReady ?? null,
      runtime: window.__THREE_GAME_DIAGNOSTICS__?.getState?.() ?? null,
      audio: window.__THREE_GAME_DIAGNOSTICS__?.getAudio?.() ?? null,
    }))()`);
    throw new Error(`${currentBiome}: ${label} timed out: ${JSON.stringify(diagnostics)}`);
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      localStorage.setItem('blackflag.dungeon.player.v1', JSON.stringify({
        version: 1,
        name: 'audio-smoke',
        avatarIndex: 0,
        hasCompletedRun: true,
        highestUnlockedRank: 10,
        clears: { ancient: 1 },
        updatedAt: Date.now(),
      }));
    })()`,
  });

  for (let index = 0; index < biomes.length; index += 1) {
    const biome = biomes[index];
    const gesture = forcedGesture ?? gestures[index % gestures.length];
    currentBiome = biome;
    const url = `${baseUrl}/?mode=play&seed=audio-smoke-${biome}&skipRunIntro=1&mood=${biome}&perfAudit=1&qaState=critical`;
    await send("Page.navigate", { url });
    await waitFor(
      `window.__BLACK_FLAG_DUNGEON_ENGINE__?.ready === true && Boolean(window.__THREE_GAME_DIAGNOSTICS__?.getAudio) && document.querySelector('.app-shell')?.dataset.rendererReady === 'true'`,
      "engine ready",
    );

    if (gesture === "pointer") {
      await Promise.all([
        send("Input.dispatchMouseEvent", {
          type: "mousePressed",
          x: 12,
          y: 12,
          button: "left",
          clickCount: 1,
        }),
        send("Input.dispatchMouseEvent", {
          type: "mouseReleased",
          x: 12,
          y: 12,
          button: "left",
          clickCount: 1,
        }),
      ]);
    } else if (gesture === "keyboard") {
      await send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "w",
        code: "KeyW",
        windowsVirtualKeyCode: 87,
      });
      await send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "w",
        code: "KeyW",
        windowsVirtualKeyCode: 87,
      });
    } else {
      // CDP's raw touch injection does not grant autoplay activation in
      // headless Chrome. userGesture exercises the touchstart fallback under
      // the same browser activation policy as a physical touch.
      await send("Runtime.evaluate", {
        expression:
          "document.dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true }))",
        userGesture: true,
        awaitPromise: true,
      });
    }

    const expectedAmbience = `ambience-biome-${biome}`;
    await waitFor(
      `(() => {
        const audio = window.__THREE_GAME_DIAGNOSTICS__?.getAudio?.();
        return audio?.contextState === 'running' && audio?.ready === true && audio?.currentAmbienceAsset === ${JSON.stringify(expectedAmbience)};
      })()`,
      "audio ready",
      30_000,
    );
    const audio = await evaluate("window.__THREE_GAME_DIAGNOSTICS__.getAudio()");
    results.push({ biome, gesture, ...audio });
  }
} finally {
  socket?.close();
  chrome.kill();
  await chrome.exited;
  await rm(profile, { recursive: true, force: true });
}

const summary = {
  ok: errors.length === 0 && results.length === biomes.length,
  coldStarts: results.length,
  gestureMatrix: Object.fromEntries(
    gestures.map((gesture) => [
      gesture,
      results.filter((result) => result.gesture === gesture).length,
    ]),
  ),
  results,
  errors,
};
console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exitCode = 1;
