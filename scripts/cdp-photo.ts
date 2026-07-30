/**
 * CDP photo tool: headless Chrome screenshots with in-scene teleports.
 * Requires the Dungeon Escape dev server running on :24211.
 *
 * Usage:
 *   bun run scripts/cdp-photo.ts <seed> <outDir> [nameSubstring,dx,dz,pitch,label,instanceIndex,aimHeight]...
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
 * Set env PERF_SECONDS=12 to record live p95/p99/max frame gaps after the shots.
 */

interface CdpTarget {
  webSocketDebuggerUrl: string;
}

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9300 + (process.pid % 500);
const BASE = "http://127.0.0.1:24211";
const PROFILE = `${process.env.TEMP ?? "."}\\dungeon-escape-cdp-${process.pid}`;
const PERF_SECONDS = Number.parseFloat(process.env.PERF_SECONDS ?? "0");
if (!Number.isFinite(PERF_SECONDS) || PERF_SECONDS < 0 || PERF_SECONDS > 120)
  throw new Error(`PERF_SECONDS must be between 0 and 120; received ${String(PERF_SECONDS)}.`);
const CRT = (process.env.CRT ?? "").trim().toLowerCase();
if (CRT && CRT !== "on" && CRT !== "off")
  throw new Error(`CRT must be "on" or "off"; received ${JSON.stringify(CRT)}.`);
const PHOTO_SIMULATION = (process.env.PHOTO_SIMULATION ?? "on").trim().toLowerCase();
if (PHOTO_SIMULATION !== "on" && PHOTO_SIMULATION !== "off")
  throw new Error(
    `PHOTO_SIMULATION must be "on" or "off"; received ${JSON.stringify(PHOTO_SIMULATION)}.`,
  );

const seed = process.argv[2] ?? "ash-demo";
const outDir = process.argv[3] ?? ".proof-hud";
const shotSpecs = process.argv.slice(4);

let messageId = 0;
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
>();
const browserErrors: string[] = [];
const networkErrors: string[] = [];
const captureRecords: Array<{ label: string; image: string; target?: string; status?: string }> =
  [];

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

async function readReadyState(ws: WebSocket): Promise<{
  diagnostics?: boolean;
  bootHidden?: boolean;
  rendererReady?: string;
}> {
  const state = (await send(ws, "Runtime.evaluate", {
    expression: `(() => ({
      diagnostics: Boolean(window.__THREE_GAME_DIAGNOSTICS__),
      bootHidden: Boolean(document.querySelector('#boot-screen')?.hidden),
      rendererReady: document.querySelector('.app-shell')?.dataset.rendererReady ?? '',
    }))()`,
    returnByValue: true,
  })) as {
    result?: { value?: { diagnostics?: boolean; bootHidden?: boolean; rendererReady?: string } };
  };
  return state.result?.value ?? {};
}

async function waitForAppReady(ws: WebSocket, timeoutMs = 25_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastValue: unknown = null;
  while (Date.now() < deadline) {
    const value = await readReadyState(ws);
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
    const value = await readReadyState(ws);
    lastValue = value;
    if (value.diagnostics && value.rendererReady === "true") return;
    await sleep(500);
  }
  throw new Error(
    `Dungeon page did not reach renderer-ready state: ${JSON.stringify({ lastValue, browserErrors, networkErrors })}`,
  );
}

const chrome = Bun.spawn(
  [
    CHROME,
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    "--headless=new",
    "--disable-gpu-sandbox",
    "--no-first-run",
    "--window-size=1600,900",
    "--hide-scrollbars",
    "about:blank",
  ],
  { stdout: "ignore", stderr: "ignore" },
);

try {
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
    width: 1600,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const moodParam = (process.env.MOOD ?? process.env.THEME ?? "").trim().toLowerCase();
  const biomeParam = (process.env.BIOME ?? moodParam).trim().toLowerCase();
  const moodQuery = moodParam ? `&mood=${encodeURIComponent(moodParam)}` : "";
  const qaState = (process.env.QA_STATE ?? "").trim().toLowerCase();
  // Every photo run is a QA run. The flag keeps the requested campaign seed
  // deterministic while normal New Game continues to generate fresh seeds.
  const qaQuery = `&perfAudit=1${qaState ? `&qaState=${encodeURIComponent(qaState)}` : ""}`;
  await send(ws, "Page.navigate", {
    // skipRunIntro keeps photo capture on the play scene without waiting for map theater.
    url: `${BASE}/?mode=play&seed=${encodeURIComponent(seed)}&skipRunIntro=1${moodQuery}${qaQuery}`,
  });
  await sleep(1000);
  await waitForAppReady(ws);

  const openedPicker = qaState
    ? null
    : ((await send(ws, "Runtime.evaluate", {
        expression: `(() => {
      const button = document.querySelector("#welcome-new");
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      button.click();
      return true;
    })()`,
        returnByValue: true,
      })) as { result?: { value?: boolean } });
  if (openedPicker?.result?.value) {
    await sleep(250);
    const started = (await send(ws, "Runtime.evaluate", {
      expression: `(() => {
        const preferred = ${JSON.stringify(biomeParam)};
        const option = preferred
          ? document.querySelector('.biome-picker-option[data-biome-id="' + preferred + '"]')
          : document.querySelector(".biome-picker-option");
        if (!(option instanceof HTMLButtonElement) || option.disabled) return false;
        option.click();
        return true;
      })()`,
      returnByValue: true,
    })) as { result?: { value?: boolean } };
    if (!started.result?.value) throw new Error("Biome picker did not start a new game.");
    await sleep(2500);
  }

  await waitForGameReady(ws);

  if (qaState) {
    await send(ws, "Runtime.evaluate", {
      expression: `(() => {
        const boot = document.querySelector('#boot-screen');
        document.body.classList.remove('is-booting');
        if (boot instanceof HTMLElement) boot.hidden = true;
      })()`,
    });
  }

  if (CRT) {
    const crtStatus = (await send(ws, "Runtime.evaluate", {
      expression: `(() => {
        const toggle = document.querySelector('#crt-toggle');
        if (!(toggle instanceof HTMLButtonElement) || toggle.disabled) return 'MISSING';
        const desired = ${JSON.stringify(CRT)} === 'on';
        const current = toggle.getAttribute('aria-pressed') === 'true';
        if (current !== desired) toggle.click();
        return toggle.getAttribute('aria-pressed') === String(desired) ? 'OK' : 'MISMATCH';
      })()`,
      returnByValue: true,
    })) as { result?: { value?: string } };
    if (crtStatus.result?.value !== "OK")
      throw new Error(`CRT state could not be set (${crtStatus.result?.value ?? "unknown"}).`);
    await sleep(300);
  }

  if (PHOTO_SIMULATION === "on") {
    const simulationStatus = (await send(ws, "Runtime.evaluate", {
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
    })) as { result?: { value?: string } };
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

  async function teleport(
    nameSubstring: string,
    dx: number,
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
      if (target.isInstancedMesh) {
        const requestedIndex = ${instanceIndex === null ? "null" : String(instanceIndex)};
        resolvedIndex = Number.isInteger(requestedIndex) ? requestedIndex : 0;
        if (resolvedIndex < 0 || resolvedIndex >= target.count) {
          return 'BAD_INSTANCE ' + resolvedIndex + '/' + target.count;
        }
        const local = target.matrixWorld.clone().identity();
        target.getMatrixAt(resolvedIndex, local);
        const world = target.matrixWorld.clone().multiply(local);
        v.setFromMatrixPosition(world);
      } else {
        target.getWorldPosition(v);
      }
      const cameraX = v.x + ${dx};
      const cameraZ = v.z + ${dz};
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
    const result = (await send(ws, "Runtime.evaluate", { expression, returnByValue: true })) as {
      result?: { value?: string };
      exceptionDetails?: { text?: string };
    };
    if (result.exceptionDetails) return `EVAL_ERROR ${result.exceptionDetails.text ?? "unknown"}`;
    return result.result?.value ?? "NO_RESULT";
  }

  await capture("spawn");
  for (const spec of shotSpecs) {
    await waitForGameReady(ws);
    const [name, dx, dz, pitch, label, rawInstanceIndex, rawAimHeight] = spec.split(",");
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
    const status = await teleport(
      name,
      Number(dx ?? 1.6),
      Number(dz ?? 1.6),
      Number(pitch ?? 0),
      parsedInstanceIndex,
      parsedAimHeight,
    );
    console.log(`${label}: ${status}`);
    if (!status?.startsWith("OK "))
      throw new Error(`${label}: teleport failed (${status ?? "missing result"}).`);
    await sleep(900);
    await capture(label);
    const record = captureRecords.at(-1);
    if (record) {
      record.target = name;
      record.status = status;
    }
  }

  if (PERF_SECONDS > 0) {
    const started = (await send(ws, "Runtime.evaluate", {
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
    })) as { result?: { value?: string } };
    if (started.result?.value !== "STARTED")
      throw new Error(`Performance audit could not start (${started.result?.value ?? "unknown"}).`);

    // The runtime resets its ring when simulation starts and ignores its first
    // 1.8 seconds. Keep that warmup outside the requested measurement window.
    await sleep(2_200 + PERF_SECONDS * 1_000);
    const result = (await send(ws, "Runtime.evaluate", {
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
    })) as {
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
  const diagnosticsResult = (await send(ws, "Runtime.evaluate", {
    expression: `(() => {
      const diag = window.__THREE_GAME_DIAGNOSTICS__;
      const canvas = document.querySelector('#scene');
      return {
        renderer: diag?.getRenderer?.() ?? null,
        runtime: diag?.getState?.() ?? null,
        canvas: canvas instanceof HTMLCanvasElement
          ? { width: canvas.width, height: canvas.height, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight }
          : null,
        dataset: canvas instanceof HTMLElement ? { ...canvas.dataset } : {},
        url: location.href,
      };
    })()`,
    returnByValue: true,
  })) as { result?: { value?: unknown } };
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
        shots: captureRecords,
        browserErrors,
        networkErrors,
        diagnostics: diagnosticsResult.result?.value ?? null,
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
} finally {
  chrome.kill();
}
