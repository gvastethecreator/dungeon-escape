/**
 * CDP photo tool: headless Chrome screenshots with in-scene teleports.
 * Requires the Dungeon Escape dev server running on :24211.
 *
 * Usage:
 *   bun run scripts/cdp-photo.ts <seed> <outDir> [nameSubstring,dx,dz,pitch,label]...
 *   MOOD=frost bun run scripts/cdp-photo.ts BIOME-1 .proof-hud
 *
 * Example:
 *   bun run scripts/cdp-photo.ts ash-demo .proof-hud "Resolve flask,1.6,1.6,-0.25,flask"
 *
 * With no shot specs it captures the spawn view only.
 * Set env MOOD (or THEME) to force `?mood=` lighting biome.
 */

interface CdpTarget {
  webSocketDebuggerUrl: string;
}

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9223;
const BASE = "http://127.0.0.1:24211";

const seed = process.argv[2] ?? "ash-demo";
const outDir = process.argv[3] ?? ".proof-hud";
const shotSpecs = process.argv.slice(4);

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

const chrome = Bun.spawn(
  [
    CHROME,
    `--remote-debugging-port=${PORT}`,
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
    };
    if (msg.id && pending.has(msg.id)) {
      const entry = pending.get(msg.id)!;
      pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
      else entry.resolve(msg.result);
    }
  };
  await new Promise<void>((resolve) => {
    ws.onopen = () => resolve();
  });

  await send(ws, "Page.enable");
  await send(ws, "Runtime.enable");
  await send(ws, "Emulation.setDeviceMetricsOverride", {
    width: 1600,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const moodParam = (process.env.MOOD ?? process.env.THEME ?? "").trim().toLowerCase();
  const moodQuery = moodParam ? `&mood=${encodeURIComponent(moodParam)}` : "";
  await send(ws, "Page.navigate", {
    url: `${BASE}/?mode=play&seed=${encodeURIComponent(seed)}${moodQuery}`,
  });
  await sleep(6000);

  const started = (await send(ws, "Runtime.evaluate", {
    expression: `(() => {
      const button = document.querySelector("#welcome-new");
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      button.click();
      return true;
    })()`,
    returnByValue: true,
  })) as { result?: { value?: boolean } };
  if (started.result?.value) await sleep(1200);

  async function capture(label: string): Promise<void> {
    const shot = (await send(ws, "Page.captureScreenshot", { format: "png" })) as { data: string };
    const path = `${outDir}/${label}.png`;
    await Bun.write(path, Buffer.from(shot.data, "base64"));
    console.log(`saved ${path}`);
  }

  async function teleport(
    nameSubstring: string,
    dx: number,
    dz: number,
    pitch: number,
  ): Promise<string> {
    const expression = `(() => {
      const diag = window.__THREE_GAME_DIAGNOSTICS__;
      const ctrl = diag.getController();
      let target = null;
      diag.getScene().traverse((o) => {
        if (!target && o.name && o.name.includes(${JSON.stringify(nameSubstring)})) target = o;
      });
      if (!target) return 'MISSING';
      const wp = { x: 0, y: 0, z: 0 };
      const v = new ctrl.position.constructor();
      target.getWorldPosition(v);
      wp.x = v.x; wp.y = v.y; wp.z = v.z;
      ctrl.position.set(wp.x + ${dx}, 1.62, wp.z + ${dz});
      const ddx = wp.x - ctrl.position.x;
      const ddz = wp.z - ctrl.position.z;
      const yaw = Math.atan2(-ddx, -ddz);
      ctrl.lookYaw = yaw; ctrl.targetYaw = yaw;
      const dist = Math.hypot(ddx, ddz);
      const aimY = wp.y + 0.3;
      const p = Math.atan2(aimY - 1.62, dist) + ${pitch};
      ctrl.lookPitch = p; ctrl.targetPitch = p;
      return 'OK ' + wp.x.toFixed(1) + ',' + wp.z.toFixed(1);
    })()`;
    const result = (await send(ws, "Runtime.evaluate", { expression, returnByValue: true })) as {
      result: { value: string };
    };
    return result.result.value;
  }

  await capture("spawn");
  for (const spec of shotSpecs) {
    const [name, dx, dz, pitch, label] = spec.split(",");
    if (!name || !label) continue;
    const status = await teleport(name, Number(dx ?? 1.6), Number(dz ?? 1.6), Number(pitch ?? 0));
    console.log(`${label}: ${status}`);
    await sleep(900);
    await capture(label);
  }
  ws.close();
} finally {
  chrome.kill();
}
