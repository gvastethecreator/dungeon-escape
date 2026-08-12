/**
 * WGP-02 browser capture driver for the visual parity scene matrix.
 *
 * Captures each VISUAL_PARITY_SCENES id under WebGL and (optionally) WebGPU,
 * writing PNG + a small JSON sidecar into an output directory.
 *
 * Usage:
 *   bun run scripts/capture-visual-parity-matrix.ts <outDir> [webgl|webgpu|both]
 *
 * Env:
 *   PHOTO_BASE_URL  — Play origin (default http://127.0.0.1:24211)
 *   CRT=off|on      — CRT query override (default off for stable parity)
 *   CHROME_PATH     — Chrome/Chromium binary
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

import {
  buildVisualParitySceneUrl,
  parseVisualParityCaptureBackends,
} from "../src/systems/VisualParityCapture";
import { VISUAL_PARITY_SCENES } from "../src/systems/VisualParityCompare";
import { compareRgbaImages } from "../src/systems/VisualParityCompare";
import type { VisualParitySceneConfig } from "../src/systems/VisualParityCompare";

const BASE = (process.env.PHOTO_BASE_URL ?? "http://127.0.0.1:24211").replace(/\/$/, "");
const CRT = (process.env.CRT ?? "off").trim().toLowerCase() === "on" ? "on" : "off";
const SCENE_ID = (process.env.SCENE_ID ?? "").trim();
const CDP_COMMAND_TIMEOUT_MS = Math.max(
  20_000,
  Number.parseInt(process.env.CDP_COMMAND_TIMEOUT_MS ?? "60000", 10) || 60_000,
);
const CHROME =
  process.env.CHROME_PATH ??
  (process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : "/usr/bin/google-chrome-stable");

async function captureWithCdp(
  url: string,
  outPng: string,
  scene: VisualParitySceneConfig,
  backend: "webgl" | "webgpu",
): Promise<Record<string, unknown>> {
  const port = 9400 + (process.pid % 400);
  const userDataDir = join(
    process.env.TMPDIR ?? process.env.TEMP ?? "/tmp",
    `dungeon-escape-parity-${process.pid}-${port}`,
  );
  const chromeArgs = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--headless=new",
    "--disable-gpu-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1280,720",
    url,
  ];
  const proc = Bun.spawn([CHROME, ...chromeArgs], {
    stdout: "ignore",
    stderr: "ignore",
  });

  try {
    let wsUrl: string | null = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await Bun.sleep(250);
      try {
        const targets = (await fetch(`http://127.0.0.1:${port}/json/list`).then((r) =>
          r.json(),
        )) as Array<{ type: string; webSocketDebuggerUrl?: string; url?: string }>;
        const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
        if (page?.webSocketDebuggerUrl) {
          wsUrl = page.webSocketDebuggerUrl;
          break;
        }
      } catch {
        // Chrome still booting.
      }
    }
    if (!wsUrl) throw new Error("CDP WebSocket endpoint not found");

    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", () => reject(new Error("CDP socket failed")), { once: true });
    });

    let nextId = 1;
    const browserErrors: string[] = [];
    const networkErrors: string[] = [];
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as {
        method?: string;
        params?: Record<string, any>;
      };
      if (message.method === "Runtime.exceptionThrown") {
        browserErrors.push(String(message.params?.exceptionDetails?.text ?? "Runtime exception"));
      }
      if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") {
        browserErrors.push(String(message.params.entry.text ?? "Browser log error"));
      }
      if (message.method === "Network.loadingFailed" && message.params?.type !== "Ping") {
        networkErrors.push(String(message.params?.errorText ?? "Network load failed"));
      }
    });
    const send = async (method: string, params?: Record<string, unknown>) => {
      const id = nextId++;
      const payload = JSON.stringify({ id, method, params });
      const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`CDP timeout: ${method}`)),
          CDP_COMMAND_TIMEOUT_MS,
        );
        const onMessage = (event: MessageEvent) => {
          const data = JSON.parse(String(event.data)) as {
            id?: number;
            result?: Record<string, unknown>;
            error?: { message?: string };
          };
          if (data.id !== id) return;
          clearTimeout(timer);
          ws.removeEventListener("message", onMessage);
          if (data.error) reject(new Error(data.error.message ?? method));
          else resolve(data.result ?? {});
        };
        ws.addEventListener("message", onMessage);
        ws.send(payload);
      });
      return response;
    };

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Log.enable");
    await send("Network.enable");

    let ready: Record<string, any> | null = null;
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      try {
        await send("Page.captureScreenshot", { format: "png", fromSurface: true });
      } catch {
        // The first renderer frames may not have a surface yet.
      }
      const evaluated = (await send("Runtime.evaluate", {
        expression: `(() => ({
          rendererInfo: globalThis.__rendererInfo ?? null,
          rendererReady: document.querySelector('.app-shell')?.dataset.rendererReady ?? '',
          bootHidden: Boolean(document.querySelector('#boot-screen')?.hidden),
          welcomeHidden: Boolean(document.querySelector('#welcome-screen')?.hidden),
          engineReady: Boolean(globalThis.__BLACK_FLAG_DUNGEON_ENGINE__?.ready),
          runtime: globalThis.__THREE_GAME_DIAGNOSTICS__?.getState?.() ?? null,
        }))()`,
        returnByValue: true,
      })) as { result?: { value?: Record<string, any> } };
      ready = evaluated.result?.value ?? null;
      if (
        ready?.rendererInfo?.backend === backend &&
        ready.rendererInfo.fellBack !== true &&
        ready.rendererReady === "true" &&
        ready.bootHidden &&
        ready.welcomeHidden &&
        ready.engineReady
      )
        break;
      await Bun.sleep(250);
    }
    if (
      ready?.rendererInfo?.backend !== backend ||
      ready.rendererReady !== "true" ||
      !ready.bootHidden ||
      !ready.welcomeHidden ||
      !ready.engineReady
    )
      throw new Error(`Parity scene did not reach playable ${backend}: ${JSON.stringify(ready)}`);

    let targetEvidence: Record<string, unknown> | null = null;
    if (scene.targetName) {
      const positioned = (await send("Runtime.evaluate", {
        expression: `(() => {
          const diag = globalThis.__THREE_GAME_DIAGNOSTICS__;
          const ctrl = diag?.getController?.();
          if (!diag || !ctrl) return 'MISSING_DIAGNOSTICS';
          let target = null;
          diag.getScene().traverse((object) => {
            if (!target && object.name?.includes(${JSON.stringify(scene.targetName)})) target = object;
          });
          if (!target) {
            const names = [];
            diag.getScene().traverse((object) => {
              if (object.name && /torch|portal|enemy|hazard/i.test(object.name)) names.push(object.name);
            });
            return 'MISSING_TARGET:' + JSON.stringify([...new Set(names)].slice(0, 40));
          }
          target.updateWorldMatrix(true, false);
          let floorOwner = target;
          while (floorOwner.parent && !Number.isInteger(floorOwner.userData?.floorIndex)) {
            floorOwner = floorOwner.parent;
          }
          const floorOrigin = new ctrl.position.constructor();
          floorOwner.getWorldPosition(floorOrigin);
          const cameraY = floorOrigin.y + 1.62;
          const targetWorld = new ctrl.position.constructor();
          let requestedIndex = null;
          let forcedVisibility = false;
          if (target.isInstancedMesh && target.count > 0) {
            const visibility = target.geometry?.getAttribute?.('aEnemyVisibility');
            requestedIndex = 0;
            if (visibility) {
              let bestVisibility = -1;
              for (let index = 0; index < target.count; index += 1) {
                const value = visibility.getX(index);
                if (value > bestVisibility) { bestVisibility = value; requestedIndex = index; }
              }
              // Deterministic parity mode intentionally freezes simulation at t=0,
              // before the spawn reveal animates. Reveal one real authored instance
              // so this capture proves the billboard material instead of an empty room.
              if (bestVisibility <= 0.05) {
                visibility.setX(requestedIndex, 1);
                visibility.needsUpdate = true;
                forcedVisibility = true;
              }
            }
            const local = target.matrixWorld.clone().identity();
            target.getMatrixAt(requestedIndex, local);
            targetWorld.setFromMatrixPosition(target.matrixWorld.clone().multiply(local));
          } else target.getWorldPosition(targetWorld);
          const dungeon = diag.getDungeon?.();
          const cameraCandidates = [];
          if (dungeon?.grid) {
            const tileSize = 2.4;
            const originX = -((dungeon.width - 1) * tileSize) * 0.5;
            const originZ = -((dungeon.height - 1) * tileSize) * 0.5;
            const targetCellX = Math.round((targetWorld.x - originX) / tileSize);
            const targetCellY = Math.round((targetWorld.z - originZ) / tileSize);
            for (let radius = 1; radius <= 8; radius += 1) {
              for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
                for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
                  if (Math.max(Math.abs(offsetX), Math.abs(offsetY)) !== radius) continue;
                  const x = targetCellX + offsetX;
                  const y = targetCellY + offsetY;
                  if (dungeon.grid[y]?.[x] !== 1) continue;
                  const worldX = originX + x * tileSize;
                  const worldZ = originZ + y * tileSize;
                  cameraCandidates.push({
                    x: worldX,
                    z: worldZ,
                    distance: Math.hypot(worldX - targetWorld.x, worldZ - targetWorld.z),
                  });
                }
              }
            }
            const desired = ${scene.targetDistance ?? 3.2};
            cameraCandidates.sort((left, right) =>
              Math.abs(left.distance - desired) - Math.abs(right.distance - desired)
            );
          }
          if (cameraCandidates.length === 0) {
            const normal = new ctrl.position.constructor(0, 0, 1).transformDirection(target.matrixWorld);
            const distance = ${scene.targetDistance ?? 3.2};
            cameraCandidates.push({
              x: targetWorld.x + normal.x * distance,
              z: targetWorld.z + normal.z * distance,
              distance,
            });
          }
          ctrl.setEnabled(false);
          let restored = false;
          let selectedCamera = null;
          for (const candidate of cameraCandidates) {
            const dx = targetWorld.x - candidate.x;
            const dz = targetWorld.z - candidate.z;
            const yaw = Math.atan2(-dx, -dz);
            const pitch = Math.atan2(targetWorld.y + ${scene.targetAimHeight ?? 0.8} - cameraY, Math.hypot(dx, dz));
            if (ctrl.restorePose({ x: candidate.x, y: cameraY, z: candidate.z, yaw, pitch, distanceTravelled: 0 })) {
              restored = true;
              selectedCamera = candidate;
              break;
            }
          }
          const camera = diag.getCamera();
          camera.updateMatrixWorld(true);
          const aimWorld = targetWorld.clone();
          aimWorld.y += ${scene.targetAimHeight ?? 0.8};
          const ndc = aimWorld.clone().project(camera);
          return 'OK:' + JSON.stringify({
            targetName: target.name,
            instanceIndex: requestedIndex,
            forcedVisibility,
            restored,
            selectedCamera,
            target: { x: targetWorld.x, y: targetWorld.y, z: targetWorld.z },
            camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
            ndc: { x: ndc.x, y: ndc.y, z: ndc.z },
          });
        })()`,
        returnByValue: true,
      })) as { result?: { value?: string } };
      if (!positioned.result?.value?.startsWith("OK:")) {
        throw new Error(`${scene.id} target positioning failed: ${positioned.result?.value}`);
      }
      targetEvidence = JSON.parse(positioned.result.value.slice(3)) as Record<string, unknown>;
      if (targetEvidence.restored !== true) {
        throw new Error(`${scene.id} could not restore a collision-safe capture pose.`);
      }
      const ndc = targetEvidence.ndc as { x?: number; y?: number; z?: number } | undefined;
      if (
        !ndc ||
        !Number.isFinite(ndc.x) ||
        !Number.isFinite(ndc.y) ||
        !Number.isFinite(ndc.z) ||
        Math.abs(ndc.x!) > 0.8 ||
        Math.abs(ndc.y!) > 0.8 ||
        ndc.z! < -1 ||
        ndc.z! > 1
      ) {
        throw new Error(`${scene.id} target is outside the capture frame: ${JSON.stringify(ndc)}`);
      }
      await Bun.sleep(750);
    }

    const shot = (await send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
    })) as { data?: string };
    if (!shot.data) throw new Error("Screenshot payload missing");
    const bytes = Buffer.from(shot.data, "base64");
    await writeFile(outPng, bytes);
    const imageStats = await sharp(bytes).stats();
    const maxDeviation = Math.max(
      ...imageStats.channels.slice(0, 3).map((channel) => channel.stdev),
    );
    if (maxDeviation < 3) throw new Error(`${scene.id} captured a near-uniform frame.`);
    const diagnostics = (await send("Runtime.evaluate", {
      expression: `(() => ({
        rendererInfo: globalThis.__rendererInfo ?? null,
        renderer: globalThis.__THREE_GAME_DIAGNOSTICS__?.getRenderer?.() ?? null,
        runtime: globalThis.__THREE_GAME_DIAGNOSTICS__?.getState?.() ?? null,
        dataset: { ...(document.querySelector('#scene')?.dataset ?? {}) },
      }))()`,
      returnByValue: true,
    })) as { result?: { value?: Record<string, unknown> } };
    ws.close();
    if (browserErrors.length > 0 || networkErrors.length > 0) {
      throw new Error(
        `${scene.id} browser gate failed: ${JSON.stringify({ browserErrors, networkErrors })}`,
      );
    }
    return {
      width: 1280,
      height: 720,
      diagnostics: diagnostics.result?.value ?? null,
      browserErrors,
      networkErrors,
      maxChannelDeviation: maxDeviation,
      targetEvidence,
    };
  } finally {
    proc.kill();
    try {
      await proc.exited;
    } catch {
      // ignore
    }
  }
}

async function main(): Promise<void> {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error(
      "Usage: bun run scripts/capture-visual-parity-matrix.ts <outDir> [webgl|webgpu|both]",
    );
    process.exit(1);
  }
  const backends = parseVisualParityCaptureBackends(process.argv[3]);
  await mkdir(outDir, { recursive: true });

  const scenes = SCENE_ID
    ? VISUAL_PARITY_SCENES.filter((scene) => scene.id === SCENE_ID)
    : VISUAL_PARITY_SCENES;
  if (scenes.length === 0) throw new Error(`Unknown SCENE_ID ${JSON.stringify(SCENE_ID)}.`);
  const manifest: Array<Record<string, unknown>> = [];
  for (const backend of backends) {
    for (const scene of scenes) {
      const url = buildVisualParitySceneUrl({
        baseUrl: BASE,
        sceneId: scene.id,
        backend,
        crt: CRT,
      });
      const file = `${backend}-${scene.id}.png`;
      const outPng = join(outDir, file);
      console.info(`[parity] ${backend} ${scene.id} ← ${url}`);
      const evidence = await captureWithCdp(url, outPng, scene, backend);
      const sidecar = {
        sceneId: scene.id,
        backend,
        seed: scene.seed,
        mood: scene.mood,
        floorIndex: scene.floorIndex,
        channelTolerance: scene.channelTolerance,
        mismatchRatioThreshold: scene.mismatchRatioThreshold,
        url,
        file,
        ...evidence,
        capturedAt: new Date().toISOString(),
      };
      await writeFile(
        join(outDir, `${backend}-${scene.id}.json`),
        JSON.stringify(sidecar, null, 2),
      );
      manifest.push(sidecar);
    }
  }
  if (backends.length === 2) {
    for (const scene of scenes) {
      const expected = await sharp(join(outDir, `webgl-${scene.id}.png`))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const actual = await sharp(join(outDir, `webgpu-${scene.id}.png`))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const report = compareRgbaImages(
        { width: expected.info.width, height: expected.info.height, data: expected.data },
        { width: actual.info.width, height: actual.info.height, data: actual.data },
        scene,
      );
      await writeFile(join(outDir, `compare-${scene.id}.json`), JSON.stringify(report, null, 2));
    }
  }
  await writeFile(join(outDir, "manifest.json"), JSON.stringify({ scenes: manifest }, null, 2));
  console.info(`[parity] wrote ${manifest.length} captures → ${outDir}`);
}

await main();
