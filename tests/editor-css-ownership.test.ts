import { describe, expect, test } from "bun:test";

const rootStylesUrl = new URL("../src/styles.css", import.meta.url);
const editorStylesUrl = new URL("../src/styles/editor.css", import.meta.url);
const mainUrl = new URL("../src/main.ts", import.meta.url);

describe("editor stylesheet ownership", () => {
  test("loads editor rules after the shared root stylesheet", async () => {
    const main = (await Bun.file(mainUrl).text()).replaceAll("\r\n", "\n");

    expect(main).toContain('import "./styles.css";\nimport "./styles/editor.css";');
  });

  test("keeps shared option primitives in root and mode-specific editor rules isolated", async () => {
    const [rootStyles, editorStyles] = await Promise.all([
      Bun.file(rootStylesUrl).text(),
      Bun.file(editorStylesUrl).text(),
    ]);

    for (const selector of [
      ".editor-fieldset",
      ".editor-workspace",
      ".editor-toolbar",
      ".editor-tabs",
      ".editor-surface",
      ".editor-readout",
      "#editor-map",
      "#dungeon-forge",
      "#forge-status",
      ".forge-play-btn",
      "#forge-apply",
      ".debug-panel",
      '[data-engine-mode="editor"]',
      '[data-engine-mode="debug"]',
      "@media (max-width: 1180px)",
      "@media (max-width: 760px), (pointer: coarse)",
      "@media (max-width: 430px)",
      "@media (prefers-reduced-motion: reduce)",
      "#forge-apply.forge-play-btn:focus-visible",
      '.app-shell[data-engine-mode="editor"] .generation-form label',
      '.app-shell[data-engine-mode="debug"] .generation-form label',
      ".record-panel[open] > .generation-form",
      "backdrop-filter: none",
    ]) {
      expect(editorStyles).toContain(selector);
    }

    for (const sharedSelector of [".record-panel", ".generation-form", ".record-actions"]) {
      expect(rootStyles).toContain(sharedSelector);
    }
    expect(rootStyles).toContain(".display-post-fx-layer");
    expect(editorStyles).not.toContain(".display-post-fx-lab");

    for (const selector of [
      /\.editor-(?:fieldset|workspace|toolbar|tabs|surface|readout)(?:\b|__)/,
      /#(?:editor-map|dungeon-forge|forge-status|forge-apply)\b/,
      /\.forge-play-btn(?:\b|__)/,
      /\.debug-panel\b/,
      /\[data-engine-mode="(?:editor|debug)"\]/,
      /@keyframes editor-status-pulse/,
    ]) {
      expect(rootStyles).not.toMatch(selector);
    }
  });
});
