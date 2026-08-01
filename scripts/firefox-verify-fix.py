"""Verify Firefox play path against a local or production URL after the audio fix."""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.firefox import GeckoDriverManager

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:24211/"
OUT = Path(".scratch/firefox-smoke")
OUT.mkdir(parents=True, exist_ok=True)


def main() -> int:
    options = Options()
    options.binary_location = r"C:\Program Files\Mozilla Firefox\firefox.exe"
    options.set_preference("webgl.force-enabled", True)
    driver = webdriver.Firefox(service=Service(GeckoDriverManager().install()), options=options)
    driver.set_window_size(1280, 720)
    report: dict = {"url": URL}

    def snap() -> dict:
        return driver.execute_script(
            """
            window.__FF_ERRORS__ = window.__FF_ERRORS__ || [];
            const shell = document.querySelector('.app-shell');
            const welcome = document.getElementById('welcome-screen');
            const status = document.getElementById('status');
            const diag = window.__THREE_GAME_DIAGNOSTICS__;
            return {
              welcomeHidden: welcome?.hidden ?? null,
              profileHidden: document.getElementById('welcome-profile')?.hidden ?? null,
              homeHidden: document.getElementById('welcome-home')?.hidden ?? null,
              pickerHidden: document.getElementById('welcome-biome-picker')?.hidden ?? null,
              status: status?.textContent?.trim() ?? null,
              shellData: shell ? {...shell.dataset} : null,
              body: document.body.className,
              shellClass: shell?.className ?? null,
              renderer: diag?.getRenderer?.() ?? null,
              errors: (window.__FF_ERRORS__||[]).slice(-20),
              errorCount: (window.__FF_ERRORS__||[]).length,
              uniqueErrors: [...new Set((window.__FF_ERRORS__||[]).map(e => e.msg))].slice(0,10),
            };
            """
        )

    try:
        driver.get(URL)
        driver.execute_script(
            """
            window.__FF_ERRORS__ = [];
            window.addEventListener('error', e => window.__FF_ERRORS__.push({
              type:'error', msg:e.message, src:e.filename, line:e.lineno
            }));
            window.addEventListener('unhandledrejection', e => window.__FF_ERRORS__.push({
              type:'rejection', msg:String(e.reason && e.reason.stack || e.reason)
            }));
            try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
            """
        )
        driver.get(URL)
        WebDriverWait(driver, 30).until(
            lambda d: d.execute_script(
                "return document.getElementById('boot-screen')?.hidden === true"
            )
        )
        time.sleep(0.8)
        s0 = snap()
        report["boot"] = s0
        print(
            "boot",
            json.dumps(
                {k: s0[k] for k in ["profileHidden", "homeHidden", "errorCount", "uniqueErrors", "status"]},
                ensure_ascii=False,
            ),
        )
        driver.save_screenshot(str(OUT / "fix-01-boot.png"))

        if s0.get("profileHidden") is False:
            name = driver.find_element(By.ID, "welcome-profile-name")
            name.clear()
            name.send_keys("FirefoxQA")
            driver.find_element(By.ID, "welcome-profile-submit").click()
        elif s0.get("homeHidden") is False:
            driver.find_element(By.ID, "welcome-new").click()
        time.sleep(1.0)
        s1 = snap()
        report["afterPrimary"] = s1
        print(
            "afterPrimary",
            json.dumps(
                {
                    k: s1[k]
                    for k in ["pickerHidden", "homeHidden", "errorCount", "uniqueErrors", "status"]
                },
                ensure_ascii=False,
            ),
        )
        driver.save_screenshot(str(OUT / "fix-02-primary.png"))

        clicked = driver.execute_script(
            """
            const btns = [...document.querySelectorAll('#welcome-biome-picker button, .biome-picker-option')];
            const ancient = btns.find(b => /ancient/i.test(b.textContent||'') && !b.disabled && (b.offsetWidth||b.offsetHeight));
            if (!ancient) return {ok:false, texts: btns.map(b => (b.textContent||'').replace(/\\s+/g,' ').trim()).slice(0,12)};
            ancient.click();
            return {ok:true, text:(ancient.textContent||'').replace(/\\s+/g,' ').trim()};
            """
        )
        report["biomeClick"] = clicked
        print("biome", clicked)

        play = None
        for i in range(90):
            play = snap()
            if i % 5 == 0:
                ready = (play.get("shellData") or {}).get("rendererReady")
                tri = (play.get("renderer") or {}).get("triangles")
                print(
                    f"t={i * 0.4:.1f} ready={ready} welcome={play.get('welcomeHidden')} "
                    f"tri={tri} err={play.get('errorCount')} status={play.get('status')}"
                )
            ready = (play.get("shellData") or {}).get("rendererReady")
            if ready in ("true", "error", "timeout") and play.get("welcomeHidden") is True:
                break
            if play.get("uniqueErrors") and any(
                "positionX" in (m or "") for m in play["uniqueErrors"]
            ):
                if i > 10:
                    break
            time.sleep(0.4)

        report["play"] = play
        driver.save_screenshot(str(OUT / "fix-03-play.png"))
        print("FINAL unique errors", play.get("uniqueErrors") if play else None)
        print(
            "FINAL rendererReady",
            (play.get("shellData") or {}).get("rendererReady") if play else None,
        )
        print("FINAL triangles", (play.get("renderer") or {}).get("triangles") if play else None)
        print("FINAL fps", (play.get("renderer") or {}).get("fps") if play else None)
        print("FINAL status", play.get("status") if play else None)
        print("FINAL welcomeHidden", play.get("welcomeHidden") if play else None)

        position_x_errors = [
            e
            for e in (play.get("uniqueErrors") or [])
            if e and "positionX" in e
        ]
        ok = (
            play is not None
            and play.get("welcomeHidden") is True
            and (play.get("shellData") or {}).get("rendererReady") in ("true", "timeout")
            and ((play.get("renderer") or {}).get("triangles") or 0) > 0
            and not position_x_errors
        )
        report["ok"] = ok
        print("OK" if ok else "FAIL")
        return 0 if ok else 1
    finally:
        (OUT / "fix-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print("WROTE", OUT / "fix-report.json")
        try:
            driver.quit()
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
