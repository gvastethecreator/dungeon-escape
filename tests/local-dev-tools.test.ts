import { describe, expect, test } from "bun:test";

import {
  isLocalDevToolsEnabled,
  isLocalHostname,
  readLocalDevToolsEnv,
} from "../src/game/LocalDevTools";

describe("local developer tools gate", () => {
  test("allows Vite dev regardless of hostname", () => {
    expect(isLocalDevToolsEnabled({ viteDev: true, hostname: "dungeon-escape.example" })).toBe(
      true,
    );
    expect(isLocalDevToolsEnabled({ viteDev: true, hostname: "localhost" })).toBe(true);
  });

  test("allows local hosts for production builds used on this machine", () => {
    expect(isLocalDevToolsEnabled({ viteDev: false, hostname: "localhost" })).toBe(true);
    expect(isLocalDevToolsEnabled({ viteDev: false, hostname: "127.0.0.1" })).toBe(true);
    expect(isLocalDevToolsEnabled({ viteDev: false, hostname: "[::1]" })).toBe(true);
  });

  test("blocks deployed public hosts", () => {
    expect(isLocalDevToolsEnabled({ viteDev: false, hostname: "dungeon-escape.pages.dev" })).toBe(
      false,
    );
    expect(isLocalDevToolsEnabled({ viteDev: false, hostname: "example.com" })).toBe(false);
    expect(isLocalDevToolsEnabled({ viteDev: false, hostname: "" })).toBe(false);
  });

  test("classifies loopback hostnames", () => {
    expect(isLocalHostname("LOCALHOST")).toBe(true);
    expect(isLocalHostname(" 127.0.0.1 ")).toBe(true);
    expect(isLocalHostname("play.example")).toBe(false);
  });

  test("readLocalDevToolsEnv mirrors the given vite flag and host", () => {
    expect(readLocalDevToolsEnv(false, "example.com")).toEqual({
      viteDev: false,
      hostname: "example.com",
    });
  });
});
