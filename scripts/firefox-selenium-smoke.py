"""Headed Firefox smoke via Selenium (Playwright juggler is broken on this host)."""

from __future__ import annotations

import json
import time
import traceback
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.firefox import GeckoDriverManager

URL = "https://dungeon.gvaste.ar/"
OUT = Path(".scratch/firefox-smoke")
OUT.mkdir(parents=True, exist_ok=True)


def main() -> int:
    options = Options()
    options.binary_location = r"C:\Program Files\Mozilla Firefox\firefox.exe"
    options.set_preference("webgl.force-enabled", True)
    options.set_preference("webgl.disabled", False)
    options.set_preference("layers.acceleration.force-enabled", True)
    options.set_preference("gfx.webrender.all", True)
    options.set_preference("media.webspeech.synth.enabled", False)
    options.set_preference("dom.webnotifications.enabled", False)

    service = Service(GeckoDriverManager().install())
    print("starting firefox...")
    driver = webdriver.Firefox(service=service, options=options)
    driver.set_window_size(1280, 720)
    report: dict = {"url": URL, "logs": [], "errors": []}

    try:
        driver.get(URL)
        print("loaded", driver.title)

        # Early error trap
        driver.execute_script(
            """
            window.__FF_ERRORS__ = window.__FF_ERRORS__ || [];
            if (!window.__FF_TRAP__) {
              window.__FF_TRAP__ = true;
              window.addEventListener('error', e => window.__FF_ERRORS__.push({
                type: 'error', msg: e.message, src: e.filename, line: e.lineno, col: e.colno
              }));
              window.addEventListener('unhandledrejection', e => window.__FF_ERRORS__.push({
                type: 'rejection', msg: String(e.reason && e.reason.stack || e.reason)
              }));
            }
            """
        )

        deadline = time.time() + 45
        snapshot = None
        while time.time() < deadline:
            snapshot = driver.execute_script(
                """
                const boot = document.getElementById('boot-screen');
                const welcome = document.getElementById('welcome-screen');
                const status = document.getElementById('status');
                const shell = document.querySelector('.app-shell');
                const canvas = document.getElementById('scene');
                const engine = window.__BLACK_FLAG_DUNGEON_ENGINE__;
                const diag = window.__THREE_GAME_DIAGNOSTICS__;
                let rendererInfo = null;
                try { rendererInfo = diag?.getRenderer?.() ?? null; }
                catch (e) { rendererInfo = {error: String(e)}; }
                return {
                  title: document.title,
                  bodyClasses: [...document.body.classList],
                  bootHidden: boot?.hidden ?? null,
                  bootText: (boot?.innerText || '').replace(/\\s+/g,' ').trim().slice(0,240),
                  welcomeHidden: welcome?.hidden ?? null,
                  status: status?.textContent?.trim() ?? null,
                  rendererReady: shell?.dataset?.rendererReady ?? null,
                  renderPath: shell?.dataset?.renderPath ?? null,
                  engineReady: engine?.ready ?? null,
                  canvas: canvas ? {
                    width: canvas.width, height: canvas.height,
                    clientW: canvas.clientWidth, clientH: canvas.clientHeight
                  } : null,
                  webgl: (() => {
                    try {
                      const c = document.createElement('canvas');
                      const gl2 = c.getContext('webgl2');
                      const gl = gl2 || c.getContext('webgl');
                      if (!gl) return {ok:false};
                      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
                      return {
                        ok: true,
                        webgl2: !!gl2,
                        vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
                        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
                      };
                    } catch (e) { return {ok:false, error:String(e)}; }
                  })(),
                  rendererInfo,
                  scripts: [...document.scripts].map(s => s.src).filter(Boolean).slice(0,8),
                  errors: window.__FF_ERRORS__ || [],
                };
                """
            )
            brief = {
                k: snapshot.get(k)
                for k in [
                    "bootHidden",
                    "welcomeHidden",
                    "rendererReady",
                    "engineReady",
                    "status",
                    "bootText",
                ]
            }
            print("snap", json.dumps(brief, ensure_ascii=False))
            if snapshot.get("welcomeHidden") is False:
                break
            if snapshot.get("bootHidden") is True and time.time() > deadline - 30:
                break
            if snapshot.get("errors"):
                # Keep waiting a bit for recovery, but record
                pass
            time.sleep(0.5)

        report["snapshot"] = snapshot
        driver.save_screenshot(str(OUT / "welcome.png"))

        try:
            btn = WebDriverWait(driver, 8).until(lambda d: d.find_element(By.ID, "welcome-new"))
            if btn.is_displayed():
                print("click NEW GAME")
                btn.click()
                time.sleep(1.0)
                biomes = driver.find_elements(
                    By.CSS_SELECTOR,
                    "#welcome-biome-picker button, .biome-pick, [data-biome]",
                )
                print("biome buttons", len(biomes))
                if biomes:
                    biomes[0].click()
                play = None
                for i in range(80):
                    play = driver.execute_script(
                        """
                        const shell = document.querySelector('.app-shell');
                        const status = document.getElementById('status');
                        const welcome = document.getElementById('welcome-screen');
                        const engine = window.__BLACK_FLAG_DUNGEON_ENGINE__;
                        const canvas = document.getElementById('scene');
                        const diag = window.__THREE_GAME_DIAGNOSTICS__;
                        const fade = document.getElementById('scene-fade');
                        const loader = document.getElementById('scene-loader');
                        try {
                          return {
                            rendererReady: shell?.dataset?.rendererReady ?? null,
                            renderPath: shell?.dataset?.renderPath ?? null,
                            ready: shell?.dataset?.ready ?? null,
                            mode: shell?.dataset?.mode ?? null,
                            welcomeHidden: welcome?.hidden ?? null,
                            status: status?.textContent?.trim() ?? null,
                            engineReady: engine?.ready ?? null,
                            bodyClasses: [...document.body.classList],
                            fadeHidden: fade?.hidden ?? null,
                            loaderHidden: loader?.hidden ?? null,
                            canvas: canvas ? {w: canvas.width, h: canvas.height} : null,
                            errors: window.__FF_ERRORS__ || [],
                            renderer: diag?.getRenderer?.() ?? null,
                          };
                        } catch (e) {
                          return {error: String(e), errors: window.__FF_ERRORS__ || []};
                        }
                        """
                    )
                    if i % 4 == 0:
                        print(
                            "play",
                            play.get("rendererReady"),
                            play.get("status"),
                            play.get("welcomeHidden"),
                            play.get("fadeHidden"),
                        )
                    if play.get("rendererReady") in ("true", "error", "timeout"):
                        break
                    if play.get("errors") and i > 20:
                        break
                    time.sleep(0.5)
                report["play"] = play
                driver.save_screenshot(str(OUT / "play.png"))
            else:
                print("welcome-new not displayed")
                report["playError"] = "welcome-new not displayed"
        except Exception as exc:
            report["playError"] = str(exc)
            traceback.print_exc()

        report["pageErrors"] = driver.execute_script("return window.__FF_ERRORS__ || []")
        report["resources"] = driver.execute_script(
            """
            return performance.getEntriesByType('resource')
              .filter(e => e.name.includes('assets') || e.name.includes('.js') || e.name.includes('.css'))
              .slice(0, 50)
              .map(e => ({
                name: e.name.split('/').slice(-1)[0],
                duration: Math.round(e.duration),
                transferSize: e.transferSize,
                type: e.initiatorType
              }));
            """
        )
    except Exception as exc:
        report["fatal"] = str(exc)
        traceback.print_exc()
        try:
            driver.save_screenshot(str(OUT / "fatal.png"))
        except Exception:
            pass
    finally:
        try:
            driver.quit()
        except Exception:
            pass
        path = OUT / "report.json"
        path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print("WROTE", path)
        print(json.dumps(report, indent=2)[:5000])
    return 0 if not report.get("fatal") else 1


if __name__ == "__main__":
    raise SystemExit(main())
