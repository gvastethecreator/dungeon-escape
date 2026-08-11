/**
 * Browser repro smoke for production/local.
 * Usage: bun run scripts/firefox-smoke.mjs [url] [firefox|chromium]
 */
import { chromium, firefox } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const url = process.argv[2] ?? "https://dungeon.gvaste.ar/";
const engineName = (process.argv[3] ?? "firefox").toLowerCase();
const outDir = path.resolve(`.scratch/${engineName}-smoke`);
await mkdir(outDir, { recursive: true });

const launcher = engineName === "chromium" ? chromium : firefox;
const logs = [];
const pageErrors = [];
const requestFails = [];

const headed = process.env.HEADED === "1";
const launchOptions = {
  headless: !headed,
  timeout: 45_000,
};
if (engineName === "firefox") {
  // Prefer Playwright's Firefox build (juggler protocol). System Firefox
  // headless often dies on SWGL framebuffer mapping on this host.
  launchOptions.firefoxUserPrefs = {
    "webgl.force-enabled": true,
    "webgl.disabled": false,
    "webgl.msaa-force": true,
    "layers.acceleration.force-enabled": true,
    "gfx.webrender.all": true,
    "media.webspeech.synth.enabled": false,
    "dom.webnotifications.enabled": false,
  };
  console.log(`[smoke] Playwright Firefox prefs (webgl forced), headed=${headed}`);
}
console.log(`[smoke] launch ${engineName}`);
const browser = await launcher.launch(launchOptions);
console.log(`[smoke] browser up`);
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

page.on("console", (msg) => {
  const entry = { type: msg.type(), text: msg.text() };
  logs.push(entry);
  if (entry.type === "error" || entry.type === "warning") {
    console.log(`[console:${entry.type}] ${entry.text.slice(0, 300)}`);
  }
});
page.on("pageerror", (err) => {
  pageErrors.push({ message: err.message, stack: err.stack });
  console.log(`[pageerror] ${err.message}`);
});
page.on("requestfailed", (req) => {
  requestFails.push({ url: req.url(), error: req.failure()?.errorText ?? "unknown" });
});

const started = Date.now();
console.log(`[smoke] goto ${url}`);
const gotoResult = await page
  .goto(url, { waitUntil: "commit", timeout: 90_000 })
  .then((r) => ({ ok: true, status: r?.status() }))
  .catch((error) => ({ ok: false, error: String(error) }));
console.log(`[smoke] goto result`, gotoResult);

// Poll for engine or boot end for up to 30s
let snapshot = null;
for (let i = 0; i < 60; i++) {
  try {
    snapshot = await page.evaluate(() => {
      const boot = document.getElementById("boot-screen");
      const welcome = document.getElementById("welcome-screen");
      const status = document.getElementById("status");
      const shell = document.querySelector(".app-shell");
      const canvas = document.getElementById("scene");
      const engine = window.__BLACK_FLAG_DUNGEON_ENGINE__;
      const diag = window.__THREE_GAME_DIAGNOSTICS__;
      let rendererInfo = null;
      try {
        rendererInfo = diag?.getRenderer?.() ?? null;
      } catch (e) {
        rendererInfo = { error: String(e) };
      }
      return {
        bodyClasses: [...document.body.classList],
        bootHidden: boot?.hidden ?? null,
        bootText: (boot?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 200),
        welcomeHidden: welcome?.hidden ?? null,
        status: status?.textContent?.trim() ?? null,
        rendererReady: shell?.dataset?.rendererReady ?? null,
        engineReady: engine?.ready ?? null,
        canvas: canvas
          ? {
              width: canvas.width,
              height: canvas.height,
              clientW: canvas.clientWidth,
              clientH: canvas.clientHeight,
            }
          : null,
        rendererInfo,
        scripts: [...document.scripts]
          .map((s) => s.src)
          .filter(Boolean)
          .slice(0, 12),
      };
    });
  } catch (error) {
    console.log(`[smoke] evaluate failed @${i}: ${error}`);
    await page.waitForTimeout(500);
    continue;
  }

  if (i % 4 === 0) {
    console.log(
      `[smoke] t=${Date.now() - started}ms ready=${snapshot?.rendererReady} engine=${snapshot?.engineReady} bootHidden=${snapshot?.bootHidden} status=${snapshot?.status}`,
    );
  }

  if (
    snapshot?.engineReady === true ||
    snapshot?.rendererReady === "true" ||
    snapshot?.rendererReady === "error"
  ) {
    break;
  }
  if (snapshot?.bootHidden === true && Date.now() - started > 5_000) break;
  await page.waitForTimeout(500);
}

// Measure frame cost while on welcome (rAF still runs)
let frameStats = null;
try {
  frameStats = await page.evaluate(async () => {
    const samples = [];
    let last = performance.now();
    await new Promise((resolve) => {
      let n = 0;
      function tick(now) {
        samples.push(now - last);
        last = now;
        n += 1;
        if (n >= 45) resolve();
        else requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    return {
      count: samples.length,
      avgMs: avg,
      maxMs: Math.max(...samples),
      p95Ms: samples.slice().sort((a, b) => a - b)[Math.floor(samples.length * 0.95)],
    };
  });
  console.log(`[smoke] frameStats`, frameStats);
} catch (error) {
  frameStats = { error: String(error) };
  console.log(`[smoke] frameStats failed`, error);
}

// Click New Game and first biome if possible
let playStats = null;
try {
  const canClick = await page
    .locator("#welcome-new")
    .isVisible({ timeout: 2_000 })
    .catch(() => false);
  if (canClick) {
    console.log(`[smoke] click New Game`);
    await page.click("#welcome-new");
    await page.waitForTimeout(800);
    const biomeBtn = page
      .locator("#welcome-biome-picker button, .biome-pick, [data-biome]")
      .first();
    if (await biomeBtn.count()) {
      console.log(`[smoke] click biome`);
      await biomeBtn.click({ timeout: 3_000 }).catch(() => {});
    }
    // wait for renderer ready up to 20s
    for (let i = 0; i < 40; i++) {
      const ready = await page.evaluate(
        () => document.querySelector(".app-shell")?.dataset?.rendererReady,
      );
      if (ready === "true" || ready === "error") {
        console.log(`[smoke] play rendererReady=${ready} after ${i * 500}ms`);
        break;
      }
      await page.waitForTimeout(500);
    }
    playStats = await page.evaluate(async () => {
      const samples = [];
      let last = performance.now();
      await new Promise((resolve) => {
        let n = 0;
        function tick(now) {
          samples.push(now - last);
          last = now;
          n += 1;
          if (n >= 60) resolve();
          else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      const diag = window.__THREE_GAME_DIAGNOSTICS__;
      const engine = window.__BLACK_FLAG_DUNGEON_ENGINE__;
      return {
        avgMs: avg,
        maxMs: Math.max(...samples),
        p95Ms: samples.slice().sort((a, b) => a - b)[Math.floor(samples.length * 0.95)],
        rendererReady: document.querySelector(".app-shell")?.dataset?.rendererReady ?? null,
        engineReady: engine?.ready ?? null,
        status: document.getElementById("status")?.textContent?.trim() ?? null,
        renderer: diag?.getRenderer?.() ?? null,
      };
    });
    console.log(`[smoke] playStats`, playStats);
  } else {
    console.log(`[smoke] welcome-new not visible`);
  }
} catch (error) {
  playStats = { error: String(error) };
  console.log(`[smoke] play path failed`, error);
}

const screenshotPath = path.join(outDir, "shot.png");
await page
  .screenshot({ path: screenshotPath, fullPage: false })
  .catch((e) => console.log("shot fail", e));

const report = {
  engineName,
  url,
  elapsedMs: Date.now() - started,
  gotoResult,
  snapshot,
  frameStats,
  playStats,
  pageErrors,
  requestFails: requestFails.slice(0, 30),
  consoleErrors: logs.filter((l) => l.type === "error"),
  consoleWarnings: logs.filter((l) => l.type === "warning").slice(0, 30),
  screenshotPath,
};

const reportPath = path.join(outDir, "report.json");
await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(`[smoke] wrote ${reportPath}`);
console.log(JSON.stringify(report, null, 2));
await browser.close();
process.exit(0);
