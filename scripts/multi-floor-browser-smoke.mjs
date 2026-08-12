/**
 * Full browser smoke for multi-floor walkable stairs (Chrome CDP).
 * Requires Vite on http://127.0.0.1:24211 and Google Chrome installed.
 *
 * Usage:
 *   bun run scripts/multi-floor-browser-smoke.mjs
 *   BIOME=obsidian bun run scripts/multi-floor-browser-smoke.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const CHROME =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9300 + (process.pid % 500);
const BASE = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:24211";
const BIOME = (process.env.BIOME ?? "obsidian").trim().toLowerCase();
const SEED = process.env.SEED ?? `MF-SMOKE-${BIOME.toUpperCase()}-A1`;
const CRT = (process.env.SMOKE_CRT ?? "").trim();
const CDP_TIMEOUT_MS = Number(process.env.CDP_COMMAND_TIMEOUT_MS ?? 80_000);
const PERF_THRESHOLDS = Object.freeze({
  minimumSamples: Number(process.env.SMOKE_PERF_MIN_SAMPLES ?? 120),
  p95Ms: Number(process.env.SMOKE_PERF_P95_MS ?? 25),
  p99Ms: Number(process.env.SMOKE_PERF_P99_MS ?? 34),
  maxMs: Number(process.env.SMOKE_PERF_MAX_MS ?? 75),
  longestTaskMs: Number(process.env.SMOKE_PERF_LONG_TASK_MS ?? 75),
});
const PERF_SAMPLE_SECONDS = Number(process.env.SMOKE_PERF_SECONDS ?? 8);
const RUN_LIFECYCLE = process.env.SMOKE_LIFECYCLE === "1";
const outDir = path.resolve(
  process.env.SMOKE_OUTPUT_DIR ?? `.scratch/proof/multi-floor-browser-smoke/${BIOME}`,
);
await mkdir(outDir, { recursive: true });

const PROFILE = `${process.env.TEMP ?? "."}\\dungeon-escape-mf-smoke-${process.pid}`;
const findings = [];
const browserErrors = [];
const networkErrors = [];
const networkResponses = [];
const report = {
  biome: BIOME,
  seed: SEED,
  crt: CRT || null,
  base: BASE,
  startedAt: new Date().toISOString(),
  steps: [],
  pass: false,
};

function record(level, message, extra = {}) {
  findings.push({ level, message, ...extra, at: Date.now() });
  console.log(`[${level === "pass" ? "OK" : level === "fail" ? "FAIL" : "INFO"}] ${message}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let messageId = 0;
const pending = new Map();

function send(ws, method, params = {}) {
  const id = ++messageId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP ${method} timed out after ${CDP_TIMEOUT_MS}ms`));
    }, CDP_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timeout });
  });
}

async function waitForDebugger() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* retry */
    }
    await sleep(250);
  }
  throw new Error("Chrome debugger did not come up.");
}

async function evaluate(ws, expression) {
  const result = await send(ws, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result?.exceptionDetails) {
    const d = result.exceptionDetails;
    const desc =
      d.exception?.description || d.text || d.exception?.value || JSON.stringify(d).slice(0, 500);
    throw new Error(`EVAL: ${desc}`);
  }
  return result?.result?.value;
}

async function capture(ws, label) {
  const shot = await send(ws, "Page.captureScreenshot", { format: "png" });
  const file = path.join(outDir, `${label}.png`);
  await writeFile(file, Buffer.from(shot.data, "base64"));
  record("info", `screenshot ${label}.png`);
  return file;
}

async function waitForAppReady(ws, timeoutMs = 40_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await evaluate(
      ws,
      `(() => ({
        diagnostics: Boolean(window.__THREE_GAME_DIAGNOSTICS__),
        bootHidden: Boolean(document.querySelector('#boot-screen')?.hidden),
        rendererReady: document.querySelector('.app-shell')?.dataset.rendererReady ?? '',
      }))()`,
    );
    if (last?.diagnostics && (last.bootHidden || last.rendererReady === "true")) return last;
    await sleep(400);
  }
  throw new Error(`App not ready: ${JSON.stringify({ last, browserErrors })}`);
}

async function waitForGameReady(ws, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await evaluate(
      ws,
      `(() => {
        const shell = document.querySelector('.app-shell');
        const engine = window.__BLACK_FLAG_DUNGEON_ENGINE__;
        return {
          rendererReady: shell?.dataset.rendererReady ?? '',
          engineReady: engine?.ready ?? null,
          mode: shell?.dataset.mode ?? null,
        };
      })()`,
    );
    if (last?.rendererReady === "true" && last?.engineReady === true) return last;
    await sleep(500);
  }
  throw new Error(`Game not ready: ${JSON.stringify({ last, browserErrors })}`);
}

const INSPECT = `(() => {
  try {
    const diag = window.__THREE_GAME_DIAGNOSTICS__;
    if (!diag) return { ok: false, reason: 'no-diag' };
    const ctrl = diag.getController();
    const pose = ctrl.getState();
    const THREE = window.THREE || null;
    const stairs = [];
    const scene = diag.getScene();
    scene.traverse((o) => {
      if (!o?.name) return;
      const isRoot =
        (o.name.includes('staircase') && !o.name.includes('tread') && !o.name.includes('rail') && !o.name.includes('sigil'))
        || (o.userData && o.userData.stairDirection && o.userData.walkable);
      if (!isRoot) return;
      let x = o.position?.x ?? 0;
      let y = o.position?.y ?? 0;
      let z = o.position?.z ?? 0;
      try {
        o.updateWorldMatrix(true, false);
        if (typeof o.getWorldPosition === 'function') {
          const v = { x: 0, y: 0, z: 0 };
          // Prefer three Vector3 if available via controller position constructor
          const tmp = ctrl.position?.constructor ? new ctrl.position.constructor() : null;
          if (tmp) {
            o.getWorldPosition(tmp);
            x = tmp.x; y = tmp.y; z = tmp.z;
          } else {
            o.getWorldPosition(v);
            x = v.x; y = v.y; z = v.z;
          }
        }
      } catch (_) {}
      stairs.push({
        name: o.name,
        direction: o.userData?.stairDirection ?? null,
        walkable: o.userData?.walkable ?? null,
        interactionRadius: o.userData?.interactionRadius ?? null,
        stepCount: o.userData?.stepCount ?? null,
        x: Number(Number(x).toFixed(3)),
        y: Number(Number(y).toFixed(3)),
        z: Number(Number(z).toFixed(3)),
      });
    });
    const key = new Set();
    const unique = stairs.filter((s) => {
      const k = s.name + '|' + s.x + '|' + s.z;
      if (key.has(k)) return false;
      key.add(k);
      return true;
    });
    const runStats = document.getElementById('run-stats')?.textContent ?? '';
    const prompt = document.getElementById('interaction-prompt');
    const shell = document.querySelector('.app-shell');
    const canvas = document.getElementById('scene');
    const materialProfiles = new Map();
    let visibleRenderables = 0;
    let hiddenRenderables = 0;
    scene.traverse((object) => {
      if (!(object?.isMesh || object?.isLine || object?.isPoints || object?.isSprite)) return;
      if (object.visible && object.layers?.test?.(diag.getCamera().layers)) visibleRenderables += 1;
      else hiddenRenderables += 1;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material) continue;
        const maps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap']
          .filter((key) => Boolean(material[key]))
          .join('+') || 'none';
        const profile = [
          object.isInstancedMesh ? 'instanced' : object.isSkinnedMesh ? 'skinned' : object.type,
          material.type,
          maps,
          material.transparent ? 'transparent' : 'opaque',
          Number(material.alphaTest || 0) > 0 ? 'alpha-test' : 'no-alpha-test',
          material.vertexColors ? 'vertex-colors' : 'flat-colors',
          'side=' + String(material.side),
        ].join('|');
        materialProfiles.set(profile, (materialProfiles.get(profile) || 0) + 1);
      }
    });
    let gpu = null;
    try {
      const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      gpu = gl ? {
        vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        version: gl.getParameter(gl.VERSION),
      } : null;
    } catch (_) {}
    let dungeonLoadTrace = null;
    try {
      dungeonLoadTrace = JSON.parse(canvas?.dataset.dungeonLoadTrace ?? 'null');
    } catch (_) {}
    const m = /floor\\s+(\\d+)\\s*\\/\\s*(\\d+)/i.exec(runStats);
    return {
      ok: true,
      player: {
        x: pose.position.x,
        y: pose.position.y,
        z: pose.position.z,
        cell: pose.cell,
        grounded: pose.grounded,
      },
      runStats,
      floor: m ? Number(m[1]) : null,
      floorCount: m ? Number(m[2]) : null,
      promptHidden: prompt?.hidden ?? null,
      promptText: (prompt?.innerText || '').trim(),
      rendererReady: shell?.dataset.rendererReady ?? null,
      mapLoad: canvas ? {
        totalMs: Number(canvas.dataset.mapLoadMs || 0),
        worldMs: Number(canvas.dataset.mapLoadWorldMs || 0),
        atmosphereMs: Number(canvas.dataset.mapLoadAtmosphereMs || 0),
      } : null,
      dungeonLoadTrace,
      renderer: typeof diag.getRenderer === 'function' ? diag.getRenderer() : null,
      gpu,
      sceneProfile: {
        visibleRenderables,
        hiddenRenderables,
        materialProfiles: [...materialProfiles.entries()]
          .map(([profile, count]) => ({ profile, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 30),
      },
      stairs: unique,
    };
  } catch (err) {
    return { ok: false, reason: String(err && err.message ? err.message : err) };
  }
})()`;

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
    const msg = JSON.parse(String(event.data));
    if (msg.id && pending.has(msg.id)) {
      const entry = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(entry.timeout);
      if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
      else entry.resolve(msg.result);
      return;
    }
    if (msg.method === "Log.entryAdded" && msg.params?.entry?.level === "error") {
      browserErrors.push(msg.params.entry.text ?? "log error");
    }
    if (msg.method === "Runtime.exceptionThrown") {
      browserErrors.push(JSON.stringify(msg.params?.exceptionDetails ?? "exception"));
    }
    if (msg.method === "Network.responseReceived") {
      const response = msg.params?.response;
      if (response?.url) networkResponses.push(response.url);
      if (response?.status >= 400) networkErrors.push(`${response.status} ${response.url}`);
    }
  };
  await new Promise((resolve) => {
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

  // Seed a full-unlock profile before app boot so New Game can pick any biome.
  await send(ws, "Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      try {
        localStorage.setItem('blackflag.dungeon.player.v1', JSON.stringify({
          version: 1,
          name: 'unlock',
          avatarIndex: 0,
          hasCompletedRun: true,
          highestUnlockedRank: 10,
          clears: { ancient: 1 },
          updatedAt: Date.now(),
        }));
      } catch (_) {}
    })()`,
  });

  const crtQuery = CRT === "0" || CRT === "1" ? `&crt=${CRT}` : "";
  const url = `${BASE}/?mode=play&seed=${encodeURIComponent(SEED)}&mood=${encodeURIComponent(BIOME)}&skipRunIntro=1&perfAudit=1${crtQuery}&_smoke=${Date.now()}`;
  console.log(`[smoke] navigate ${url}`);
  await send(ws, "Page.navigate", { url });
  await sleep(1500);
  await waitForAppReady(ws);

  // Complete first-run profile if still shown, then New Game → biome.
  const bootPath = await evaluate(
    ws,
    `(() => {
      const steps = [];
      const profile = document.getElementById('welcome-profile');
      const form = document.getElementById('welcome-profile-form');
      const name = document.getElementById('welcome-profile-name');
      if (profile && !profile.hidden && form instanceof HTMLFormElement) {
        if (name instanceof HTMLInputElement) name.value = 'unlock';
        form.requestSubmit?.() || form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        steps.push('profile-submit');
      }
      const welcome = document.getElementById('welcome-screen');
      if (welcome && !welcome.hidden) {
        const button = document.querySelector('#welcome-new');
        if (button instanceof HTMLButtonElement && !button.disabled) {
          button.click();
          steps.push('welcome-new');
        }
      }
      return steps.join('+') || 'already-play';
    })()`,
  );
  record("info", `boot path: ${bootPath}`);
  await sleep(600);

  // If biome picker is open, pick the requested biome (retry a few times while grid fills).
  let clickedBiome = false;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    clickedBiome = Boolean(
      await evaluate(
        ws,
        `(() => {
          const preferred = ${JSON.stringify(BIOME)};
          const picker = document.getElementById('welcome-biome-picker');
          if (picker && picker.hidden === false) {
            const option = document.querySelector('.biome-picker-option[data-biome-id="' + preferred + '"]')
              || document.querySelector('.biome-picker-option:not([disabled])');
            if (option instanceof HTMLButtonElement && !option.disabled) {
              option.click();
              return true;
            }
            return false;
          }
          // Already in play
          const shell = document.querySelector('.app-shell');
          return shell?.dataset.rendererReady === 'true';
        })()`,
      ),
    );
    if (clickedBiome) break;
    await sleep(400);
  }
  if (!clickedBiome) {
    // Last resort: submit profile again + new game
    await evaluate(
      ws,
      `(() => {
        const name = document.getElementById('welcome-profile-name');
        const form = document.getElementById('welcome-profile-form');
        if (name instanceof HTMLInputElement) name.value = 'unlock';
        if (form instanceof HTMLFormElement) form.requestSubmit?.();
        document.querySelector('#welcome-new')?.click();
      })()`,
    );
    await sleep(800);
    clickedBiome = Boolean(
      await evaluate(
        ws,
        `(() => {
          const preferred = ${JSON.stringify(BIOME)};
          const option = document.querySelector('.biome-picker-option[data-biome-id="' + preferred + '"]');
          if (option instanceof HTMLButtonElement) { option.click(); return true; }
          return false;
        })()`,
      ),
    );
  }
  if (!clickedBiome) {
    // Direct play URL may still work if welcome is only overlay - check engine
    const readyish = await evaluate(
      ws,
      `(() => window.__BLACK_FLAG_DUNGEON_ENGINE__?.ready === true)()`,
    );
    if (!readyish) throw new Error("Biome picker did not start a game");
  }
  await sleep(2500);

  await waitForGameReady(ws);

  const editorRuntimeLoads = [...new Set(networkResponses)].filter((url) =>
    /(?:\/DungeonEditorView\.ts|EditorLightingProfiles)/i.test(url),
  );
  report.editorBoundary = { editorRuntimeLoads };
  if (editorRuntimeLoads.length === 0) {
    record("pass", "Play loaded no editor renderer chunks");
  } else {
    record("fail", `Play loaded editor chunks: ${editorRuntimeLoads.join(", ")}`);
  }
  record("pass", "Play renderer ready");

  // Enable simulation (touch-style enable path used by cdp-photo)
  await evaluate(
    ws,
    `(() => {
      const diag = window.__THREE_GAME_DIAGNOSTICS__;
      const prompt = document.querySelector('#interaction-prompt');
      if (!diag) return 'MISSING';
      if (prompt instanceof HTMLElement) {
        prompt.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true, cancelable: true, pointerId: 77, pointerType: 'touch',
        }));
      }
      diag.getController().setEnabled(true);
      return 'OK';
    })()`,
  );
  await sleep(600);
  await capture(ws, "01-spawn");

  let scene0;
  try {
    scene0 = await evaluate(ws, INSPECT);
  } catch (err) {
    record("fail", `Inspect threw: ${err}`);
    scene0 = { ok: false, reason: String(err) };
  }
  report.steps.push({ name: "spawn", scene0 });
  if (!scene0?.ok) {
    record("fail", `inspect failed at spawn: ${scene0?.reason ?? "unknown"}`);
  } else {
    if ((scene0.stairs?.length ?? 0) === 0) {
      record("fail", "No stair meshes in scene (expected multi-floor stack)");
    } else {
      record("pass", `Found ${scene0.stairs.length} stair root(s)`);
      const clean = scene0.stairs.every((s) => s.interactionRadius == null);
      if (clean) record("pass", "Stairs have no interactionRadius");
      else record("fail", "Stairs still expose interactionRadius");
      const walkable = scene0.stairs.some((s) => s.walkable === true || (s.stepCount ?? 0) >= 15);
      if (walkable) record("pass", "Stair flight is full-height / walkable-marked");
      else record("fail", "Stair flight looks decorative (low stepCount / not walkable)");
    }

    if (/stair/i.test(scene0.promptText || "")) {
      record("fail", `Prompt mentions stairs: ${scene0.promptText}`);
    } else {
      record("pass", "No stair interaction prompt");
    }

    if (scene0.floorCount != null && scene0.floorCount >= 2) {
      record("pass", `Campaign floor count = ${scene0.floorCount}`);
    } else {
      record("fail", `Expected multi-floor campaign, got floorCount=${scene0.floorCount}`);
    }
    record(
      "info",
      `spawn y=${Number(scene0.player?.y ?? 0).toFixed(2)} floor=${scene0.floor}/${scene0.floorCount}`,
    );
  }

  // Climb the floor-0 shaft flight. Stack builds only "down" metadata stairs
  // (deeper campaign floor), but the mesh still rises in world +Y from its root.
  const climb = await evaluate(
    ws,
    `(async () => {
      const diag = window.__THREE_GAME_DIAGNOSTICS__;
      const ctrl = diag.getController();
      ctrl.setControlMods?.({});
      ctrl.setSurfaceMovement?.(1, 1);
      const candidates = [];
      diag.getScene().traverse((o) => {
        if (!o?.name || !o.name.includes('staircase')) return;
        if (o.name.includes('tread') || o.name.includes('rail') || o.name.includes('sigil')) return;
        if (!(o.userData && (o.userData.walkable || o.userData.stepCount))) return;
        const tmp = new ctrl.position.constructor();
        o.updateWorldMatrix(true, false);
        o.getWorldPosition(tmp);
        candidates.push({ o, y: tmp.y, x: tmp.x, z: tmp.z, name: o.name });
      });
      // Prefer the lowest shaft root (floor 0 → floor 1).
      candidates.sort((a, b) => a.y - b.y);
      const pick = candidates[0];
      if (!pick) return { ok: false, reason: 'no-stair-root', candidates: candidates.length };
      const target = pick.o;
      const origin = { x: pick.x, y: pick.y, z: pick.z };
      const stepCount = Number(target.userData.stepCount) || 20;
      const stepRise = Number(target.userData.stepRise) || 0.22;
      const eye = Number(ctrl.eyeHeight) || 1.62;
      const standingEye = eye - 0.08;
      const before = { x: origin.x, y: origin.y + standingEye, z: origin.z };
      const beforeStats = document.getElementById('run-stats')?.textContent ?? '';
      const stepRun = Number(target.userData.stepRun) || 0.36;
      const firstTread = new ctrl.position.constructor().set(0, stepRise, stepRun * 0.5);
      const lastTread = new ctrl.position.constructor().set(
        0,
        stepCount * stepRise,
        (stepCount - 0.5) * stepRun,
      );
      target.localToWorld(firstTread);
      target.localToWorld(lastTread);
      const directionX = lastTread.x - firstTread.x;
      const directionZ = lastTread.z - firstTread.z;
      const directionLength = Math.hypot(directionX, directionZ);
      if (directionLength < 0.1) return { ok: false, reason: 'degenerate-stair-direction' };
      const climbX = directionX / directionLength;
      const climbZ = directionZ / directionLength;
      ctrl.setEnabled(false);
      // Start on the full lower landing cell, clear of the first tread AABB.
      const restoreOk = ctrl.restorePose({
        x: origin.x - climbX * 0.8,
        y: origin.y + standingEye,
        z: origin.z - climbZ * 0.8,
        yaw: Math.atan2(-climbX, -climbZ),
        pitch: -0.08,
        distanceTravelled: 0,
      });
      if (!restoreOk) {
        ctrl.setEnabled(true);
        const attempted = { x: origin.x - climbX * 0.8, z: origin.z - climbZ * 0.8 };
        const dungeon = ctrl.dungeon;
        const tileSize = Number(ctrl.tileSize) || 2.4;
        const cell = dungeon ? {
          x: Math.floor(attempted.x / tileSize + dungeon.width / 2),
          y: Math.floor(attempted.z / tileSize + dungeon.height / 2),
        } : null;
        const nearby = (ctrl.solidColliders || []).filter((collider) => {
          const nearestX = Math.max(collider.minX, Math.min(attempted.x, collider.maxX));
          const nearestZ = Math.max(collider.minZ, Math.min(attempted.z, collider.maxZ));
          return Math.hypot(attempted.x - nearestX, attempted.z - nearestZ) <= (Number(ctrl.radius) || 0.32);
        }).map((collider) => ({ ...collider })).slice(0, 12);
        return {
          ok: false,
          reason: 'real-collision-approach-rejected',
          origin,
          attempted,
          cell,
          gridValue: cell && dungeon ? dungeon.grid[cell.y]?.[cell.x] ?? null : null,
          blockedCell: cell ? ctrl.blockedCells?.has(cell.x + ',' + cell.y) ?? null : null,
          standingEye,
          climbX,
          climbZ,
          nearby,
        };
      }
      ctrl.setEnabled(true);
      ctrl.setVirtualAction('forward', true);
      let peakY = ctrl.getState().position.y;
      let frameCount = 0;
      let maxFrameGapMs = 0;
      let previousFrameAt = performance.now();
      const deadline = performance.now() + 10_000;
      while (performance.now() < deadline && peakY < origin.y + stepCount * stepRise + standingEye - 0.12) {
        const frameAt = await new Promise((r) => requestAnimationFrame(r));
        maxFrameGapMs = Math.max(maxFrameGapMs, frameAt - previousFrameAt);
        previousFrameAt = frameAt;
        frameCount += 1;
        peakY = Math.max(peakY, ctrl.getState().position.y);
      }
      ctrl.setVirtualAction('forward', false);
      for (let f = 0; f < 20; f += 1) await new Promise((r) => requestAnimationFrame(r));
      const after = ctrl.getState();
      const afterStats = document.getElementById('run-stats')?.textContent ?? '';
      window.__MF_STAIR_TOP__ = {
        x: after.position.x,
        y: after.position.y,
        z: after.position.z,
        descendYaw: Math.atan2(climbX, climbZ),
      };
      const bm = /floor\\s+(\\d+)\\s*\\/\\s*(\\d+)/i.exec(beforeStats);
      const am = /floor\\s+(\\d+)\\s*\\/\\s*(\\d+)/i.exec(afterStats);
      const nearbyColliders = (ctrl.solidColliders || []).map((collider, index) => ({ collider, index }))
        .filter(({ collider }) => {
          const nearestX = Math.max(collider.minX, Math.min(after.position.x, collider.maxX));
          const nearestZ = Math.max(collider.minZ, Math.min(after.position.z, collider.maxZ));
          return Math.hypot(after.position.x - nearestX, after.position.z - nearestZ) <= 1.2;
        })
        .map(({ collider, index }) => ({ index, ...collider }))
        .sort((a, b) => Math.abs((a.maxY ?? 0) - (after.position.y - standingEye)) - Math.abs((b.maxY ?? 0) - (after.position.y - standingEye)))
        .slice(0, 24);
      return {
        ok: true,
        stairName: pick.name,
        stepCount,
        stepRise,
        origin,
        restoreOk,
        peakY,
        before: { x: before.x, y: before.y, z: before.z, floor: bm ? Number(bm[1]) : null },
        after: {
          x: after.position.x,
          y: after.position.y,
          z: after.position.z,
          cell: after.cell,
          floor: am ? Number(am[1]) : null,
          floorCount: am ? Number(am[2]) : null,
        },
        beforeStats,
        afterStats,
        dy: peakY - before.y,
        distFromOrigin: Math.hypot(after.position.x - origin.x, after.position.z - origin.z),
        candidateCount: candidates.length,
        frameCount,
        maxFrameGapMs,
        activeDungeon: ctrl.dungeon ? {
          seed: ctrl.dungeon.seed,
          floor: ctrl.dungeon.floor?.index ?? null,
          width: ctrl.dungeon.width,
          height: ctrl.dungeon.height,
        } : null,
        nearbyColliders,
      };
    })()`,
  );
  report.steps.push({ name: "climb", climb });
  await capture(ws, "02-after-climb");

  if (!climb?.ok) {
    record("fail", `Climb failed: ${climb?.reason}`);
  } else {
    record(
      "info",
      `climb dy=${climb.dy.toFixed(2)} y=${climb.after.y.toFixed(2)} floor ${climb.before.floor}→${climb.after.floor}`,
    );
    const requiredRise = climb.stepCount * climb.stepRise - 0.25;
    if (climb.dy >= requiredRise) record("pass", "Eye height rose by nearly a full story");
    else
      record(
        "fail",
        `Eye height rise too small: ${climb.dy.toFixed(2)} < ${requiredRise.toFixed(2)}`,
      );

    // Must not teleport to distant spawn (XZ near stair origin)
    if (climb.distFromOrigin < 12)
      record("pass", "Player stayed near stair shaft (no spawn teleport)");
    else
      record("fail", `Player far from stair after climb (dist=${climb.distFromOrigin.toFixed(1)})`);

    if (
      climb.after.floor != null &&
      climb.before.floor != null &&
      climb.after.floor > climb.before.floor
    ) {
      record("pass", `Floor label advanced ${climb.before.floor} → ${climb.after.floor}`);
    } else if ((climb.after.floorCount ?? 0) < 2) {
      record("info", "Single floor — label cannot advance");
    } else {
      record("fail", `Floor label did not advance (${climb.beforeStats} → ${climb.afterStats})`);
    }
  }

  // Walk a bit on upper floor
  const walk = await evaluate(
    ws,
    `(async () => {
      const diag = window.__THREE_GAME_DIAGNOSTICS__;
      const ctrl = diag.getController();
      ctrl.setEnabled(true);
      if (typeof ctrl.setVirtualAction === 'function') ctrl.setVirtualAction('forward', true);
      const startState = ctrl.getState();
      const start = { ...startState.position };
      const startStats = document.getElementById('run-stats')?.textContent ?? '';
      const t0 = performance.now();
      await new Promise((resolve) => {
        function tick() {
          if (performance.now() - t0 > 2200) {
            if (typeof ctrl.setVirtualAction === 'function') ctrl.setVirtualAction('forward', false);
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
      const endState = ctrl.getState();
      const end = endState.position;
      const endStats = document.getElementById('run-stats')?.textContent ?? '';
      const startFloorMatch = /floor\\s+(\\d+)/i.exec(startStats);
      const endFloorMatch = /floor\\s+(\\d+)/i.exec(endStats);
      return {
        ok: true,
        start,
        end: { x: end.x, y: end.y, z: end.z },
        dy: end.y - start.y,
        dist: Math.hypot(end.x - start.x, end.z - start.z),
        startFloor: startFloorMatch ? Number(startFloorMatch[1]) : null,
        endFloor: endFloorMatch ? Number(endFloorMatch[1]) : null,
      };
    })()`,
  );
  report.steps.push({ name: "walk-upper", walk });
  if (
    walk?.ok &&
    walk.dist > 0.15 &&
    walk.dy > -0.35 &&
    (walk.startFloor == null || walk.endFloor === walk.startFloor)
  )
    record("pass", `Walked on upper slab dist=${walk.dist.toFixed(2)}`);
  else if (walk?.ok && walk.dy <= -0.35)
    record("fail", `Upper slab lost support: dy=${walk.dy.toFixed(2)}`);
  else if (walk?.ok && walk.startFloor != null && walk.endFloor !== walk.startFloor)
    record("fail", `Upper walk changed floor ${walk.startFloor} → ${walk.endFloor}`);
  else if (walk?.ok) record("info", `Little horizontal walk (dist=${walk?.dist}) — may be blocked`);
  else record("fail", "Upper walk failed");
  await capture(ws, "03-upper-walk");

  // Descend the same lowest shaft in reverse.
  const descend = await evaluate(
    ws,
    `(async () => {
      const diag = window.__THREE_GAME_DIAGNOSTICS__;
      const ctrl = diag.getController();
      const candidates = [];
      diag.getScene().traverse((o) => {
        if (!o?.name || !o.name.includes('staircase')) return;
        if (o.name.includes('tread') || o.name.includes('rail') || o.name.includes('sigil')) return;
        if (!(o.userData && (o.userData.walkable || o.userData.stepCount))) return;
        const tmp = new ctrl.position.constructor();
        o.updateWorldMatrix(true, false);
        o.getWorldPosition(tmp);
        candidates.push({ o, y: tmp.y, x: tmp.x, z: tmp.z, name: o.name });
      });
      candidates.sort((a, b) => a.y - b.y);
      const pick = candidates[0];
      if (!pick) return { ok: false, reason: 'no-stair' };
      const target = pick.o;
      const origin = { x: pick.x, y: pick.y, z: pick.z };
      const stepCount = Number(target.userData.stepCount) || 20;
      const stepRise = Number(target.userData.stepRise) || 0.22;
      const eye = Number(ctrl.eyeHeight) || 1.54;
      const standingEye = eye - 0.08;
      const climbedTop = window.__MF_STAIR_TOP__;
      const beforeStats = document.getElementById('run-stats')?.textContent ?? '';
      const stepRun = Number(target.userData.stepRun) || 0.36;
      const firstTread = new ctrl.position.constructor().set(0, stepRise, stepRun * 0.5);
      const lastTread = new ctrl.position.constructor().set(
        0,
        stepCount * stepRise,
        (stepCount - 0.5) * stepRun,
      );
      target.localToWorld(firstTread);
      target.localToWorld(lastTread);
      const directionX = lastTread.x - firstTread.x;
      const directionZ = lastTread.z - firstTread.z;
      const directionLength = Math.hypot(directionX, directionZ);
      if (directionLength < 0.1) return { ok: false, reason: 'degenerate-stair-direction' };
      const climbX = directionX / directionLength;
      const climbZ = directionZ / directionLength;
      // The climb loop may stop as soon as the eye reaches story height, while
      // the capsule is still overlapping the last riser. Start the reverse
      // traversal on the authored upper landing instead of that early sample.
      const restoreX = Number(lastTread.x + climbX * 0.45);
      const restoreY = Number(origin.y + stepCount * stepRise + standingEye);
      const restoreZ = Number(lastTread.z + climbZ * 0.45);
      ctrl.setControlMods?.({});
      ctrl.setSurfaceMovement?.(1, 1);
      const descendYaw = Number(climbedTop?.descendYaw ?? Math.atan2(climbX, climbZ));
      ctrl.setEnabled(false);
      const restoreOk = ctrl.restorePose({
        x: restoreX,
        y: restoreY,
        z: restoreZ,
        yaw: descendYaw,
        pitch: 0.08,
        distanceTravelled: 0,
      });
      if (!restoreOk) {
        ctrl.setEnabled(true);
        return { ok: false, reason: 'real-collision-upper-landing-rejected' };
      }
      const restoredStartY = ctrl.getState().position.y;
      ctrl.setEnabled(true);
      // Obsidian can invert locomotion during this live biome-event window.
      // Use the physical reverse action that currently points down the flight.
      ctrl.setVirtualAction('backward', true);
      let lowY = ctrl.getState().position.y;
      const deadline = performance.now() + 10_000;
      while (performance.now() < deadline && lowY > origin.y + eye + 0.15) {
        await new Promise((r) => requestAnimationFrame(r));
        lowY = Math.min(lowY, ctrl.getState().position.y);
      }
      ctrl.setVirtualAction('backward', false);
      const firstAttempt = ctrl.getState();
      let fallbackDirection = false;
      if (lowY > restoredStartY - 0.25) {
        fallbackDirection = true;
        ctrl.setEnabled(false);
        const fallbackOk = ctrl.restorePose({
          x: restoreX,
          y: restoreY,
          z: restoreZ,
          yaw: descendYaw + Math.PI,
          pitch: 0.08,
          distanceTravelled: 0,
        });
        ctrl.setEnabled(true);
        if (fallbackOk) {
          ctrl.setVirtualAction('backward', true);
          lowY = ctrl.getState().position.y;
          const fallbackDeadline = performance.now() + 10_000;
          while (performance.now() < fallbackDeadline && lowY > origin.y + eye + 0.15) {
            await new Promise((r) => requestAnimationFrame(r));
            lowY = Math.min(lowY, ctrl.getState().position.y);
          }
          ctrl.setVirtualAction('backward', false);
        }
      }
      for (let f = 0; f < 20; f += 1) await new Promise((r) => requestAnimationFrame(r));
      const after = ctrl.getState();
      const afterStats = document.getElementById('run-stats')?.textContent ?? '';
      const bm = /floor\\s+(\\d+)/i.exec(beforeStats);
      const am = /floor\\s+(\\d+)/i.exec(afterStats);
      return {
        ok: true,
        stairName: pick.name,
        restoreOk,
        fallbackDirection,
        dy: lowY - restoredStartY,
        restoredStartY,
        afterY: after.position.y,
        restore: { x: restoreX, y: restoreY, z: restoreZ, yaw: descendYaw },
        firstAttempt: {
          x: firstAttempt.position.x,
          y: firstAttempt.position.y,
          z: firstAttempt.position.z,
          cell: firstAttempt.cell,
        },
        after: {
          x: after.position.x,
          y: after.position.y,
          z: after.position.z,
          cell: after.cell,
        },
        beforeFloor: bm ? Number(bm[1]) : null,
        afterFloor: am ? Number(am[1]) : null,
        beforeStats,
        afterStats,
      };
    })()`,
  );
  report.steps.push({ name: "descend", descend });
  await capture(ws, "04-after-descend");
  if (descend?.ok && descend.dy < -2.5) {
    record("pass", `Descended dy=${descend.dy.toFixed(2)}`);
  } else if (descend?.ok) {
    record("fail", `Descend dy too small: ${descend.dy}`);
  } else {
    record("fail", `Descend failed: ${descend?.reason}`);
  }
  if (
    descend?.ok &&
    descend.beforeFloor != null &&
    descend.afterFloor != null &&
    descend.afterFloor < descend.beforeFloor
  ) {
    record("pass", `Floor label decreased ${descend.beforeFloor} → ${descend.afterFloor}`);
  }

  // Keep the traversal snapshot as evidence, then reset through the public
  // simulation state before a screenshot-free movement window. CDP PNG
  // encoding can block the renderer for hundreds of milliseconds and must not
  // be misreported as an in-game stutter.
  const traversalPerformance = await evaluate(
    ws,
    `(() => window.__THREE_GAME_DIAGNOSTICS__?.getRenderer?.().frameGaps ?? null)()`,
  );
  const profilerPaused = await evaluate(
    ws,
    `(() => {
      const ctrl = window.__THREE_GAME_DIAGNOSTICS__?.getController?.();
      if (!ctrl) return false;
      ctrl.setVirtualAction('forward', false);
      ctrl.setVirtualAction('sprint', false);
      ctrl.setVirtualAction('turnRight', false);
      document.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'Escape',
        key: 'Escape',
        bubbles: true,
      }));
      return document.getElementById('options-menu')?.hidden === false;
    })()`,
  );
  if (!profilerPaused) throw new Error("Could not pause through the public options menu");
  await sleep(150);
  await evaluate(
    ws,
    `(() => {
      const ctrl = window.__THREE_GAME_DIAGNOSTICS__?.getController?.();
      if (!ctrl) return false;
      document.getElementById('options-resume')?.click();
      return true;
    })()`,
  );
  const rendererBeforeSample = await evaluate(
    ws,
    `(() => {
      const renderer = window.__THREE_GAME_DIAGNOSTICS__?.getRenderer?.();
      return renderer ? {
        calls: renderer.calls,
        triangles: renderer.triangles,
        geometries: renderer.geometries,
        textures: renderer.textures,
        materials: renderer.materials,
        programs: renderer.programs,
        programProfiles: renderer.programProfiles,
      } : null;
    })()`,
  );
  // Keep this window stationary. Traversal above already proves movement;
  // wandering into a never-visited room would mix first-zone shader discovery
  // with steady-state frame cadence and invalidate this profiler gate.
  await sleep(2_200 + PERF_SAMPLE_SECONDS * 1_000);
  const performance = await evaluate(
    ws,
    `(() => {
      const diag = window.__THREE_GAME_DIAGNOSTICS__;
      const ctrl = diag?.getController?.();
      ctrl?.setVirtualAction('forward', false);
      ctrl?.setVirtualAction('sprint', false);
      ctrl?.setVirtualAction('turnRight', false);
      return diag?.getRenderer?.().frameGaps ?? null;
    })()`,
  );
  const rendererAfterSample = await evaluate(
    ws,
    `(() => {
      const renderer = window.__THREE_GAME_DIAGNOSTICS__?.getRenderer?.();
      return renderer ? {
        calls: renderer.calls,
        triangles: renderer.triangles,
        geometries: renderer.geometries,
        textures: renderer.textures,
        materials: renderer.materials,
        programs: renderer.programs,
        programProfiles: renderer.programProfiles,
      } : null;
    })()`,
  );
  report.performance = {
    thresholds: PERF_THRESHOLDS,
    sampleSeconds: PERF_SAMPLE_SECONDS,
    traversalWithScreenshots: traversalPerformance,
    observed: performance,
    rendererBeforeSample,
    rendererAfterSample,
  };
  if (!performance || performance.samples < PERF_THRESHOLDS.minimumSamples) {
    record(
      "fail",
      `Performance sample too short: ${performance?.samples ?? 0}/${PERF_THRESHOLDS.minimumSamples}`,
    );
  } else {
    const metricFailures = [
      ["p95", performance.p95, PERF_THRESHOLDS.p95Ms],
      ["p99", performance.p99, PERF_THRESHOLDS.p99Ms],
      ["max", performance.max, PERF_THRESHOLDS.maxMs],
      ["longestTask", performance.longestTask, PERF_THRESHOLDS.longestTaskMs],
    ].filter(([, value, threshold]) => !Number.isFinite(value) || value > threshold);
    if (metricFailures.length === 0) {
      record(
        "pass",
        `Frame gaps p95=${performance.p95.toFixed(1)} p99=${performance.p99.toFixed(1)} max=${performance.max.toFixed(1)} ms; long tasks=${performance.longTasks}`,
      );
    } else {
      record(
        "fail",
        `Frame-gap thresholds exceeded: ${metricFailures
          .map(([label, value, threshold]) => `${label}=${Number(value).toFixed(1)}>${threshold}`)
          .join(", ")}`,
      );
    }
  }

  if (RUN_LIFECYCLE) {
    const lifecycle = await evaluate(
      ws,
      `(async () => {
        const diag = window.__THREE_GAME_DIAGNOSTICS__;
        const ctrl = diag?.getController?.();
        const scene = diag?.getScene?.();
        if (!ctrl || !scene) return { ok: false, reason: 'missing-runtime' };
        const waitFrames = async (count) => {
          for (let frame = 0; frame < count; frame += 1) {
            await new Promise((resolve) => requestAnimationFrame(resolve));
          }
        };
        const standingEye = (Number(ctrl.eyeHeight) || 1.62) - 0.08;
        const Vector = ctrl.position.constructor;
        const stones = [];
        scene.traverse((object) => {
          if (!object?.name?.startsWith('Magic stone ')) return;
          object.updateWorldMatrix(true, false);
          const position = new Vector();
          object.getWorldPosition(position);
          stones.push({
            object,
            name: object.name,
            floorIndex: Number(object.userData?.floorIndex),
            position,
          });
        });
        stones.sort((left, right) =>
          left.floorIndex - right.floorIndex || left.name.localeCompare(right.name),
        );
        const collection = [];
        const collectStone = async (stone) => {
          ctrl.setEnabled(false);
          const restored = ctrl.restorePose({
            x: stone.position.x,
            y: stone.position.y + standingEye,
            z: stone.position.z,
            yaw: 0,
            pitch: -0.08,
            distanceTravelled: 0,
          });
          ctrl.setEnabled(true);
          await waitFrames(18);
          const state = diag.getState();
          collection.push({
            name: stone.name,
            floorIndex: stone.floorIndex,
            restored,
            stonesFound: state.stonesFound,
            portalOpen: state.hasRelic,
            mode: state.mode,
          });
          return state.mode === 'playing';
        };
        for (const stone of stones.filter((entry) => entry.floorIndex === 0)) {
          if (!(await collectStone(stone))) break;
        }

        const flights = [];
        scene.traverse((object) => {
          if (!object?.name?.includes('staircase')) return;
          if (object.name.includes('tread') || object.name.includes('rail') || object.name.includes('sigil')) return;
          if (!(object.userData && (object.userData.walkable || object.userData.stepCount))) return;
          object.updateWorldMatrix(true, false);
          const position = new Vector();
          object.getWorldPosition(position);
          flights.push({ object, name: object.name, position });
        });
        flights.sort((left, right) => left.position.y - right.position.y);
        const climbs = [];
        for (const [flightIndex, flight] of flights.entries()) {
          if (diag.getState().mode !== 'playing') break;
          const stepCount = Number(flight.object.userData.stepCount) || 20;
          const stepRise = Number(flight.object.userData.stepRise) || 0.22;
          const stepRun = Number(flight.object.userData.stepRun) || 0.36;
          const firstTread = new Vector(0, stepRise, stepRun * 0.5);
          const lastTread = new Vector(0, stepCount * stepRise, (stepCount - 0.5) * stepRun);
          flight.object.localToWorld(firstTread);
          flight.object.localToWorld(lastTread);
          const directionX = lastTread.x - firstTread.x;
          const directionZ = lastTread.z - firstTread.z;
          const directionLength = Math.hypot(directionX, directionZ);
          const climbX = directionX / directionLength;
          const climbZ = directionZ / directionLength;
          ctrl.setEnabled(false);
          const restored = ctrl.restorePose({
            x: flight.position.x - climbX * 0.8,
            y: flight.position.y + standingEye,
            z: flight.position.z - climbZ * 0.8,
            yaw: Math.atan2(-climbX, -climbZ),
            pitch: -0.08,
            distanceTravelled: 0,
          });
          ctrl.setEnabled(true);
          ctrl.setVirtualAction('forward', true);
          const startY = ctrl.getState().position.y;
          let peakY = startY;
          const deadline = performance.now() + 10_000;
          const targetY = flight.position.y + stepCount * stepRise + standingEye - 0.12;
          while (performance.now() < deadline && peakY < targetY) {
            await waitFrames(1);
            peakY = Math.max(peakY, ctrl.getState().position.y);
          }
          ctrl.setVirtualAction('forward', false);
          await waitFrames(18);
          const state = diag.getState();
          climbs.push({
            name: flight.name,
            originY: flight.position.y,
            restored,
            startY,
            peakY,
            rise: peakY - startY,
            activeSeed: state.seed,
            mode: state.mode,
          });
          if (state.mode !== 'playing') break;
          for (const stone of stones.filter((entry) => entry.floorIndex === flightIndex + 1)) {
            if (!(await collectStone(stone))) break;
          }
        }

        const portal = scene.getObjectByName('Escape portal gate');
        let portalEntry = null;
        if (portal && diag.getState().mode === 'playing') {
          portal.updateWorldMatrix(true, false);
          const position = new Vector();
          portal.getWorldPosition(position);
          ctrl.setEnabled(false);
          const restored = ctrl.restorePose({
            x: position.x,
            y: position.y + standingEye,
            z: position.z,
            yaw: portal.rotation.y,
            pitch: 0,
            distanceTravelled: 0,
          });
          ctrl.setEnabled(true);
          await waitFrames(36);
          portalEntry = { restored, x: position.x, y: position.y, z: position.z };
        }
        const finalState = diag.getState();
        const overlay = document.getElementById('end-overlay');
        return {
          ok: true,
          floorCount: diag.getResidentFloorCount?.() ?? null,
          stoneCount: stones.length,
          collection,
          flights: flights.length,
          climbs,
          portalEntry,
          finalState: {
            mode: finalState.mode,
            exitReached: finalState.exitReached,
            stonesFound: finalState.stonesFound,
            portalOpen: finalState.hasRelic,
          },
          overlay: {
            hidden: overlay?.hidden ?? null,
            end: overlay?.dataset.end ?? null,
          },
        };
      })()`,
    );
    report.steps.push({ name: "objective-and-completion", lifecycle });
    if (!lifecycle?.ok) {
      record("fail", `Lifecycle failed: ${lifecycle?.reason ?? "unknown"}`);
    } else {
      const collectedAll =
        lifecycle.stoneCount === 4 &&
        lifecycle.collection?.length === 4 &&
        lifecycle.collection.every((entry) => entry.restored) &&
        lifecycle.collection.at(-1)?.stonesFound === 4 &&
        lifecycle.collection.at(-1)?.portalOpen === true;
      if (collectedAll) record("pass", "Collected all four real stone pickups and opened portal");
      else record("fail", `Stone objective incomplete: ${JSON.stringify(lifecycle.collection)}`);

      const expectedFlights = Math.max(0, Number(lifecycle.floorCount ?? 1) - 1);
      const climbedAll =
        lifecycle.flights === expectedFlights &&
        lifecycle.climbs?.length === expectedFlights &&
        lifecycle.climbs.every((entry) => entry.restored && entry.rise >= 4.05);
      if (climbedAll)
        record("pass", `Physically climbed all ${expectedFlights} campaign flight(s)`);
      else record("fail", `Full-stack climb incomplete: ${JSON.stringify(lifecycle.climbs)}`);

      if (
        lifecycle.portalEntry?.restored &&
        lifecycle.finalState?.mode === "won" &&
        lifecycle.finalState?.exitReached === true &&
        lifecycle.overlay?.hidden === false &&
        lifecycle.overlay?.end === "won"
      ) {
        record("pass", "Crossed the final portal and reached the real victory overlay");
      } else {
        record("fail", `Portal completion failed: ${JSON.stringify(lifecycle)}`);
      }
    }
    await capture(ws, "05-complete-run");

    const deadUrl = `${BASE}/?mode=play&seed=${encodeURIComponent(SEED)}&mood=${encodeURIComponent(BIOME)}&perfAudit=1&qaState=dead${crtQuery}&_smoke=${Date.now()}`;
    await send(ws, "Page.navigate", { url: deadUrl });
    await sleep(1_500);
    await waitForAppReady(ws);
    await waitForGameReady(ws);
    const deadState = await evaluate(
      ws,
      `(() => {
        const state = window.__THREE_GAME_DIAGNOSTICS__?.getState?.();
        const overlay = document.getElementById('end-overlay');
        return {
          mode: state?.mode ?? null,
          resolve: state?.resolve ?? null,
          overlayHidden: overlay?.hidden ?? null,
          overlayEnd: overlay?.dataset.end ?? null,
          retryVisible: document.getElementById('retry')?.hidden === false,
        };
      })()`,
    );
    report.steps.push({ name: "dead-state", deadState });
    if (
      deadState?.mode === "dead" &&
      deadState?.resolve === 0 &&
      deadState?.overlayHidden === false &&
      deadState?.overlayEnd === "dead" &&
      deadState?.retryVisible
    ) {
      record("pass", "Defeat exposes the real Try again action");
    } else {
      record("fail", `Defeat state invalid: ${JSON.stringify(deadState)}`);
    }
    await capture(ws, "06-dead");

    await evaluate(ws, `(() => document.getElementById('retry')?.click())()`);
    const retryDeadline = Date.now() + 40_000;
    let retryState = null;
    while (Date.now() < retryDeadline) {
      retryState = await evaluate(
        ws,
        `(() => {
          const state = window.__THREE_GAME_DIAGNOSTICS__?.getState?.();
          const shell = document.querySelector('.app-shell');
          return {
            ready: state?.ready ?? false,
            mode: state?.mode ?? null,
            resolve: state?.resolve ?? null,
            stonesFound: state?.stonesFound ?? null,
            overlayHidden: document.getElementById('end-overlay')?.hidden ?? null,
            rendererReady: shell?.dataset.rendererReady ?? null,
          };
        })()`,
      );
      if (
        retryState?.ready === true &&
        retryState?.mode === "playing" &&
        retryState?.resolve === 100 &&
        retryState?.stonesFound === 0 &&
        retryState?.overlayHidden === true &&
        retryState?.rendererReady === "true"
      ) {
        break;
      }
      await sleep(500);
    }
    report.steps.push({ name: "retry", retryState });
    if (
      retryState?.ready === true &&
      retryState?.mode === "playing" &&
      retryState?.resolve === 100 &&
      retryState?.stonesFound === 0 &&
      retryState?.overlayHidden === true
    ) {
      record("pass", "Try again rebuilt a fresh playable run");
    } else {
      record("fail", `Retry did not recover play: ${JSON.stringify(retryState)}`);
    }
    await capture(ws, "07-retry");
  }

  const severe = browserErrors.filter(
    (e) => !/favicon|AudioContext|pointer lock|ResizeObserver|WebGL/i.test(e),
  );
  if (severe.length === 0) record("pass", "No severe browser exceptions during smoke");
  else record("fail", `Browser errors: ${severe.length} — ${severe[0]?.slice?.(0, 120)}`);

  const fails = findings.filter((f) => f.level === "fail");
  report.pass = fails.length === 0;
  report.findings = findings;
  report.browserErrors = browserErrors.slice(0, 30);
  report.networkErrors = networkErrors.slice(0, 20);
  report.finishedAt = new Date().toISOString();

  await writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  await writeFile(
    path.join(outDir, "report.md"),
    [
      `# Multi-floor browser smoke`,
      ``,
      `- Biome: \`${BIOME}\` seed \`${SEED}\``,
      `- Base: ${BASE}`,
      `- Result: **${report.pass ? "PASS" : "FAIL"}**`,
      `- Evidence: \`${path.relative(process.cwd(), outDir).replaceAll("\\\\", "/")}\``,
      ``,
      `## Findings`,
      ...findings.map((f) => `- **${f.level}**: ${f.message}`),
      ``,
    ].join("\n"),
  );

  console.log(`\n[smoke] ${report.pass ? "PASS" : "FAIL"} → ${outDir}`);
  chrome.kill();
  process.exit(report.pass ? 0 : 1);
} catch (error) {
  report.pass = false;
  report.error = String(error);
  report.findings = findings;
  report.browserErrors = browserErrors;
  await writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2)).catch(
    () => null,
  );
  console.error("[smoke] aborted", error);
  try {
    chrome.kill();
  } catch {
    /* ignore */
  }
  process.exit(1);
}
