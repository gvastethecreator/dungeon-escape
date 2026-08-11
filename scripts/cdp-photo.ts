import { mkdir, rename } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import { validateDungeonLoadTrace, type DungeonLoadTraceSnapshot } from "./capture-dungeon-load-g0";
import { listBiomeIds } from "../src/systems/BiomeIdentity";

/**
 * CDP photo tool: headless Chrome screenshots with in-scene teleports.
 * Requires the Dungeon Escape dev server running on :24211.
 *
 * Usage:
 *   bun run scripts/cdp-photo.ts <seed> <outDir> [nameSubstring,dx,dz,pitch,label,instanceIndex,aimHeight,captureMode]...
 *   BIOME=frost MOOD=frost bun run scripts/cdp-photo.ts BIOME-1 .proof-hud
 *
 * Example:
 *   bun run scripts/cdp-photo.ts ash-demo .proof-hud "Resolve flask,1.6,1.6,-0.25,flask"
 *
 * With no shot specs it captures the spawn view only.
 * Set env BIOME to pick a real campaign biome.
 * Set env MOOD (or THEME) to force `?mood=` lighting; it also picks the biome when BIOME is absent.
 * Set env CRT=off to capture without the CRT composite (defaults to the live CRT setting).
 * Set env PHOTO_SIMULATION=off only when a frozen pre-play frame is required; live capture is the default.
 * Set env QA_STATE=portal to open the real four-stone portal for capture.
 * Set env ESCAPE_SMOKE=on to press Escape twice and capture the options open/close path.
 * Set env PHOTO_WIDTH and PHOTO_HEIGHT to inspect a responsive viewport.
 * Set env PERF_SECONDS=12 to record live p95/p99/max frame gaps after the shots.
 * Set env PHOTO_BASE_URL to profile a production preview on a different port.
 */

interface CdpTarget {
  webSocketDebuggerUrl: string;
}

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9300 + (process.pid % 500);
const BASE = (process.env.PHOTO_BASE_URL ?? "http://127.0.0.1:24211").replace(/\/$/, "");
const PROFILE = `${process.env.TEMP ?? "."}\\dungeon-escape-cdp-${process.pid}`;
const G0_HIGHEST_UNLOCKED_RANK = listBiomeIds().length - 1;
const PERF_SECONDS = Number.parseFloat(process.env.PERF_SECONDS ?? "0");
if (!Number.isFinite(PERF_SECONDS) || PERF_SECONDS < 0 || PERF_SECONDS > 120)
  throw new Error(`PERF_SECONDS must be between 0 and 120; received ${String(PERF_SECONDS)}.`);
const CDP_COMMAND_TIMEOUT_MS = Number.parseInt(process.env.CDP_COMMAND_TIMEOUT_MS ?? "15000", 10);
if (!Number.isFinite(CDP_COMMAND_TIMEOUT_MS) || CDP_COMMAND_TIMEOUT_MS < 1000)
  throw new Error(
    `CDP_COMMAND_TIMEOUT_MS must be at least 1000; received ${String(CDP_COMMAND_TIMEOUT_MS)}.`,
  );
const CRT = (process.env.CRT ?? "").trim().toLowerCase();
if (CRT && CRT !== "on" && CRT !== "off")
  throw new Error(`CRT must be "on" or "off"; received ${JSON.stringify(CRT)}.`);
const PHOTO_SIMULATION = (process.env.PHOTO_SIMULATION ?? "on").trim().toLowerCase();
if (PHOTO_SIMULATION !== "on" && PHOTO_SIMULATION !== "off")
  throw new Error(
    `PHOTO_SIMULATION must be "on" or "off"; received ${JSON.stringify(PHOTO_SIMULATION)}.`,
  );
const ESCAPE_SMOKE = (process.env.ESCAPE_SMOKE ?? "off").trim().toLowerCase();
if (ESCAPE_SMOKE !== "on" && ESCAPE_SMOKE !== "off")
  throw new Error(`ESCAPE_SMOKE must be "on" or "off"; received ${JSON.stringify(ESCAPE_SMOKE)}.`);
const PHOTO_WIDTH = Number.parseInt(process.env.PHOTO_WIDTH ?? "1600", 10);
const PHOTO_HEIGHT = Number.parseInt(process.env.PHOTO_HEIGHT ?? "900", 10);
if (!Number.isInteger(PHOTO_WIDTH) || PHOTO_WIDTH < 320 || PHOTO_WIDTH > 4_000)
  throw new Error(`PHOTO_WIDTH must be an integer from 320 to 4000; received ${PHOTO_WIDTH}.`);
if (!Number.isInteger(PHOTO_HEIGHT) || PHOTO_HEIGHT < 320 || PHOTO_HEIGHT > 4_000)
  throw new Error(`PHOTO_HEIGHT must be an integer from 320 to 4000; received ${PHOTO_HEIGHT}.`);

type G0Workload = "backrooms" | "frost";
type G0Status = "passed" | "failed" | "timed_out" | "cleanup_failed";

interface G0Config {
  readonly sampleDir: string;
  readonly sampleId: string;
  readonly workload: G0Workload;
}

interface G0Diagnostics {
  readonly dataset: Record<string, string>;
  readonly mapLoad: Record<string, string>;
  readonly userAgent: string | null;
  readonly location: string | null;
  readonly devicePixelRatio: number | null;
  readonly canvas: {
    width: number;
    height: number;
    clientWidth: number;
    clientHeight: number;
  } | null;
  readonly renderer: unknown;
  readonly runtime: unknown;
  readonly floorCount: number | null;
  readonly traceLiteral: string | null;
  readonly webgl: {
    readonly version: string | null;
    readonly vendor: string | null;
    readonly renderer: string | null;
    readonly unmaskedVendor: string | null;
    readonly unmaskedRenderer: string | null;
  };
}

class G0TraceTimeoutError extends Error {}

class CdpCommandTimeoutError extends Error {
  readonly phase: string;

  constructor(method: string, phase: string, timeoutMs: number) {
    super(`CDP command ${method} timed out during ${phase} after ${timeoutMs} ms.`);
    this.name = "CdpCommandTimeoutError";
    this.phase = phase;
  }
}

const moodParam = (process.env.MOOD ?? process.env.THEME ?? "").trim().toLowerCase();
const biomeParam = (process.env.BIOME ?? moodParam).trim().toLowerCase();
const qaState = (process.env.QA_STATE ?? "").trim().toLowerCase();

function readG0Config(): G0Config | null {
  const sampleDir = process.env.DUNGEON_LOAD_G0_SAMPLE_DIR;
  if (sampleDir === undefined) return null;
  if (!isAbsolute(sampleDir))
    throw new Error("DUNGEON_LOAD_G0_SAMPLE_DIR must be an absolute directory.");
  const sampleId = (process.env.DUNGEON_LOAD_G0_SAMPLE_ID ?? "").trim();
  if (!sampleId) throw new Error("DUNGEON_LOAD_G0_SAMPLE_ID is required in G0 mode.");
  const workload = (process.env.DUNGEON_LOAD_G0_WORKLOAD ?? "").trim().toLowerCase();
  if (workload !== "backrooms" && workload !== "frost")
    throw new Error("DUNGEON_LOAD_G0_WORKLOAD must be backrooms or frost.");
  const explicitBiome = (process.env.BIOME ?? "").trim().toLowerCase();
  if (explicitBiome !== workload)
    throw new Error("DUNGEON_LOAD_G0_WORKLOAD must match the explicit BIOME.");
  if (qaState) throw new Error("G0 mode does not permit QA_STATE.");
  if (CRT !== "off") throw new Error("G0 mode requires CRT=off.");
  return { sampleDir, sampleId, workload };
}

const g0 = readG0Config();

const seed = process.argv[2] ?? "ash-demo";
const outDir = g0?.sampleDir ?? process.argv[3] ?? ".proof-hud";
const shotSpecs = process.argv.slice(4);

let messageId = 0;
const pending = new Map<
  number,
  {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
    timeout: ReturnType<typeof setTimeout>;
  }
>();
const browserErrors: string[] = [];
const networkErrors: string[] = [];
const captureRecords: Array<{
  label: string;
  image: string;
  target?: string;
  status?: string;
  animationSample?: { frameA: number; frameB: number; blend: number };
}> = [];

function send(
  ws: WebSocket,
  method: string,
  params: Record<string, unknown> = {},
  phase = method,
): Promise<unknown> {
  const id = ++messageId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new CdpCommandTimeoutError(method, phase, CDP_COMMAND_TIMEOUT_MS));
    }, CDP_COMMAND_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timeout });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeG0JsonAtomically(
  fileName: "started.json" | "result.json",
  value: unknown,
): Promise<void> {
  if (!g0) return;
  const destination = join(g0.sampleDir, fileName);
  const temporary = join(g0.sampleDir, `.${fileName}.${process.pid}.${Date.now()}.tmp`);
  await Bun.write(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, destination);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function waitForG0Trace(
  ws: WebSocket,
): Promise<{ readonly literal: string; readonly trace: DungeonLoadTraceSnapshot }> {
  const deadline = Date.now() + 90_000;
  let lastState: unknown = null;
  while (Date.now() < deadline) {
    const result = (await send(
      ws,
      "Runtime.evaluate",
      {
        expression: `(() => {
          const scene = document.querySelector('#scene');
          if (!(scene instanceof HTMLElement)) return { dataset: {}, traceLiteral: null };
          return {
            dataset: { ...scene.dataset },
            traceLiteral: scene.dataset.dungeonLoadTrace ?? null,
          };
        })()`,
        returnByValue: true,
      },
      "trace",
    )) as {
      result?: { value?: { dataset?: Record<string, string>; traceLiteral?: string | null } };
    };
    const observed = result.result?.value ?? {};
    const dataset = observed.dataset ?? {};
    const terminal = dataset.dungeonLoadTerminal ?? null;
    lastState = { dataset, traceLiteral: observed.traceLiteral ?? null };
    if (terminal && terminal !== "complete")
      throw new Error(`G0 dungeon load ended as ${terminal}.`);
    if (terminal === "complete" && observed.traceLiteral === null)
      throw new Error("G0 dungeon load completed without dungeonLoadTrace.");
    if (observed.traceLiteral !== null && observed.traceLiteral !== undefined) {
      if (!dataset.dungeonLoadId)
        throw new Error("G0 dungeon load trace is missing dungeonLoadId.");
      let parsed: unknown;
      try {
        parsed = JSON.parse(observed.traceLiteral);
      } catch {
        throw new Error("G0 dungeonLoadTrace is not valid JSON.");
      }
      const validation = validateDungeonLoadTrace(parsed, dataset.dungeonLoadId);
      if (!validation.ok) throw new Error(`G0 dungeonLoadTrace is invalid: ${validation.error}`);
      return { literal: observed.traceLiteral, trace: validation.value };
    }
    await sleep(250);
  }
  throw new G0TraceTimeoutError(`G0 dungeon load trace timed out: ${JSON.stringify(lastState)}`);
}

async function collectG0Diagnostics(ws: WebSocket): Promise<G0Diagnostics> {
  const result = (await send(
    ws,
    "Runtime.evaluate",
    {
      expression: `(() => {
        const diag = window.__THREE_GAME_DIAGNOSTICS__;
        const canvas = document.querySelector('#scene');
        const dataset = canvas instanceof HTMLElement ? { ...canvas.dataset } : {};
        const mapLoad = Object.fromEntries(
          Object.entries(dataset).filter(([key]) => key.startsWith('mapLoad')),
        );
        const runtime = diag?.getState?.() ?? null;
        const residentFloorCount = diag?.getResidentFloorCount?.();
        const gl = canvas instanceof HTMLCanvasElement
          ? canvas.getContext('webgl2') || canvas.getContext('webgl')
          : null;
        const debugRendererInfo = gl?.getExtension('WEBGL_debug_renderer_info') ?? null;
        const readString = (parameter) => {
          if (!gl || parameter === null || parameter === undefined) return null;
          const value = gl.getParameter(parameter);
          return typeof value === 'string' ? value : null;
        };
        return {
          dataset,
          mapLoad,
          userAgent: navigator.userAgent ?? null,
          location: location.href ?? null,
          devicePixelRatio: Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : null,
          canvas: canvas instanceof HTMLCanvasElement
            ? { width: canvas.width, height: canvas.height, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight }
            : null,
          renderer: diag?.getRenderer?.() ?? null,
          runtime,
          floorCount: Number.isInteger(residentFloorCount) && residentFloorCount > 0
            ? residentFloorCount
            : null,
          traceLiteral: canvas instanceof HTMLElement ? canvas.dataset.dungeonLoadTrace ?? null : null,
          webgl: {
            version: readString(gl?.VERSION),
            vendor: readString(gl?.VENDOR),
            renderer: readString(gl?.RENDERER),
            unmaskedVendor: readString(debugRendererInfo?.UNMASKED_VENDOR_WEBGL),
            unmaskedRenderer: readString(debugRendererInfo?.UNMASKED_RENDERER_WEBGL),
          },
        };
      })()`,
      returnByValue: true,
    },
    "diagnostics",
  )) as { result?: { value?: G0Diagnostics } };
  return (
    result.result?.value ?? {
      dataset: {},
      mapLoad: {},
      userAgent: null,
      location: null,
      devicePixelRatio: null,
      canvas: null,
      renderer: null,
      runtime: null,
      floorCount: null,
      traceLiteral: null,
      webgl: {
        version: null,
        vendor: null,
        renderer: null,
        unmaskedVendor: null,
        unmaskedRenderer: null,
      },
    }
  );
}

function validateG0DiagnosticsTrace(diagnostics: G0Diagnostics): {
  readonly literal: string;
  readonly trace: DungeonLoadTraceSnapshot;
} {
  if (!diagnostics.traceLiteral)
    throw new Error("G0 final diagnostics did not contain dungeonLoadTrace.");
  const datasetId = diagnostics.dataset.dungeonLoadId;
  if (!datasetId) throw new Error("G0 final diagnostics did not contain dungeonLoadId.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(diagnostics.traceLiteral);
  } catch {
    throw new Error("G0 final dungeonLoadTrace is not valid JSON.");
  }
  const validation = validateDungeonLoadTrace(parsed, datasetId);
  if (!validation.ok) throw new Error(`G0 final dungeonLoadTrace is invalid: ${validation.error}`);
  return { literal: diagnostics.traceLiteral, trace: validation.value };
}

function g0TraceMetrics(trace: DungeonLoadTraceSnapshot): Record<string, unknown> {
  return {
    totalMs: trace.totalMs,
    firstUsableFrameMs: trace.firstUsableFrame?.atMs ?? null,
    inputReadyMs: trace.inputReady?.atMs ?? null,
    spans: {
      generation: trace.generation?.durationMs ?? null,
      plan: trace.plan?.durationMs ?? null,
      sceneCommit: trace.sceneCommit?.durationMs ?? null,
      actors: trace.actors?.durationMs ?? null,
      colliderIndex: trace.colliderIndex?.durationMs ?? null,
      texturePolicy: trace.texturePolicy?.durationMs ?? null,
      atmosphere: trace.atmosphere?.durationMs ?? null,
      editorProjection: trace.editorProjection?.durationMs ?? null,
      warmup: trace.warmup?.durationMs ?? null,
    },
  };
}

async function waitForDebugger(): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = (await res.json()) as CdpTarget[];
      const page = targets.find((t) => (t as unknown as { type: string }).type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* retry */
    }
    await sleep(250);
  }
  throw new Error("Chrome debugger did not come up.");
}

async function readReadyState(
  ws: WebSocket,
  phase: "app-ready" | "renderer-ready",
): Promise<{
  diagnostics?: boolean;
  bootHidden?: boolean;
  rendererReady?: string;
}> {
  const state = (await send(
    ws,
    "Runtime.evaluate",
    {
      expression: `(() => ({
        diagnostics: Boolean(window.__THREE_GAME_DIAGNOSTICS__),
        bootHidden: Boolean(document.querySelector('#boot-screen')?.hidden),
        rendererReady: document.querySelector('.app-shell')?.dataset.rendererReady ?? '',
      }))()`,
      returnByValue: true,
    },
    phase,
  )) as {
    result?: { value?: { diagnostics?: boolean; bootHidden?: boolean; rendererReady?: string } };
  };
  return state.result?.value ?? {};
}

async function waitForAppReady(ws: WebSocket, timeoutMs = 25_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastValue: unknown = null;
  while (Date.now() < deadline) {
    const value = await readReadyState(ws, "app-ready");
    lastValue = value;
    if (value.diagnostics && (value.bootHidden || value.rendererReady === "true")) return;
    await sleep(500);
  }
  throw new Error(
    `Dungeon page did not reach app-ready state: ${JSON.stringify({ lastValue, browserErrors, networkErrors })}`,
  );
}

async function waitForGameReady(ws: WebSocket, timeoutMs = 25_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastValue: unknown = null;
  while (Date.now() < deadline) {
    const value = await readReadyState(ws, "renderer-ready");
    lastValue = value;
    if (value.diagnostics && value.rendererReady === "true") return;
    await sleep(500);
  }
  throw new Error(
    `Dungeon page did not reach renderer-ready state: ${JSON.stringify({ lastValue, browserErrors, networkErrors })}`,
  );
}

async function setRequestedCrt(ws: WebSocket): Promise<void> {
  if (!CRT) return;
  const crtStatus = (await send(
    ws,
    "Runtime.evaluate",
    {
      expression: `(() => {
        const toggle = document.querySelector('#crt-toggle');
        if (!(toggle instanceof HTMLButtonElement) || toggle.disabled) return 'MISSING';
        const desired = ${JSON.stringify(CRT)} === 'on';
        const current = toggle.getAttribute('aria-pressed') === 'true';
        if (current !== desired) toggle.click();
        return toggle.getAttribute('aria-pressed') === String(desired) ? 'OK' : 'MISMATCH';
      })()`,
      returnByValue: true,
    },
    "crt",
  )) as { result?: { value?: string } };
  if (crtStatus.result?.value !== "OK")
    throw new Error(`CRT state could not be set (${crtStatus.result?.value ?? "unknown"}).`);
  await sleep(300);
}

let g0StartedAt: string | null = null;
if (g0) {
  await mkdir(g0.sampleDir, { recursive: true });
  g0StartedAt = new Date().toISOString();
  await writeG0JsonAtomically("started.json", {
    schema: "dungeon-load-g0-browser-started/v1",
    sampleId: g0.sampleId,
    workload: g0.workload,
    bunPid: process.pid,
    chromePid: null,
    startedAt: g0StartedAt,
  });
}

const chromeArgs = [
  CHROME,
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  "--headless=new",
  "--disable-gpu-sandbox",
  "--no-first-run",
  `--window-size=${PHOTO_WIDTH},${PHOTO_HEIGHT}`,
  "--hide-scrollbars",
  "about:blank",
];
let chrome: ReturnType<typeof Bun.spawn> | null = null;
let g0ChromePid: number | null = null;
let g0ChromeExitCode: number | null = null;
let g0CleanupError: string | null = null;
let g0RunError: unknown = null;
let g0FinalizationError: Error | null = null;
let g0TimedOut = false;
let g0FailurePhase: string | null = null;
let g0Trace: DungeonLoadTraceSnapshot | null = null;
let g0Diagnostics: G0Diagnostics | null = null;
let g0BrowserVersion: unknown = null;

try {
  chrome = Bun.spawn(chromeArgs, { stdout: "ignore", stderr: "ignore" });
  if (g0) {
    g0ChromePid = chrome.pid;
    await writeG0JsonAtomically("started.json", {
      schema: "dungeon-load-g0-browser-started/v1",
      sampleId: g0.sampleId,
      workload: g0.workload,
      bunPid: process.pid,
      chromePid: g0ChromePid,
      startedAt: g0StartedAt,
    });
  }
  const wsUrl = await waitForDebugger();
  const ws = new WebSocket(wsUrl);
  ws.onmessage = (event) => {
    const msg = JSON.parse(String(event.data)) as {
      id?: number;
      result?: unknown;
      error?: unknown;
      method?: string;
      params?: {
        entry?: { level?: string; text?: string };
        exceptionDetails?: unknown;
        response?: { status?: number; url?: string };
        errorText?: string;
        canceled?: boolean;
      };
    };
    if (msg.id && pending.has(msg.id)) {
      const entry = pending.get(msg.id)!;
      pending.delete(msg.id);
      clearTimeout(entry.timeout);
      if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
      else entry.resolve(msg.result);
      return;
    }
    if (msg.method === "Log.entryAdded" && msg.params?.entry?.level === "error")
      browserErrors.push(msg.params.entry.text ?? "Unknown browser log error");
    if (msg.method === "Runtime.exceptionThrown")
      browserErrors.push(JSON.stringify(msg.params?.exceptionDetails ?? "Runtime exception"));
    if (msg.method === "Network.responseReceived") {
      const response = msg.params?.response;
      if (response?.status && response.status >= 400)
        networkErrors.push(`${response.status} ${response.url ?? "unknown URL"}`);
    }
    if (msg.method === "Network.loadingFailed" && !msg.params?.canceled)
      networkErrors.push(msg.params?.errorText ?? "Network loading failed");
  };
  await new Promise<void>((resolve) => {
    ws.onopen = () => resolve();
  });

  await send(ws, "Page.enable");
  await send(ws, "Runtime.enable");
  await send(ws, "Log.enable");
  await send(ws, "Network.enable");
  await send(ws, "Emulation.setDeviceMetricsOverride", {
    width: PHOTO_WIDTH,
    height: PHOTO_HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });
  if (g0) g0BrowserVersion = await send(ws, "Browser.getVersion");
  // Photo runs are QA runs. Unlock the picker before application boot so any
  // requested biome uses the same real New Game path as a progressed profile.
  await send(ws, "Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      try {
        localStorage.setItem('blackflag.dungeon.player.v1', JSON.stringify({
          version: 1,
          name: 'unlock',
          avatarIndex: 0,
          hasCompletedRun: true,
          highestUnlockedRank: ${JSON.stringify(G0_HIGHEST_UNLOCKED_RANK)},
          clears: { ancient: 1 },
          updatedAt: Date.now(),
        }));
      } catch (_) {}
    })()`,
  });
  const moodQuery = moodParam ? `&mood=${encodeURIComponent(moodParam)}` : "";
  // Every photo run is a QA run. The flag keeps the requested campaign seed
  // deterministic while normal New Game continues to generate fresh seeds.
  const qaQuery = `&perfAudit=1${qaState ? `&qaState=${encodeURIComponent(qaState)}` : ""}`;
  await send(ws, "Page.navigate", {
    // skipRunIntro keeps photo capture on the play scene without waiting for map theater.
    url: `${BASE}/?mode=play&seed=${encodeURIComponent(seed)}&skipRunIntro=1${moodQuery}${qaQuery}`,
  });
  await sleep(1000);
  await waitForAppReady(ws);
  if (g0) await setRequestedCrt(ws);

  const openedPicker = qaState
    ? null
    : ((await send(
        ws,
        "Runtime.evaluate",
        {
          expression: `(() => {
      const button = document.querySelector("#welcome-new");
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      button.click();
      return true;
    })()`,
          returnByValue: true,
        },
        "welcome-picker",
      )) as { result?: { value?: boolean } });
  if (g0 && openedPicker?.result?.value !== true)
    throw new Error("G0 did not open the real biome picker.");
  if (openedPicker?.result?.value) {
    let started = false;
    for (let attempt = 0; attempt < 12 && !started; attempt += 1) {
      await sleep(attempt === 0 ? 250 : 400);
      const result = (await send(
        ws,
        "Runtime.evaluate",
        {
          expression: `(() => {
          const preferred = ${JSON.stringify(biomeParam)};
          const option = preferred
            ? document.querySelector('.biome-picker-option[data-biome-id="' + preferred + '"]')
            : document.querySelector(".biome-picker-option:not([disabled])");
          if (!(option instanceof HTMLButtonElement) || option.disabled) return false;
          option.click();
          return true;
        })()`,
          returnByValue: true,
        },
        "biome-start",
      )) as { result?: { value?: boolean } };
      started = result.result?.value === true;
    }
    if (!started) throw new Error("Biome picker did not start a new game.");
    await sleep(2500);
  }

  await waitForGameReady(ws);
  if (g0) {
    const observedTrace = await waitForG0Trace(ws);
    g0Trace = observedTrace.trace;
  }

  if (qaState) {
    await send(
      ws,
      "Runtime.evaluate",
      {
        expression: `(() => {
          const boot = document.querySelector('#boot-screen');
          document.body.classList.remove('is-booting');
          if (boot instanceof HTMLElement) boot.hidden = true;
        })()`,
      },
      "qa-state",
    );
  }

  if (!g0) await setRequestedCrt(ws);

  if (PHOTO_SIMULATION === "on") {
    // Use a trusted CDP gesture before the synthetic touch helper. Otherwise
    // Chromium keeps AudioContext suspended and the smoke misses decode/load
    // stutters that real players trigger on their first click.
    await send(
      ws,
      "Input.dispatchKeyEvent",
      {
        type: "rawKeyDown",
        key: "F13",
        code: "F13",
        windowsVirtualKeyCode: 124,
        nativeVirtualKeyCode: 124,
      },
      "simulation-audio-gesture",
    );
    await send(
      ws,
      "Input.dispatchKeyEvent",
      {
        type: "keyUp",
        key: "F13",
        code: "F13",
        windowsVirtualKeyCode: 124,
        nativeVirtualKeyCode: 124,
      },
      "simulation-audio-gesture",
    );
    const simulationStatus = (await send(
      ws,
      "Runtime.evaluate",
      {
        expression: `(() => {
        const diag = window.__THREE_GAME_DIAGNOSTICS__;
        const prompt = document.querySelector('#interaction-prompt');
        if (!diag || !(prompt instanceof HTMLElement)) return 'MISSING';
        prompt.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerId: 76,
          pointerType: 'touch',
        }));
        diag.getController().setEnabled(true);
        return 'STARTED';
      })()`,
        returnByValue: true,
      },
      "simulation-start",
    )) as { result?: { value?: string } };
    if (simulationStatus.result?.value !== "STARTED")
      throw new Error(
        `Live photo simulation could not start (${simulationStatus.result?.value ?? "unknown"}).`,
      );
    await sleep(500);
  }

  async function capture(label: string): Promise<void> {
    const shot = (await send(ws, "Page.captureScreenshot", { format: "png" })) as { data: string };
    const path = `${outDir}/${label}.png`;
    await Bun.write(path, Buffer.from(shot.data, "base64"));
    captureRecords.push({ label, image: `${label}.png` });
    console.log(`saved ${path}`);
  }

  let escapeSmokeResult: {
    before: { open: boolean; hidden: boolean; activeId: string };
    opened: { open: boolean; hidden: boolean; activeId: string };
    closed: { open: boolean; hidden: boolean; activeId: string };
  } | null = null;
  if (ESCAPE_SMOKE === "on") {
    const readOptionsState = async (phase: string) => {
      const result = (await send(
        ws,
        "Runtime.evaluate",
        {
          expression: `(() => {
            const menu = document.querySelector('#options-menu');
            const shell = document.querySelector('.app-shell');
            return {
              open: shell?.classList.contains('options-open') ?? false,
              hidden: menu instanceof HTMLElement ? menu.hidden : true,
              activeId: document.activeElement?.id ?? '',
            };
          })()`,
          returnByValue: true,
        },
        phase,
      )) as { result?: { value?: { open?: boolean; hidden?: boolean; activeId?: string } } };
      const value = result.result?.value ?? {};
      return {
        open: value.open === true,
        hidden: value.hidden !== false,
        activeId: value.activeId ?? "",
      };
    };
    const pressEscape = async (phase: string): Promise<void> => {
      await send(
        ws,
        "Input.dispatchKeyEvent",
        {
          type: "rawKeyDown",
          key: "Escape",
          code: "Escape",
          windowsVirtualKeyCode: 27,
          nativeVirtualKeyCode: 27,
        },
        phase,
      );
      await send(
        ws,
        "Input.dispatchKeyEvent",
        {
          type: "keyUp",
          key: "Escape",
          code: "Escape",
          windowsVirtualKeyCode: 27,
          nativeVirtualKeyCode: 27,
        },
        phase,
      );
      await sleep(120);
    };
    const before = await readOptionsState("escape-before");
    await pressEscape("escape-open");
    const opened = await readOptionsState("escape-open-state");
    await capture("options-open");
    await pressEscape("escape-close");
    const closed = await readOptionsState("escape-close-state");
    await capture("options-closed");
    if (before.open || !before.hidden || !opened.open || opened.hidden || !closed.hidden) {
      throw new Error(`Escape smoke failed: ${JSON.stringify({ before, opened, closed })}`);
    }
    escapeSmokeResult = { before, opened, closed };
  }

  async function teleport(
    nameSubstring: string,
    dx: number | "normal",
    dz: number,
    pitch: number,
    instanceIndex: number | null,
    aimHeight: number | null,
  ): Promise<string> {
    const expression = `(() => {
      const diag = window.__THREE_GAME_DIAGNOSTICS__;
      if (!diag) return 'MISSING_DIAGNOSTICS';
      const ctrl = diag.getController();
      let target = null;
      diag.getScene().traverse((o) => {
        if (!target && o.name && o.name.includes(${JSON.stringify(nameSubstring)})) target = o;
      });
      if (!target) return 'MISSING';
      const v = new ctrl.position.constructor();
      target.updateWorldMatrix(true, false);
      let resolvedIndex = null;
      let targetWorld = target.matrixWorld.clone();
      if (target.isInstancedMesh) {
        const requestedIndex = ${instanceIndex === null ? "null" : String(instanceIndex)};
        resolvedIndex = Number.isInteger(requestedIndex) ? requestedIndex : 0;
        if (resolvedIndex < 0 || resolvedIndex >= target.count) {
          return 'BAD_INSTANCE ' + resolvedIndex + '/' + target.count;
        }
        const local = target.matrixWorld.clone().identity();
        target.getMatrixAt(resolvedIndex, local);
        targetWorld = target.matrixWorld.clone().multiply(local);
        v.setFromMatrixPosition(targetWorld);
      } else {
        target.getWorldPosition(v);
      }
      const normalCamera = ${JSON.stringify(dx === "normal")};
      const normal = new ctrl.position.constructor(0, 0, 1).transformDirection(targetWorld);
      const cameraX = normalCamera ? v.x + normal.x * ${dz} : v.x + ${dx === "normal" ? 0 : dx};
      const cameraZ = normalCamera ? v.z + normal.z * ${dz} : v.z + ${dz};
      const ddx = v.x - cameraX;
      const ddz = v.z - cameraZ;
      const yaw = Math.atan2(-ddx, -ddz);
      const dist = Math.hypot(ddx, ddz);
      const requestedAimHeight = ${aimHeight === null ? "null" : String(aimHeight)};
      const defaultAimHeight = /portal|doorway/i.test(target.name)
        ? 1.7
        : /bookshelf|weapon-rack|cage|banner|lantern|reliquary|altar|ward/i.test(target.name)
          ? 1.05
          : 0.45;
      const aimY = v.y + (Number.isFinite(requestedAimHeight) ? requestedAimHeight : defaultAimHeight);
      const p = Math.atan2(aimY - 1.62, dist) + ${pitch};
      ctrl.setEnabled(false);
      ctrl.restorePose({ x: cameraX, y: 1.62, z: cameraZ, yaw, pitch: p, distanceTravelled: 0 });
      return 'OK ' + v.x.toFixed(1) + ',' + v.z.toFixed(1)
        + (resolvedIndex === null ? '' : ' instance=' + resolvedIndex);
    })()`;
    const result = (await send(
      ws,
      "Runtime.evaluate",
      { expression, returnByValue: true },
      "teleport",
    )) as {
      result?: { value?: string };
      exceptionDetails?: { text?: string };
    };
    if (result.exceptionDetails) return `EVAL_ERROR ${result.exceptionDetails.text ?? "unknown"}`;
    return result.result?.value ?? "NO_RESULT";
  }

  async function waitForInstanceAnimation(
    nameSubstring: string,
    instanceIndex: number,
    timeoutMs = 12_000,
  ): Promise<{ frameA: number; frameB: number; blend: number }> {
    const deadline = Date.now() + timeoutMs;
    let last = { frameA: 0, frameB: 0, blend: 0 };
    while (Date.now() < deadline) {
      const result = (await send(
        ws,
        "Runtime.evaluate",
        {
          expression: `(() => {
            let target = null;
            window.__THREE_GAME_DIAGNOSTICS__?.getScene?.().traverse((object) => {
              if (!target && object.isInstancedMesh && object.name.includes(${JSON.stringify(nameSubstring)})) {
                target = object;
              }
            });
            if (!target || ${instanceIndex} < 0 || ${instanceIndex} >= target.count) return null;
            const frameA = target.geometry.getAttribute('uncannyFrameA');
            const frameB = target.geometry.getAttribute('uncannyFrameB');
            const blend = target.geometry.getAttribute('uncannyBlend');
            if (!frameA || !frameB || !blend) return null;
            return {
              frameA: frameA.getX(${instanceIndex}),
              frameB: frameB.getX(${instanceIndex}),
              blend: blend.getX(${instanceIndex}),
            };
          })()`,
          returnByValue: true,
        },
        "instance-animation",
      )) as { result?: { value?: { frameA: number; frameB: number; blend: number } | null } };
      const sample = result.result?.value;
      if (sample) {
        last = sample;
        // Wait past the first blended pixels so the proof frame is visibly
        // different from the authored hold pose, even for a 90 ms transition.
        if (sample.frameA !== 0 || sample.frameB > 1 || sample.blend >= 0.35) return sample;
      }
      await sleep(16);
    }
    throw new Error(
      `${nameSubstring} instance ${instanceIndex} did not leave its hold frame: ${JSON.stringify(last)}.`,
    );
  }

  await capture("spawn");
  for (const spec of shotSpecs) {
    await waitForGameReady(ws);
    const [name, rawDx, rawDz, pitch, label, rawInstanceIndex, rawAimHeight, captureMode] =
      spec.split(",");
    if (!name || !label) continue;
    const parsedInstanceIndex =
      rawInstanceIndex === undefined || rawInstanceIndex === ""
        ? null
        : Number.parseInt(rawInstanceIndex, 10);
    const parsedAimHeight =
      rawAimHeight === undefined || rawAimHeight === "" ? null : Number.parseFloat(rawAimHeight);
    if (parsedInstanceIndex !== null && !Number.isInteger(parsedInstanceIndex))
      throw new Error(`${label}: invalid instance index ${JSON.stringify(rawInstanceIndex)}.`);
    if (parsedAimHeight !== null && !Number.isFinite(parsedAimHeight))
      throw new Error(`${label}: invalid aim height ${JSON.stringify(rawAimHeight)}.`);
    const dx = rawDx === "normal" ? "normal" : Number(rawDx ?? 1.6);
    const dz = Number(rawDz ?? (dx === "normal" ? 2.8 : 1.6));
    if (dx !== "normal" && !Number.isFinite(dx))
      throw new Error(`${label}: invalid camera X offset ${JSON.stringify(rawDx)}.`);
    if (!Number.isFinite(dz))
      throw new Error(`${label}: invalid camera Z offset ${JSON.stringify(rawDz)}.`);
    if (captureMode && captureMode !== "animate")
      throw new Error(
        `${label}: capture mode must be "animate"; received ${JSON.stringify(captureMode)}.`,
      );
    const status = await teleport(
      name,
      dx,
      dz,
      Number(pitch ?? 0),
      parsedInstanceIndex,
      parsedAimHeight,
    );
    console.log(`${label}: ${status}`);
    if (!status?.startsWith("OK "))
      throw new Error(`${label}: teleport failed (${status ?? "missing result"}).`);
    const animationSample =
      captureMode === "animate"
        ? await waitForInstanceAnimation(name, parsedInstanceIndex ?? 0)
        : undefined;
    await sleep(animationSample ? 40 : 900);
    await capture(label);
    const record = captureRecords.at(-1);
    if (record) {
      record.target = name;
      record.status = status;
      record.animationSample = animationSample;
    }
  }

  if (PERF_SECONDS > 0) {
    const started = (await send(
      ws,
      "Runtime.evaluate",
      {
        expression: `(() => {
        const diag = window.__THREE_GAME_DIAGNOSTICS__;
        const prompt = document.querySelector('#interaction-prompt');
        if (!diag || !(prompt instanceof HTMLElement)) return 'MISSING_DIAGNOSTICS';
        prompt.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerId: 77,
          pointerType: 'touch',
        }));
        const ctrl = diag.getController();
        ctrl.setEnabled(true);
        ctrl.setVirtualAction('forward', true);
        ctrl.setVirtualAction('sprint', true);
        ctrl.setVirtualAction('turnRight', true);
        return 'STARTED';
      })()`,
        returnByValue: true,
      },
      "performance-start",
    )) as { result?: { value?: string } };
    if (started.result?.value !== "STARTED")
      throw new Error(`Performance audit could not start (${started.result?.value ?? "unknown"}).`);

    // The runtime resets its ring when simulation starts and ignores its first
    // 1.8 seconds. Keep that warmup outside the requested measurement window.
    await sleep(2_200 + PERF_SECONDS * 1_000);
    const result = (await send(
      ws,
      "Runtime.evaluate",
      {
        expression: `(() => {
        const diag = window.__THREE_GAME_DIAGNOSTICS__;
        const ctrl = diag.getController();
        ctrl.setVirtualAction('forward', false);
        ctrl.setVirtualAction('sprint', false);
        ctrl.setVirtualAction('turnRight', false);
        const scene = document.querySelector('#scene');
        return {
          renderer: diag.getRenderer(),
          runtime: diag.getState(),
          dataset: scene instanceof HTMLElement ? { ...scene.dataset } : {},
          url: location.href,
        };
      })()`,
        returnByValue: true,
      },
      "performance-results",
    )) as {
      result?: {
        value?: {
          renderer?: { frameGaps?: { samples?: number; p95?: number; p99?: number; max?: number } };
          runtime?: unknown;
          dataset?: Record<string, string>;
          url?: string;
        };
      };
    };
    const audit = result.result?.value;
    const gaps = audit?.renderer?.frameGaps;
    const minimumSamples = Math.max(60, Math.floor(PERF_SECONDS * 20));
    if (!gaps || (gaps.samples ?? 0) < minimumSamples)
      throw new Error(
        `Performance audit recorded too few samples: ${JSON.stringify(gaps ?? null)}; expected at least ${minimumSamples}.`,
      );
    for (const [label, value] of Object.entries({ p95: gaps.p95, p99: gaps.p99, max: gaps.max })) {
      if (!Number.isFinite(value)) throw new Error(`Performance audit ${label} is not finite.`);
    }
    const auditPath = `${outDir}/perf-${biomeParam || "auto"}-${qaState || "play"}-crt-${CRT || "live"}.json`;
    await Bun.write(
      auditPath,
      `${JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          seed,
          biome: biomeParam || null,
          mood: moodParam || null,
          qaState: qaState || null,
          crt: CRT || null,
          requestedSeconds: PERF_SECONDS,
          ...audit,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`saved ${auditPath} ${JSON.stringify(gaps)}`);
  }
  let diagnosticsValue: unknown;
  if (g0) {
    g0Diagnostics = await collectG0Diagnostics(ws);
    const finalTrace = validateG0DiagnosticsTrace(g0Diagnostics);
    g0Trace = finalTrace.trace;
    if (
      g0.workload === "backrooms" &&
      g0Diagnostics.floorCount !== null &&
      g0Diagnostics.floorCount !== 4
    )
      throw new Error(`G0 Backrooms reported ${g0Diagnostics.floorCount} floors instead of 4.`);
    diagnosticsValue = g0Diagnostics;
  } else {
    const diagnosticsResult = (await send(
      ws,
      "Runtime.evaluate",
      {
        expression: `(() => {
        const diag = window.__THREE_GAME_DIAGNOSTICS__;
        const canvas = document.querySelector('#scene');
        return {
          renderer: diag?.getRenderer?.() ?? null,
          audio: diag?.getAudio?.() ?? null,
          runtime: diag?.getState?.() ?? null,
          canvas: canvas instanceof HTMLCanvasElement
            ? { width: canvas.width, height: canvas.height, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight }
            : null,
          dataset: canvas instanceof HTMLElement ? { ...canvas.dataset } : {},
          url: location.href,
        };
      })()`,
        returnByValue: true,
      },
      "diagnostics",
    )) as { result?: { value?: unknown } };
    diagnosticsValue = diagnosticsResult.result?.value ?? null;
  }
  const manifestPath = `${outDir}/capture-manifest.json`;
  await Bun.write(
    manifestPath,
    `${JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        seed,
        biome: biomeParam || null,
        mood: moodParam || null,
        crt: CRT || null,
        photoSimulation: PHOTO_SIMULATION,
        escapeSmoke: escapeSmokeResult,
        shots: captureRecords,
        browserErrors,
        networkErrors,
        diagnostics: diagnosticsValue,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`saved ${manifestPath}`);
  ws.close();
  if (browserErrors.length > 0 || networkErrors.length > 0)
    throw new Error(
      `Live photo browser gate failed: ${JSON.stringify({ browserErrors, networkErrors })}`,
    );
} catch (error) {
  if (g0) {
    g0RunError = error;
    g0TimedOut = error instanceof G0TraceTimeoutError || error instanceof CdpCommandTimeoutError;
    g0FailurePhase =
      error instanceof CdpCommandTimeoutError
        ? error.phase
        : error instanceof G0TraceTimeoutError
          ? "trace"
          : null;
  }
  throw error;
} finally {
  if (chrome) {
    if (g0) {
      try {
        chrome.kill();
        g0ChromeExitCode = await chrome.exited;
      } catch (error) {
        g0CleanupError = errorMessage(error);
      }
    } else {
      chrome.kill();
      await chrome.exited;
    }
  }
  if (g0) {
    const status: G0Status = g0CleanupError
      ? "cleanup_failed"
      : g0TimedOut
        ? "timed_out"
        : g0RunError || !g0Trace || !g0Diagnostics
          ? "failed"
          : "passed";
    try {
      await writeG0JsonAtomically("result.json", {
        schema: "dungeon-load-g0-browser-sample/v1",
        sampleId: g0.sampleId,
        workload: g0.workload,
        startedAt: g0StartedAt,
        finishedAt: new Date().toISOString(),
        status,
        pids: { bun: process.pid, chrome: g0ChromePid },
        exits: { bun: null, chrome: g0ChromeExitCode },
        cleanup: {
          chromeExited: chrome !== null && g0CleanupError === null,
          error: g0CleanupError,
        },
        trace: g0Trace,
        mapLoad: g0Diagnostics?.mapLoad ?? null,
        renderer: g0Diagnostics?.renderer ?? null,
        browser: {
          version: g0BrowserVersion,
          userAgent: g0Diagnostics?.userAgent ?? null,
          location: g0Diagnostics?.location ?? null,
          devicePixelRatio: g0Diagnostics?.devicePixelRatio ?? null,
          canvas: g0Diagnostics?.canvas ?? null,
          flags: chromeArgs,
        },
        gpu: g0Diagnostics?.webgl ?? null,
        dataset: g0Diagnostics?.dataset ?? null,
        floorCount: g0Diagnostics?.floorCount ?? null,
        browserErrors,
        networkErrors,
        error: g0RunError === null ? null : errorMessage(g0RunError),
        failurePhase: g0FailurePhase,
        metrics: status === "passed" && g0Trace ? g0TraceMetrics(g0Trace) : null,
      });
    } catch (error) {
      if (g0RunError === null)
        g0FinalizationError = error instanceof Error ? error : new Error(errorMessage(error));
    }
    if (g0CleanupError && g0RunError === null)
      g0FinalizationError ??= new Error(`G0 Chrome cleanup failed: ${g0CleanupError}`);
  }
}

if (g0FinalizationError !== null) throw g0FinalizationError;
