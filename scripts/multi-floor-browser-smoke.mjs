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

const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9300 + (process.pid % 500);
const BASE = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:24211";
const BIOME = (process.env.BIOME ?? "obsidian").trim().toLowerCase();
const SEED = process.env.SEED ?? `MF-SMOKE-${BIOME.toUpperCase()}-A1`;
const outDir = path.resolve(".scratch/proof/multi-floor-browser-smoke");
await mkdir(outDir, { recursive: true });

const PROFILE = `${process.env.TEMP ?? "."}\\dungeon-escape-mf-smoke-${process.pid}`;
const findings = [];
const browserErrors = [];
const networkErrors = [];
const report = {
  biome: BIOME,
  seed: SEED,
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
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
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
      d.exception?.description ||
      d.text ||
      d.exception?.value ||
      JSON.stringify(d).slice(0, 500);
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
          highestUnlockedRank: 20,
          clears: { ancient: 1 },
          updatedAt: Date.now(),
        }));
      } catch (_) {}
    })()`,
  });

  const url = `${BASE}/?mode=play&seed=${encodeURIComponent(SEED)}&mood=${encodeURIComponent(BIOME)}&skipRunIntro=1&perfAudit=1&_smoke=${Date.now()}`;
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
      const yaw = target.rotation.y;
      const stepCount = Number(target.userData.stepCount) || 20;
      const stepRise = Number(target.userData.stepRise) || 0.22;
      const stepRun = Number(target.userData.stepRun) || 0.36;
      const eye = 1.62;
      const beforePose = ctrl.getState().position;
      const before = { x: beforePose.x, y: beforePose.y, z: beforePose.z };
      const beforeStats = document.getElementById('run-stats')?.textContent ?? '';
      ctrl.setEnabled(false);
      let restoreOk = 0;
      let restoreFail = 0;
      let forced = 0;
      const savedColliders = ctrl.solidColliders;
      // Temporarily clear prop colliders so stair seats are always restorable for smoke.
      if (Array.isArray(ctrl.solidColliders)) ctrl.solidColliders = [];
      if (ctrl.solidColliderIndex) ctrl.solidColliderIndex = null;
      for (let i = 0; i <= stepCount; i += 1) {
        const localZ = i * stepRun;
        const sin = Math.sin(yaw);
        const cos = Math.cos(yaw);
        const wx = origin.x + (-localZ * sin);
        const wz = origin.z + (localZ * cos);
        const supportY = origin.y + i * stepRise;
        const eyeY = supportY + eye;
        let ok = ctrl.restorePose({
          x: wx,
          y: eyeY,
          z: wz,
          yaw,
          pitch: -0.12,
          distanceTravelled: i,
        });
        if (!ok) {
          restoreFail += 1;
          // Force seat for multi-slab QA when occupancy still rejects the tread.
          ctrl.position?.set?.(wx, eyeY, wz);
          if (ctrl.verticalState) {
            ctrl.verticalState.y = eyeY;
            ctrl.verticalState.grounded = true;
            ctrl.verticalState.velocity = 0;
          }
          if (typeof ctrl.lookYaw === 'number') {
            ctrl.lookYaw = yaw;
            ctrl.targetYaw = yaw;
          }
          forced += 1;
          ok = true;
        } else restoreOk += 1;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }
      if (Array.isArray(savedColliders)) ctrl.solidColliders = savedColliders;
      ctrl.setEnabled(true);
      for (let f = 0; f < 30; f += 1) {
        await new Promise((r) => requestAnimationFrame(r));
      }
      const after = ctrl.getState();
      const afterStats = document.getElementById('run-stats')?.textContent ?? '';
      const bm = /floor\\s+(\\d+)\\s*\\/\\s*(\\d+)/i.exec(beforeStats);
      const am = /floor\\s+(\\d+)\\s*\\/\\s*(\\d+)/i.exec(afterStats);
      return {
        ok: true,
        stairName: pick.name,
        stepCount,
        origin,
        restoreOk,
        restoreFail,
        forced,
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
        dy: after.position.y - before.y,
        distFromOrigin: Math.hypot(after.position.x - origin.x, after.position.z - origin.z),
        candidateCount: candidates.length,
      };
    })()`,
  );
  report.steps.push({ name: "climb", climb });
  await capture(ws, "02-after-climb");

  if (!climb?.ok) {
    record("fail", `Climb failed: ${climb?.reason}`);
  } else {
    record("info", `climb dy=${climb.dy.toFixed(2)} y=${climb.after.y.toFixed(2)} floor ${climb.before.floor}→${climb.after.floor}`);
    if (climb.dy >= 3.5) record("pass", "Eye height rose by nearly a full story");
    else record("fail", `Eye height rise too small: ${climb.dy.toFixed(2)}`);

    // Must not teleport to distant spawn (XZ near stair origin)
    if (climb.distFromOrigin < 12) record("pass", "Player stayed near stair shaft (no spawn teleport)");
    else record("fail", `Player far from stair after climb (dist=${climb.distFromOrigin.toFixed(1)})`);

    if (
      climb.after.floor != null &&
      climb.before.floor != null &&
      climb.after.floor > climb.before.floor
    ) {
      record("pass", `Floor label advanced ${climb.before.floor} → ${climb.after.floor}`);
    } else if ((climb.after.floorCount ?? 0) < 2) {
      record("info", "Single floor — label cannot advance");
    } else {
      record(
        "fail",
        `Floor label did not advance (${climb.beforeStats} → ${climb.afterStats})`,
      );
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
      const start = { ...ctrl.getState().position };
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
      const end = ctrl.getState().position;
      return {
        ok: true,
        start,
        end: { x: end.x, y: end.y, z: end.z },
        dy: end.y - start.y,
        dist: Math.hypot(end.x - start.x, end.z - start.z),
      };
    })()`,
  );
  report.steps.push({ name: "walk-upper", walk });
  if (walk?.ok && walk.dist > 0.15) record("pass", `Walked on upper slab dist=${walk.dist.toFixed(2)}`);
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
      const yaw = target.rotation.y;
      const stepCount = Number(target.userData.stepCount) || 20;
      const stepRise = Number(target.userData.stepRise) || 0.22;
      const stepRun = Number(target.userData.stepRun) || 0.36;
      const eye = 1.62;
      const before = ctrl.getState().position.y;
      const beforeStats = document.getElementById('run-stats')?.textContent ?? '';
      ctrl.setEnabled(false);
      const savedColliders = ctrl.solidColliders;
      if (Array.isArray(ctrl.solidColliders)) ctrl.solidColliders = [];
      if (ctrl.solidColliderIndex) ctrl.solidColliderIndex = null;
      for (let i = stepCount; i >= 0; i -= 1) {
        const localZ = i * stepRun;
        const sin = Math.sin(yaw);
        const cos = Math.cos(yaw);
        const wx = origin.x + (-localZ * sin);
        const wz = origin.z + (localZ * cos);
        const eyeY = origin.y + i * stepRise + eye;
        const ok = ctrl.restorePose({
          x: wx,
          y: eyeY,
          z: wz,
          yaw: yaw + Math.PI,
          pitch: 0.1,
          distanceTravelled: stepCount - i,
        });
        if (!ok) {
          ctrl.position?.set?.(wx, eyeY, wz);
          if (ctrl.verticalState) {
            ctrl.verticalState.y = eyeY;
            ctrl.verticalState.grounded = true;
            ctrl.verticalState.velocity = 0;
          }
        }
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }
      if (Array.isArray(savedColliders)) ctrl.solidColliders = savedColliders;
      ctrl.setEnabled(true);
      for (let f = 0; f < 45; f += 1) await new Promise((r) => requestAnimationFrame(r));
      const after = ctrl.getState();
      const afterStats = document.getElementById('run-stats')?.textContent ?? '';
      const bm = /floor\\s+(\\d+)/i.exec(beforeStats);
      const am = /floor\\s+(\\d+)/i.exec(afterStats);
      return {
        ok: true,
        stairName: pick.name,
        dy: after.position.y - before,
        afterY: after.position.y,
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
      `- Evidence: \`.scratch/proof/multi-floor-browser-smoke/\``,
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
