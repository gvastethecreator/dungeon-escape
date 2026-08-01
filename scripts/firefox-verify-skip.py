"""Fast Firefox play verification using skipRunIntro."""

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
URL = "http://127.0.0.1:24211/?skipRunIntro=1"


def main() -> int:
    options = Options()
    options.binary_location = r"C:\Program Files\Mozilla Firefox\firefox.exe"
    options.set_preference("webgl.force-enabled", True)
    driver = webdriver.Firefox(service=Service(GeckoDriverManager().install()), options=options)
    driver.set_window_size(1280, 720)
    try:
        driver.get(URL)
        driver.execute_script(
            """
            localStorage.clear();
            sessionStorage.clear();
            window.__FF_ERRORS__ = [];
            window.addEventListener('error', e => window.__FF_ERRORS__.push(e.message));
            """
        )
        driver.get(URL)
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
        for i in range(80):
            last = driver.execute_script(
                """
                const shell = document.querySelector('.app-shell');
                const diag = window.__THREE_GAME_DIAGNOSTICS__;
                return {
                  data: {...(shell?.dataset || {})},
                  welcomeHidden: document.getElementById('welcome-screen')?.hidden,
                  status: document.getElementById('status')?.textContent?.trim(),
                  renderer: diag?.getRenderer?.() || null,
                  errors: window.__FF_ERRORS__ || [],
                };
                """
            )
            if i % 5 == 0:
                print(
                    i,
                    last["data"].get("rendererReady"),
                    last["data"].get("engineMode"),
                    last["data"].get("runIntroInputGate"),
                    (last.get("renderer") or {}).get("triangles"),
                    (last.get("errors") or [])[:1],
                    last.get("status"),
                )
            if (
                last["data"].get("engineMode") == "play"
                and last["data"].get("rendererReady") == "true"
                and ((last.get("renderer") or {}).get("triangles") or 0) > 1000
                and last["data"].get("runIntroInputGate") != "true"
            ):
                time.sleep(0.5)
                last = driver.execute_script(
                    """
                    const shell = document.querySelector('.app-shell');
                    const diag = window.__THREE_GAME_DIAGNOSTICS__;
                    return {
                      data: {...(shell?.dataset || {})},
                      welcomeHidden: document.getElementById('welcome-screen')?.hidden,
                      status: document.getElementById('status')?.textContent?.trim(),
                      renderer: diag?.getRenderer?.() || null,
                      errors: window.__FF_ERRORS__ || [],
                    };
                    """
                )
                break
            time.sleep(0.4)

        driver.save_screenshot(str(OUT / "fix-05-skip-intro.png"))
        errors = last.get("errors") or []
        summary = {
            "engineMode": last["data"].get("engineMode"),
            "rendererReady": last["data"].get("rendererReady"),
            "runIntroInputGate": last["data"].get("runIntroInputGate"),
            "tri": (last.get("renderer") or {}).get("triangles"),
            "calls": (last.get("renderer") or {}).get("calls"),
            "status": last.get("status"),
            "errors": errors[:5],
            "errorCount": len(errors),
        }
        print("FINAL", json.dumps(summary, indent=2))
        (OUT / "skip-report.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
        ok = (
            last["data"].get("engineMode") == "play"
            and ((last.get("renderer") or {}).get("triangles") or 0) > 1000
            and not any("positionX" in (e or "") for e in errors)
            and last["data"].get("runIntroInputGate") != "true"
        )
        print("OK" if ok else "FAIL")
        return 0 if ok else 1
    finally:
        driver.quit()


if __name__ == "__main__":
    raise SystemExit(main())
