"""Wait for Firefox play scene to draw after intro."""

from __future__ import annotations

import json
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.firefox import GeckoDriverManager

OUT = Path(".scratch/firefox-smoke")
OUT.mkdir(parents=True, exist_ok=True)


def main() -> int:
    options = Options()
    options.binary_location = r"C:\Program Files\Mozilla Firefox\firefox.exe"
    options.set_preference("webgl.force-enabled", True)
    driver = webdriver.Firefox(service=Service(GeckoDriverManager().install()), options=options)
    driver.set_window_size(1280, 720)
    try:
        driver.get("http://127.0.0.1:24211/")
        driver.execute_script(
            """
            localStorage.clear();
            sessionStorage.clear();
            window.__FF_ERRORS__ = [];
            window.addEventListener('error', e => window.__FF_ERRORS__.push(e.message));
            """
        )
        driver.get("http://127.0.0.1:24211/")
        WebDriverWait(driver, 30).until(
            lambda d: d.execute_script(
                "return document.getElementById('boot-screen')?.hidden === true"
            )
        )
        time.sleep(0.5)
        if driver.execute_script(
            "return document.getElementById('welcome-profile')?.hidden === false"
        ):
            el = driver.find_element(By.ID, "welcome-profile-name")
            el.clear()
            el.send_keys("FirefoxQA")
            driver.find_element(By.ID, "welcome-profile-submit").click()
        else:
            driver.find_element(By.ID, "welcome-new").click()
        time.sleep(0.8)
        driver.execute_script(
            """
            const b = [...document.querySelectorAll('#welcome-biome-picker button')]
              .find(x => /ancient/i.test(x.textContent) && !x.disabled);
            b && b.click();
            """
        )

        last = None
        for i in range(120):
            last = driver.execute_script(
                """
                const shell = document.querySelector('.app-shell');
                const fade = document.getElementById('scene-fade');
                const canvas = document.getElementById('scene');
                const diag = window.__THREE_GAME_DIAGNOSTICS__;
                const r = diag?.getRenderer?.() || null;
                let pixel = null;
                try {
                  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
                  if (gl) {
                    const buf = new Uint8Array(4);
                    gl.readPixels((canvas.width/2)|0, (canvas.height/2)|0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
                    pixel = Array.from(buf);
                  }
                } catch (e) { pixel = {err: String(e)}; }
                return {
                  data: {...(shell?.dataset || {})},
                  fadeHidden: fade?.hidden,
                  fadeClass: fade?.className,
                  welcomeHidden: document.getElementById('welcome-screen')?.hidden,
                  status: document.getElementById('status')?.textContent?.trim(),
                  renderer: r,
                  pixel,
                  errors: window.__FF_ERRORS__ || [],
                };
                """
            )
            if i % 6 == 0:
                print(
                    i,
                    "intro",
                    last["data"].get("runIntro"),
                    "ready",
                    last["data"].get("rendererReady"),
                    "calls",
                    (last.get("renderer") or {}).get("calls"),
                    "tri",
                    (last.get("renderer") or {}).get("triangles"),
                    "pixel",
                    last.get("pixel"),
                    "fade",
                    last.get("fadeHidden"),
                    "mode",
                    last["data"].get("engineMode"),
                    last["data"].get("mode"),
                )
            if (
                last["data"].get("runIntro") in (None, "false", False, "")
                and last["data"].get("rendererReady") == "true"
                and ((last.get("renderer") or {}).get("triangles") or 0) > 100
            ):
                break
            time.sleep(0.5)

        (OUT / "long-wait.json").write_text(json.dumps(last, indent=2), encoding="utf-8")
        driver.save_screenshot(str(OUT / "fix-04-long.png"))
        print(
            "FINAL",
            json.dumps(
                {
                    "runIntro": last["data"].get("runIntro"),
                    "rendererReady": last["data"].get("rendererReady"),
                    "engineMode": last["data"].get("engineMode"),
                    "mode": last["data"].get("mode"),
                    "paused": last["data"].get("paused"),
                    "calls": (last.get("renderer") or {}).get("calls"),
                    "tri": (last.get("renderer") or {}).get("triangles"),
                    "programs": (last.get("renderer") or {}).get("programs"),
                    "geometries": (last.get("renderer") or {}).get("geometries"),
                    "pixel": last.get("pixel"),
                    "fadeHidden": last.get("fadeHidden"),
                    "status": last.get("status"),
                    "errors": (last.get("errors") or [])[:8],
                },
                indent=2,
            ),
        )
        return 0
    finally:
        driver.quit()


if __name__ == "__main__":
    raise SystemExit(main())
