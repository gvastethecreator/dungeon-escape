/**
 * Deterministic model-lab capture through Chrome DevTools Protocol.
 * Requires a Dungeon Escape dev server. Override the default origin with
 * MODEL_QA_BASE_URL when another QA process already owns port 24211.
 *
 * Usage:
 *   bun run scripts/cdp-model-lab.ts <outDir> [model:view:label]...
 *   bun run scripts/cdp-model-lab.ts .scratch/model-proof treasure-chest:front:chest-front
 *   bun run scripts/cdp-model-lab.ts .scratch/model-proof --all
 *   bun run scripts/cdp-model-lab.ts .scratch/model-proof-six --all-six
 *   bun run scripts/cdp-model-lab.ts .scratch/door-proof --all-doors
 */

interface CdpTarget {
  type: string;
  webSocketDebuggerUrl: string;
}

interface ModelQaSnapshot {
  ready: boolean;
  status: string;
  id: string;
  view: string;
  mood: string;
  errors: string[];
  metrics: Record<string, number | null>;
  canvas: { width: number; height: number };
}

interface ReferenceManifest {
  objects: Array<{ id: string; status: string; reference: string; sha256: string }>;
}

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = Number.parseInt(process.env.MODEL_QA_CDP_PORT ?? "9226", 10);
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65_535)
  throw new Error(`MODEL_QA_CDP_PORT must be a valid user port; received ${String(PORT)}.`);
const baseUrl = new URL(process.env.MODEL_QA_BASE_URL ?? "http://127.0.0.1:24211");
if (baseUrl.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(baseUrl.hostname)) {
  throw new Error(`MODEL_QA_BASE_URL must be a local HTTP origin; received ${baseUrl.href}.`);
}
const BASE = new URL("/model-lab.html", baseUrl).href;
const MODEL_WAIT_TIMEOUT_MS = 30_000;
// A true cold load transfers every 1024 px PBR role map. Parallel QA workers
// can hold Chrome's loadingFinished events well after Three.js has decoded the
// images, so keep the network audit strict and give it enough time to settle.
const NETWORK_IDLE_TIMEOUT_MS = 45_000;
const outDir = process.argv[2] ?? ".scratch/model-proof";
const requestedShots = process.argv.slice(3);
const mood = (process.env.MODEL_QA_MOOD ?? "").trim().toLowerCase();
const DOOR_MOODS = [
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
] as const;

async function resolveShots(): Promise<string[]> {
  const allFlag = requestedShots.find(
    (shot) => shot === "--all" || shot === "--all-six" || shot === "--all-doors",
  );
  if (!allFlag)
    return requestedShots.length > 0 ? requestedShots : ["treasure-chest:front:chest-front"];
  if (requestedShots.length !== 1)
    throw new Error(`${allFlag} cannot be mixed with explicit model shots.`);
  if (allFlag === "--all-doors") {
    return DOOR_MOODS.flatMap((doorMood) =>
      ["front", "right", "rear-left"].map(
        (view) => `door-${doorMood}:${view}:door-${doorMood}-${view}:${doorMood}`,
      ),
    );
  }
  const manifest = (await Bun.file(
    "assets-source/imagegen/model-references-v2/manifest.json",
  ).json()) as ReferenceManifest;
  const objects = manifest.objects.filter(({ status }) => status === "accepted-reference");
  if (objects.length !== 55)
    throw new Error(`Expected 55 accepted model references; received ${objects.length}.`);
  const views =
    allFlag === "--all-six"
      ? ["front", "right", "back", "left", "rear-left", "top"]
      : ["front", "right", "rear-left"];
  return objects.flatMap(({ id }) => views.map((view) => `${id}:${view}:${id}-${view}`));
}

const shots = await resolveShots();
const captureManifest: Array<
  ModelQaSnapshot & { label: string; image: string; totalShots: number }
> = [];

let messageId = 0;
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
>();

function send(
  ws: WebSocket,
  method: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  const id = ++messageId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDebugger(): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = (await response.json()) as CdpTarget[];
      const page = targets.find((target) => target.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome can take a moment to bind the debug port.
    }
    await sleep(200);
  }
  throw new Error("Model-lab Chrome debugger did not come up.");
}

async function evaluate<T>(ws: WebSocket, expression: string): Promise<T> {
  const response = (await send(ws, "Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })) as { exceptionDetails?: unknown; result?: { value?: T } };
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result?.value as T;
}

async function waitForModel(ws: WebSocket): Promise<ModelQaSnapshot> {
  const deadline = Date.now() + MODEL_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const snapshot = await evaluate<ModelQaSnapshot | null>(
      ws,
      `(() => {
        const qa = window.__MODEL_QA__;
        const canvas = document.querySelector('#model-lab-canvas');
        if (!qa || !(canvas instanceof HTMLCanvasElement) || !qa.settled) return null;
        return {
          ready: qa.ready,
          status: qa.status,
          id: qa.id,
          view: qa.view,
          mood: qa.mood,
          errors: [...qa.errors],
          metrics: { ...qa.metrics },
          canvas: { width: canvas.width, height: canvas.height },
        };
      })()`,
    );
    if (snapshot) return snapshot;
    await sleep(100);
  }
  throw new Error("Model QA did not reach a terminal state.");
}

/**
 * CDP can omit a late loadingFinished event after Vite serves a cold module
 * graph, even though the browser has a complete ResourceTiming entry. Reconcile
 * only those proven responseEnd entries; real pending and failed requests stay
 * in the strict network gate.
 */
async function reconcileCompletedResourceTimings(
  ws: WebSocket,
  pendingRequests: Set<string>,
  requestUrls: Map<string, string>,
): Promise<void> {
  if (pendingRequests.size === 0) return;
  const urls = [...new Set([...pendingRequests].map((id) => requestUrls.get(id)).filter(Boolean))];
  if (urls.length === 0) return;
  const completed = await evaluate<string[]>(
    ws,
    `(() => {
      const pending = new Set(${JSON.stringify(urls)});
      return performance.getEntriesByType("resource")
        .filter((entry) => entry.responseEnd > 0 && pending.has(entry.name))
        .map((entry) => entry.name);
    })()`,
  );
  const completedUrls = new Set(completed);
  for (const requestId of pendingRequests) {
    const url = requestUrls.get(requestId);
    if (!url || !completedUrls.has(url)) continue;
    pendingRequests.delete(requestId);
    requestUrls.delete(requestId);
  }
}

const profileDir =
  process.env.MODEL_QA_PROFILE ??
  `${process.cwd()}\\.scratch\\cdp-model-lab-profile-${process.pid}-${Date.now()}`;
const chrome = Bun.spawn(
  [
    CHROME,
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profileDir}`,
    "--headless=new",
    "--disable-gpu-sandbox",
    "--no-first-run",
    "--window-size=1280,960",
    "--hide-scrollbars",
    "about:blank",
  ],
  { stdout: "ignore", stderr: "ignore" },
);

try {
  const wsUrl = await waitForDebugger();
  const ws = new WebSocket(wsUrl);
  const consoleErrors: string[] = [];
  const networkErrors: string[] = [];
  const pendingRequests = new Set<string>();
  const requestUrls = new Map<string, string>();
  ws.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number;
      result?: unknown;
      error?: unknown;
      method?: string;
      params?: {
        entry?: { level?: string; text?: string };
        exceptionDetails?: unknown;
        requestId?: string;
        request?: { url?: string };
        response?: { url?: string; status?: number };
        errorText?: string;
        canceled?: boolean;
      };
    };
    if (message.id && pending.has(message.id)) {
      const entry = pending.get(message.id)!;
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
      else entry.resolve(message.result);
      return;
    }
    if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error")
      consoleErrors.push(message.params.entry.text ?? "Unknown browser log error");
    if (message.method === "Runtime.exceptionThrown")
      consoleErrors.push(JSON.stringify(message.params?.exceptionDetails ?? "Runtime exception"));
    const requestId = message.params?.requestId;
    if (message.method === "Network.requestWillBeSent" && requestId) {
      pendingRequests.add(requestId);
      requestUrls.set(requestId, message.params?.request?.url ?? "unknown URL");
    }
    if (message.method === "Network.responseReceived") {
      const response = message.params?.response;
      if (response?.status && response.status >= 400)
        networkErrors.push(`${response.status} ${response.url ?? "unknown URL"}`);
    }
    if (message.method === "Network.loadingFinished" && requestId) {
      pendingRequests.delete(requestId);
      requestUrls.delete(requestId);
    }
    if (message.method === "Network.loadingFailed" && requestId) {
      const trackedUrl = requestUrls.get(requestId);
      pendingRequests.delete(requestId);
      requestUrls.delete(requestId);
      if (trackedUrl && !message.params?.canceled)
        networkErrors.push(
          `${trackedUrl}: ${message.params?.errorText ?? "network loading failed"}`,
        );
    }
  };
  await new Promise<void>((resolve) => {
    ws.onopen = () => resolve();
  });

  await send(ws, "Page.enable");
  await send(ws, "Runtime.enable");
  await send(ws, "Log.enable");
  await send(ws, "Network.enable");
  await send(ws, "Network.setCacheDisabled", { cacheDisabled: true });
  await send(ws, "Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 960,
    deviceScaleFactor: 1,
    mobile: false,
  });

  for (const [shotIndex, shotSpec] of shots.entries()) {
    const [model, view = "front", label = `${model}-${view}`, shotMood = mood] =
      shotSpec.split(":");
    if (!model || !label) throw new Error(`Invalid shot spec: ${shotSpec}`);
    // Prove one true cold load, then keep the batch practical while retaining
    // per-shot request/error tracking for model-specific assets.
    await send(ws, "Network.setCacheDisabled", { cacheDisabled: shotIndex === 0 });
    consoleErrors.length = 0;
    networkErrors.length = 0;
    pendingRequests.clear();
    requestUrls.clear();
    await send(ws, "Page.navigate", {
      url: `${BASE}?model=${encodeURIComponent(model)}&view=${encodeURIComponent(view)}${shotMood ? `&mood=${encodeURIComponent(shotMood)}` : ""}`,
    });
    const snapshot = await waitForModel(ws);
    const idleDeadline = Date.now() + NETWORK_IDLE_TIMEOUT_MS;
    let quietChecks = 0;
    while (Date.now() < idleDeadline && quietChecks < 3) {
      if (pendingRequests.size === 0) quietChecks += 1;
      else quietChecks = 0;
      await sleep(100);
    }
    await reconcileCompletedResourceTimings(ws, pendingRequests, requestUrls);
    if (pendingRequests.size > 0)
      networkErrors.push(`Network did not settle: ${[...requestUrls.values()].join(", ")}`);
    if (!snapshot.ready || snapshot.status !== "ready" || snapshot.errors.length > 0)
      throw new Error(
        `${label}: ${JSON.stringify(snapshot)} browserErrors=${JSON.stringify(consoleErrors)} networkErrors=${JSON.stringify(networkErrors)}`,
      );
    if (snapshot.canvas.width < 2 || snapshot.canvas.height < 2)
      throw new Error(`${label}: zero-size canvas ${JSON.stringify(snapshot.canvas)}`);
    if (consoleErrors.length > 0) throw new Error(`${label}: ${consoleErrors.join(" | ")}`);
    if (networkErrors.length > 0) throw new Error(`${label}: ${networkErrors.join(" | ")}`);
    const capture = (await send(ws, "Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    })) as { data: string };
    const path = `${outDir}/${label}.png`;
    await Bun.write(path, Buffer.from(capture.data, "base64"));
    captureManifest.push({
      ...snapshot,
      label,
      image: `${label}.png`,
      totalShots: shots.length,
    });
    console.log(`${path} ${JSON.stringify(snapshot.metrics)}`);
  }
  await Bun.write(
    `${outDir}/capture-manifest.json`,
    `${JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        mood: requestedShots.includes("--all-doors") ? "matched-door-moods" : mood || "neutral",
        shots: captureManifest,
      },
      null,
      2,
    )}\n`,
  );
  ws.close();
} finally {
  chrome.kill();
}
