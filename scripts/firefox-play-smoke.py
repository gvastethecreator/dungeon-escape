"""Full Firefox play-path smoke (profile -> biome -> play)."""

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


def snap(driver):
    return driver.execute_script(
        """
        const shell = document.querySelector('.app-shell');
        const welcome = document.getElementById('welcome-screen');
        const home = document.getElementById('welcome-home');
        const profile = document.getElementById('welcome-profile');
        const picker = document.getElementById('welcome-biome-picker');
        const status = document.getElementById('status');
        const fade = document.getElementById('scene-fade');
        const loader = document.getElementById('scene-loader');
        const canvas = document.getElementById('scene');
        const engine = window.__BLACK_FLAG_DUNGEON_ENGINE__;
        const diag = window.__THREE_GAME_DIAGNOSTICS__;
        let center = null;
        try {
          // Sample via 2d draw of webgl is hard; use renderer info + non-zero geometry
          const info = diag?.getRenderer?.() ?? null;
          center = info;
        } catch (e) { center = {error:String(e)}; }
        return {
          body: document.body.className,
          shellClass: shell?.className ?? null,
          shellData: shell ? {...shell.dataset} : null,
          welcomeHidden: welcome?.hidden ?? null,
          homeHidden: home?.hidden ?? null,
          profileHidden: profile?.hidden ?? null,
          pickerHidden: picker?.hidden ?? null,
          status: status?.textContent?.trim() ?? null,
          fadeHidden: fade?.hidden ?? null,
          loaderHidden: loader?.hidden ?? null,
          engineReady: engine?.ready ?? null,
          canvas: canvas ? {w:canvas.width,h:canvas.height,cw:canvas.clientWidth,ch:canvas.clientHeight} : null,
          renderer: center,
          errors: window.__FF_ERRORS__ || [],
          visibleButtons: [...document.querySelectorAll('button')].filter(b => b.offsetWidth||b.offsetHeight).map(b => ({
            id: b.id, text: (b.textContent||'').replace(/\\s+/g,' ').trim().slice(0,48)
          })).slice(0,20),
        };
        """
    )


def main() -> int:
    options = Options()
    options.binary_location = r"C:\Program Files\Mozilla Firefox\firefox.exe"
    options.set_preference("webgl.force-enabled", True)
    options.set_preference("webgl.disabled", False)
    service = Service(GeckoDriverManager().install())
    driver = webdriver.Firefox(service=service, options=options)
    driver.set_window_size(1280, 720)
    report: dict = {"url": URL, "steps": []}

    try:
        driver.get(URL)
        # clear storage for deterministic first-run then also support existing profile
        driver.execute_script(
            """
            window.__FF_ERRORS__ = [];
            window.addEventListener('error', e => window.__FF_ERRORS__.push({
              type:'error', msg:e.message, src:e.filename, line:e.lineno
            }));
            window.addEventListener('unhandledrejection', e => window.__FF_ERRORS__.push({
              type:'rejection', msg:String(e.reason && e.reason.stack || e.reason)
            }));
            """
        )
        WebDriverWait(driver, 30).until(
            lambda d: d.execute_script(
                "return document.getElementById('boot-screen')?.hidden === true"
            )
        )
        time.sleep(0.5)
        s0 = snap(driver)
        report["steps"].append({"name": "boot-done", "snap": s0})
        print("boot", s0.get("profileHidden"), s0.get("homeHidden"), s0.get("status"))
        driver.save_screenshot(str(OUT / "01-boot.png"))

        # Profile path or home path
        if s0.get("profileHidden") is False:
            name = driver.find_element(By.ID, "welcome-profile-name")
            name.clear()
            name.send_keys("FirefoxQA")
            submit = driver.find_element(By.ID, "welcome-profile-submit")
            print("click profile submit")
            submit.click()
            time.sleep(1.0)
        elif s0.get("homeHidden") is False:
            print("click welcome-new")
            driver.find_element(By.ID, "welcome-new").click()
            time.sleep(0.8)
        else:
            # try both
            for sel in ("#welcome-profile-submit", "#welcome-new"):
                els = driver.find_elements(By.CSS_SELECTOR, sel)
                if els and els[0].is_displayed():
                    print("click", sel)
                    els[0].click()
                    time.sleep(0.8)
                    break

        s1 = snap(driver)
        report["steps"].append({"name": "after-primary", "snap": s1})
        print("after primary", s1.get("pickerHidden"), s1.get("homeHidden"), s1.get("visibleButtons")[:8])
        driver.save_screenshot(str(OUT / "02-after-primary.png"))

        # Biome picker
        for i in range(40):
            s = snap(driver)
            if s.get("pickerHidden") is False:
                break
            # maybe already loading play
            if s.get("welcomeHidden") is True:
                break
            time.sleep(0.25)
        s2 = snap(driver)
        report["steps"].append({"name": "biome-or-load", "snap": s2})
        driver.save_screenshot(str(OUT / "03-biome.png"))

        if s2.get("pickerHidden") is False:
            # click first enabled biome button
            clicked = driver.execute_script(
                """
                const btns = [...document.querySelectorAll(
                  '#welcome-biome-picker button, .biome-picker-option, [data-biome-id], [data-biome]'
                )].filter(b => !b.disabled && (b.offsetWidth||b.offsetHeight));
                if (!btns.length) return {ok:false, count:0};
                btns[0].click();
                return {ok:true, id: btns[0].id, text: (btns[0].textContent||'').trim().slice(0,40), count: btns.length};
                """
            )
            print("biome click", clicked)
            report["biomeClick"] = clicked
            time.sleep(0.5)

        # Wait for play / renderer ready
        play = None
        for i in range(100):
            play = snap(driver)
            if i % 5 == 0:
                print(
                    f"play t={i*0.4:.1f}s ready={play.get('shellData',{}).get('rendererReady')} "
                    f"welcome={play.get('welcomeHidden')} status={play.get('status')} "
                    f"tri={((play.get('renderer') or {}).get('triangles'))} "
                    f"err={len(play.get('errors') or [])}"
                )
            ready = (play.get("shellData") or {}).get("rendererReady")
            if ready in ("true", "error", "timeout") and play.get("welcomeHidden") is True:
                break
            if play.get("errors") and i > 30:
                # keep going a bit
                pass
            time.sleep(0.4)

        report["steps"].append({"name": "play", "snap": play})
        driver.save_screenshot(str(OUT / "04-play.png"))

        # Sample a few frames of renderer stats
        samples = []
        for _ in range(10):
            samples.append(
                driver.execute_script(
                    """
                    const diag = window.__THREE_GAME_DIAGNOSTICS__;
                    const shell = document.querySelector('.app-shell');
                    return {
                      t: performance.now(),
                      renderer: diag?.getRenderer?.() ?? null,
                      rendererReady: shell?.dataset?.rendererReady ?? null,
                      ready: shell?.dataset?.ready ?? null,
                      mode: shell?.dataset?.mode ?? null,
                      errors: (window.__FF_ERRORS__||[]).length,
                    };
                    """
                )
            )
            time.sleep(0.2)
        report["frameSamples"] = samples
        report["pageErrors"] = driver.execute_script("return window.__FF_ERRORS__ || []")

        # Try WASD frame to ensure loop continues
        driver.execute_script(
            """
            const c = document.getElementById('scene');
            c?.focus();
            """
        )
        from selenium.webdriver.common.action_chains import ActionChains
        from selenium.webdriver.common.keys import Keys

        actions = ActionChains(driver)
        actions.send_keys("w").pause(0.5).send_keys("w").perform()
        time.sleep(1.0)
        report["afterMove"] = snap(driver)
        driver.save_screenshot(str(OUT / "05-after-move.png"))

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
        path = OUT / "play-report.json"
        path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print("WROTE", path)
        # compact summary
        play = None
        for step in report.get("steps", []):
            if step.get("name") == "play":
                play = step.get("snap")
        summary = {
            "fatal": report.get("fatal"),
            "errors": report.get("pageErrors"),
            "rendererReady": (play or {}).get("shellData", {}).get("rendererReady") if play else None,
            "status": (play or {}).get("status") if play else None,
            "welcomeHidden": (play or {}).get("welcomeHidden") if play else None,
            "triangles": ((play or {}).get("renderer") or {}).get("triangles") if play else None,
            "programs": ((play or {}).get("renderer") or {}).get("programs") if play else None,
            "fps": ((play or {}).get("renderer") or {}).get("fps") if play else None,
        }
        print("SUMMARY", json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
