import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:24211";
const chromePath =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outputDirectory = resolve(".scratch/proof/mobile-ui-smoke");
const profile = `${process.env.TEMP ?? "."}\\dungeon-escape-mobile-smoke-${process.pid}`;
const port = 9800 + (process.pid % 100);
const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
];
await mkdir(outputDirectory, { recursive: true });

const chrome = Bun.spawn(
  [
    chromePath,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--headless=new",
    "--disable-gpu-sandbox",
    "--no-first-run",
    "--hide-scrollbars",
    "about:blank",
  ],
  { stdout: "ignore", stderr: "ignore" },
);

let messageId = 0;
const pending = new Map();

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

function send(socket, method, params = {}) {
  const id = ++messageId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolveMessage, rejectMessage) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      rejectMessage(new Error(`CDP ${method} timed out`));
    }, 30_000);
    pending.set(id, { resolveMessage, rejectMessage, timeout });
  });
}

async function waitForDebugger() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome is still starting.
    }
    await sleep(250);
  }
  throw new Error("Chrome debugger did not start");
}

async function evaluate(socket, expression) {
  const response = await send(socket, "Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails)
    throw new Error(response.exceptionDetails.text ?? "Evaluation failed");
  return response.result?.value;
}

async function waitFor(socket, expression, timeoutMilliseconds = 90_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (await evaluate(socket, expression)) return;
    await sleep(300);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function setViewport(socket, viewport) {
  await send(socket, "Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.name === "mobile",
  });
}

async function screenshot(socket, name) {
  const shot = await send(socket, "Page.captureScreenshot", { format: "png" });
  await writeFile(resolve(outputDirectory, name), Buffer.from(shot.data, "base64"));
}

const inspectWelcomeExpression = `(() => {
  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
  };
  const unlabeled = [...document.querySelectorAll('button, a[href], input, select')]
    .filter(visible)
    .filter((element) => !(
      element.getAttribute('aria-label') ||
      element.getAttribute('title') ||
      element.textContent?.trim() ||
      (element instanceof HTMLInputElement ? element.placeholder : '')
    ))
    .map((element) => element.id || element.className || element.tagName);
  const actions = ['welcome-new', 'welcome-continue', 'welcome-custom'].map((id) => {
    const element = document.getElementById(id);
    const rect = element?.getBoundingClientRect();
    return { id, visible: Boolean(element && visible(element)), width: rect?.width ?? 0, height: rect?.height ?? 0 };
  });
  return { overflowX: document.documentElement.scrollWidth - innerWidth, unlabeled, actions };
})()`;

const inspectPickerExpression = `(() => ({
  overflowX: document.documentElement.scrollWidth - innerWidth,
  options: [...document.querySelectorAll('.biome-picker-option')]
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).length,
}))()`;

const report = { baseUrl, startedAt: new Date().toISOString(), viewports: [], errors: [] };
let socket;
try {
  const socketUrl = await waitForDebugger();
  socket = new WebSocket(socketUrl);
  await new Promise((resolveOpen) => {
    socket.onopen = resolveOpen;
  });
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timeout);
    if (message.error) entry.rejectMessage(new Error(JSON.stringify(message.error)));
    else entry.resolveMessage(message.result);
  };
  await send(socket, "Page.enable");
  await send(socket, "Runtime.enable");
  await send(socket, "Page.addScriptToEvaluateOnNewDocument", {
    source: `localStorage.setItem('blackflag.dungeon.player.v1', ${JSON.stringify(
      JSON.stringify({
        version: 1,
        name: "mobile-smoke",
        avatarIndex: 0,
        hasCompletedRun: true,
        highestUnlockedRank: 10,
        clears: { ancient: 1 },
        updatedAt: Date.now(),
      }),
    )});`,
  });
  await setViewport(socket, viewports[0]);
  console.log(`[mobile-smoke] navigate ${baseUrl}`);
  await send(socket, "Page.navigate", { url: `${baseUrl}/?_mobileSmoke=${Date.now()}` });
  await waitFor(socket, `Boolean(document.querySelector('#welcome-screen:not([hidden])'))`);

  for (const viewport of viewports) {
    await setViewport(socket, viewport);
    await sleep(200);
    const welcome = await evaluate(socket, inspectWelcomeExpression);
    await screenshot(socket, `${viewport.name}-welcome.png`);
    report.viewports.push({ viewport, welcome, picker: null });
  }

  await evaluate(socket, `document.getElementById('welcome-new')?.click()`);
  await waitFor(
    socket,
    `Boolean(document.querySelector('#welcome-biome-picker:not([hidden])'))`,
    10_000,
  );
  for (const entry of report.viewports) {
    await setViewport(socket, entry.viewport);
    await sleep(200);
    entry.picker = await evaluate(socket, inspectPickerExpression);
    await screenshot(socket, `${entry.viewport.name}-biomes.png`);
  }
} catch (error) {
  report.errors.push(error instanceof Error ? error.message : String(error));
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  chrome.kill();
  await rm(profile, { force: true, recursive: true }).catch(() => {});
}

report.finishedAt = new Date().toISOString();
report.pass =
  report.errors.length === 0 &&
  report.viewports.length === viewports.length &&
  report.viewports.every(
    ({ welcome, picker }) =>
      welcome.overflowX <= 1 &&
      welcome.unlabeled.length === 0 &&
      welcome.actions.every((action) => action.visible && action.height >= 40) &&
      picker.overflowX <= 1 &&
      picker.options === 11,
  );

await writeFile(resolve(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
