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

import {
  buildVisualParitySceneUrl,
  parseVisualParityCaptureBackends,
} from "../src/systems/VisualParityCapture";
import { VISUAL_PARITY_SCENES } from "../src/systems/VisualParityCompare";

const BASE = (process.env.PHOTO_BASE_URL ?? "http://127.0.0.1:24211").replace(/\/$/, "");
const CRT = (process.env.CRT ?? "off").trim().toLowerCase() === "on" ? "on" : "off";
const CHROME =
  process.env.CHROME_PATH ??
  (process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : "/usr/bin/google-chrome-stable");

async function captureWithCdp(
  url: string,
  outPng: string,
): Promise<{ width: number; height: number }> {
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
    const send = async (method: string, params?: Record<string, unknown>) => {
      const id = nextId++;
      const payload = JSON.stringify({ id, method, params });
      const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 20_000);
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
    // Wait for Play boot marker when present; otherwise settle on a timed pause.
    await Bun.sleep(4_000);
    try {
      await send("Runtime.evaluate", {
        expression:
          "globalThis.__rendererInfo ? JSON.stringify(globalThis.__rendererInfo) : null",
        returnByValue: true,
      });
    } catch {
      // Non-fatal — still capture the frame.
    }
    const shot = (await send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
    })) as { data?: string };
    if (!shot.data) throw new Error("Screenshot payload missing");
    const bytes = Buffer.from(shot.data, "base64");
    await writeFile(outPng, bytes);
    ws.close();
    return { width: 1280, height: 720 };
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

  const manifest: Array<Record<string, unknown>> = [];
  for (const backend of backends) {
    for (const scene of VISUAL_PARITY_SCENES) {
      const url = buildVisualParitySceneUrl({
        baseUrl: BASE,
        sceneId: scene.id,
        backend,
        crt: CRT,
      });
      const file = `${backend}-${scene.id}.png`;
      const outPng = join(outDir, file);
      console.info(`[parity] ${backend} ${scene.id} ← ${url}`);
      const size = await captureWithCdp(url, outPng);
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
        ...size,
        capturedAt: new Date().toISOString(),
      };
      await writeFile(join(outDir, `${backend}-${scene.id}.json`), JSON.stringify(sidecar, null, 2));
      manifest.push(sidecar);
    }
  }
  await writeFile(join(outDir, "manifest.json"), JSON.stringify({ scenes: manifest }, null, 2));
  console.info(`[parity] wrote ${manifest.length} captures → ${outDir}`);
}

await main();
