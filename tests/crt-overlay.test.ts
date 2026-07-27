import { describe, expect, test } from "bun:test";

const readProjectFile = (path: string): Promise<string> =>
  Bun.file(new URL(`../${path}`, import.meta.url)).text();

describe("minimal full-shell CRT", () => {
  test("keeps one pointer-transparent effect above every app surface", async () => {
    const [host, css] = await Promise.all([
      readProjectFile("index.html"),
      readProjectFile("src/styles.css"),
    ]);

    expect(host.match(/class="crt-overlay"/g)).toHaveLength(1);
    expect(host).toContain('<div class="crt-overlay" aria-hidden="true"></div>');
    expect(css).toMatch(/\.crt-overlay\s*\{[^}]*z-index:\s*100;/s);
    expect(css).toMatch(/\.crt-overlay\s*\{[^}]*pointer-events:\s*none;/s);
    expect(css).toMatch(/\.crt-overlay\s*\{[^}]*radial-gradient/s);
  });

  test("adds restrained full-shell phosphor glow and decay", async () => {
    const [host, css] = await Promise.all([
      readProjectFile("index.html"),
      readProjectFile("src/styles.css"),
    ]);

    expect(host).toContain('id="crt-phosphor"');
    expect(host).toContain('stdDeviation="0.78"');
    expect(host).toContain('stdDeviation="0.32 1.1"');
    expect(host).toContain('result="phosphor-decay"');
    expect(host).toContain('mode="screen"');
    expect(css).toMatch(/\.app-shell:not\(\.crt-off\)\s*\{[^}]*filter:\s*url\("#crt-phosphor"\);/s);
  });

  test("keeps scanlines and noise without an RGB grille mask", async () => {
    const css = await readProjectFile("src/styles.css");

    expect(css).toMatch(/\.crt-overlay::before\s*\{[^}]*repeating-linear-gradient/s);
    expect(css).toMatch(/\.crt-overlay::before\s*\{[^}]*mix-blend-mode:\s*multiply;/s);
    expect(css).not.toContain(".crt-overlay::after");
    expect(css).not.toContain("rgb(255 72 72 / 1.4%)");
    expect(css).not.toContain("rgb(82 255 154 / 0.9%)");
    expect(css).not.toContain("rgb(96 142 255 / 1.4%)");
    expect(css).toContain('url("/assets/ui/crt-noise.svg")');
    expect(css).toMatch(/@keyframes\s+crt-noise-shift/);
    expect(css).toMatch(/@keyframes\s+crt-jitter/);
    expect(css).toMatch(/translate3d\(0\.24px, 0, 0\)/);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.crt-overlay\s*\{\s*animation: none;/,
    );
  });

  test("the display control disables the whole effect and reports its state", async () => {
    const [host, main, css] = await Promise.all([
      readProjectFile("index.html"),
      readProjectFile("src/main.ts"),
      readProjectFile("src/styles.css"),
    ]);

    expect(host).toContain('id="crt-toggle"');
    expect(host).toContain('aria-pressed="true"');
    expect(host).toContain('title="Toggle CRT"');
    expect(main).toContain('elements.shell.classList.toggle("crt-off", !crtEnabled)');
    expect(main).toContain('setStatus(crtEnabled ? "CRT on." : "CRT off.")');
    expect(css).toMatch(/\.app-shell\.crt-off \.crt-overlay\s*\{[^}]*display:\s*none;/s);
  });
});
