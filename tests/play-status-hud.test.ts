import { describe, expect, test } from "bun:test";

import { PlayStatusHud } from "../src/ui/PlayStatusHud";

function fakeElement(): HTMLElement {
  const dataset: Record<string, string> = {};
  const attrs = new Map<string, string>();
  return {
    hidden: true,
    dataset,
    textContent: "",
    dateTime: "",
    toggleAttribute(name: string, force?: boolean) {
      if (force === false) attrs.delete(name);
      else attrs.set(name, "");
    },
    removeAttribute(name: string) {
      attrs.delete(name);
    },
    setAttribute(name: string, value: string) {
      attrs.set(name, value);
    },
    getAttribute(name: string) {
      return attrs.get(name) ?? null;
    },
  } as unknown as HTMLElement;
}

function fakeChip() {
  return { root: fakeElement(), value: fakeElement() as HTMLElement & { dateTime?: string } };
}

describe("PlayStatusHud", () => {
  test("sync writes timed chips and phoenix/swarm datasets", () => {
    const shell = fakeElement();
    const swarmRoot = fakeElement();
    const phoenixRoot = fakeElement();
    let fogPulse = 0;
    const hud = new PlayStatusHud({
      shell,
      timeFreeze: fakeChip(),
      luminousWard: fakeChip(),
      annihilationPulse: fakeChip(),
      cullBrand: fakeChip(),
      shotgun: fakeChip(),
      fogClear: fakeChip(),
      mobility: fakeChip(),
      handTorch: fakeChip(),
      slowCurse: fakeChip(),
      frenzyCurse: fakeChip(),
      gloomCurse: fakeChip(),
      mirrorCurse: fakeChip(),
      spinCurse: fakeChip(),
      swarmRoot,
      phoenixRoot,
      onFogClearActive: (active) => {
        fogPulse = active ? 1 : 0;
      },
    });

    hud.sync({
      timeFreeze: 8.2,
      fogClear: 3,
      phoenixCharges: 1,
      shotgunShells: 5,
      swarm: true,
      slow: 4,
    });

    expect(shell.dataset.timeFreeze).toBe("true");
    expect(shell.dataset.phoenix).toBe("true");
    expect(shell.dataset.shotgun).toBe("true");
    expect(shell.dataset.swarmCurse).toBe("true");
    expect(phoenixRoot.hidden).toBe(false);
    expect(swarmRoot.hidden).toBe(false);
    expect(fogPulse).toBe(1);

    hud.sync({ shotgunShells: 0, shotgunPumpRemaining: 0.4 });
    expect(shell.dataset.shotgun).toBe("true");

    hud.reset();
    expect(shell.dataset.phoenix).toBe("false");
    expect(shell.dataset.swarmCurse).toBe("false");
    expect(shell.dataset.shotgun).toBe("false");
    expect(fogPulse).toBe(0);
  });
});
