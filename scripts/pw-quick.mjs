import { chromium, firefox } from "playwright";

const engine = process.argv[2] || "chromium";
const url = process.argv[3] || "https://dungeon.gvaste.ar/";
console.log("engine", engine, "url", url);

const launcher = engine === "firefox" ? firefox : chromium;
const t0 = Date.now();
const browser = await launcher.launch({
  headless: true,
  timeout: 20_000,
  ...(engine === "firefox"
    ? {
        firefoxUserPrefs: {
          "webgl.force-enabled": true,
          "webgl.disabled": false,
          "layers.acceleration.force-enabled": true,
        },
      }
    : {}),
});
console.log("launched", Date.now() - t0);

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => {
  errors.push(e.message);
  console.log("PAGEERROR", e.message);
});
page.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 300));
});

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
console.log("domcontentloaded", Date.now() - t0);

for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(500);
  const snap = await page.evaluate(() => {
    const shell = document.querySelector(".app-shell");
    return {
      rendererReady: shell?.dataset?.rendererReady ?? null,
      status: document.getElementById("status")?.textContent?.trim() ?? null,
      bootHidden: document.getElementById("boot-screen")?.hidden ?? null,
      body: [...document.body.classList],
      engineReady: window.__BLACK_FLAG_DUNGEON_ENGINE__?.ready ?? null,
      canvas: (() => {
        const c = document.getElementById("scene");
        return c ? { w: c.width, h: c.height } : null;
      })(),
    };
  });
  console.log(`t+${Date.now() - t0}`, JSON.stringify(snap));
  if (snap.bootHidden === true || snap.rendererReady === "true" || snap.rendererReady === "error") break;
}

// frame cost sample
const frames = await page.evaluate(async () => {
  const samples = [];
  let last = performance.now();
  await new Promise((resolve) => {
    let n = 0;
    const tick = (now) => {
      samples.push(now - last);
      last = now;
      if (++n >= 40) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  samples.sort((a, b) => a - b);
  return {
    avg: samples.reduce((a, b) => a + b, 0) / samples.length,
    p95: samples[Math.floor(samples.length * 0.95)],
    max: samples[samples.length - 1],
  };
});
console.log("frames", frames);
console.log("errors", errors);
await browser.close();
console.log("done", Date.now() - t0);
