/**
 * WGP-03 browser capture for Play performance baselines.
 *
 * Boots Play with the requested renderer, samples frame-gap + renderer info,
 * and writes a PerfBaselineArtifact JSON.
 *
 * Usage:
 *   bun run scripts/capture-perf-baseline.ts <outJson> [webgl|webgpu]
 *
 * Env:
 *   PHOTO_BASE_URL, SEED, MOOD, CRT, SAMPLE_SECONDS, CHROME_PATH
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  buildPerfBaselineArtifact,
  type PerfBaselineCaptureContext,
} from "../src/systems/PerfBaselineCapture";
import type { PerfBaselineSample } from "../src/systems/PerfBaselineCompare";

const BASE = (process.env.PHOTO_BASE_URL ?? "http://127.0.0.1:24211").replace(/\/$/, "");
const SEED = process.env.SEED ?? "WGP03-BASELINE";
const MOOD = process.env.MOOD ?? "ash";
const CRT = (process.env.CRT ?? "off").trim().toLowerCase() === "on";
const SAMPLE_SECONDS = Math.max(3, Number.parseFloat(process.env.SAMPLE_SECONDS ?? "8") || 8);
const CHROME =
  process.env.CHROME_PATH ??
  (process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : "/usr/bin/google-chrome-stable");

type Backend = "webgl" | "webgpu";

function parseBackend(arg: string | undefined): Backend {
  const raw = (arg ?? "webgl").trim().toLowerCase();
  if (raw === "webgl" || raw === "webgpu") return raw;
  throw new Error(`Backend must be webgl|webgpu; received ${JSON.stringify(arg)}`);
}

async function main(): Promise<void> {
  const outJson = process.argv[2];
  if (!outJson) {
    console.error("Usage: bun run scripts/capture-perf-baseline.ts <outJson> [webgl|webgpu]");
    process.exit(1);
  }
  const backend = parseBackend(process.argv[3]);
  const params = new URLSearchParams({
    seed: SEED,
    mood: MOOD,
    renderer: backend,
    crt: CRT ? "1" : "0",
    perfAudit: "1",
  });
  const url = `${BASE}/?${params.toString()}`;
  const port = 9500 + (process.pid % 400);
  const userDataDir = join(
    process.env.TMPDIR ?? process.env.TEMP ?? "/tmp",
    `dungeon-escape-perf-${process.pid}-${port}`,
  );
  const proc = Bun.spawn(
    [
      CHROME,
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--headless=new",
      "--disable-gpu-sandbox",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=1280,720",
      url,
    ],
    { stdout: "ignore", stderr: "ignore" },
  );

  try {
    let wsUrl: string | null = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await Bun.sleep(250);
      try {
        const targets = (await fetch(`http://127.0.0.1:${port}/json/list`).then((r) =>
          r.json(),
        )) as Array<{ type: string; webSocketDebuggerUrl?: string }>;
        const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
        if (page?.webSocketDebuggerUrl) {
          wsUrl = page.webSocketDebuggerUrl;
          break;
        }
      } catch {
        // booting
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
      return await new Promise<Record<string, unknown>>((resolve, reject) => {
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
    };

    await send("Page.enable");
    await send("Runtime.enable");
    await Bun.sleep(Math.round(SAMPLE_SECONDS * 1000));

    const evaluated = (await send("Runtime.evaluate", {
      expression: `(() => {
        const info = globalThis.__rendererInfo || {};
        const gaps = globalThis.__frameGapSnapshot
          ? globalThis.__frameGapSnapshot()
          : null;
        return JSON.stringify({ info, gaps, ua: navigator.userAgent });
      })()`,
      returnByValue: true,
    })) as { result?: { value?: string } };

    const payload = JSON.parse(evaluated.result?.value ?? "{}") as {
      info?: {
        backend?: string;
        fellBack?: boolean;
        fallbackReason?: string | null;
      };
      gaps?: {
        p50?: number;
        p95?: number;
        max?: number;
        longestTask?: number;
      };
      ua?: string;
    };

    const sample: PerfBaselineSample = {
      frameP50Ms: payload.gaps?.p50 ?? 0,
      frameP95Ms: payload.gaps?.p95 ?? 0,
      frameMaxMs: payload.gaps?.max ?? 0,
      drawCalls: 0,
      triangles: 0,
      programs: 0,
      rendererReadyMs: 0,
      firstInputMs: 0,
      longestLongTaskMs:
        typeof payload.gaps?.longestTask === "number" && payload.gaps.longestTask > 0
          ? payload.gaps.longestTask
          : null,
    };

    const context: PerfBaselineCaptureContext = {
      commit: process.env.GIT_COMMIT ?? "local",
      machine: process.env.MACHINE ?? "local",
      browser: payload.ua ?? "chrome-headless",
      os: process.platform,
      seed: SEED,
      mood: MOOD,
      capabilityPath: String(payload.info?.backend ?? backend),
      backend,
      crtEnabled: CRT,
    };
    const artifact = buildPerfBaselineArtifact(context, [sample]);
    await mkdir(dirname(outJson), { recursive: true });
    await writeFile(outJson, JSON.stringify(artifact, null, 2));
    console.info(`[perf] wrote ${outJson}`);
    ws.close();
  } finally {
    proc.kill();
    try {
      await proc.exited;
    } catch {
      // ignore
    }
  }
}

await main();
