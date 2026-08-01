import { describe, expect, test } from "bun:test";

import { shouldLoadDungeonRuntime } from "../src/shellRoute";

describe("deferred Welcome shell", () => {
  test("loads the engine only for explicit runtime audit URLs", () => {
    expect(shouldLoadDungeonRuntime("")).toBe(false);
    expect(shouldLoadDungeonRuntime("?mode=play&seed=demo")).toBe(false);
    expect(shouldLoadDungeonRuntime("?perfAudit=1&qaState=critical")).toBe(true);
    expect(shouldLoadDungeonRuntime("?runtime=1")).toBe(true);
  });

  test("index boots the shell and the shell owns the dynamic engine boundary", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    const shell = await Bun.file(new URL("../src/shell.ts", import.meta.url)).text();
    expect(host).toContain('src="/src/shell.ts"');
    expect(host).not.toContain('src="/src/main.ts"');
    expect(shell).toContain('await import("./main")');
    expect(shell).not.toContain('from "three"');
    expect(shell).not.toContain("WebGLRenderer");
  });
});
