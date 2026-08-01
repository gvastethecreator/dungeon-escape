import { describe, expect, test } from "bun:test";

import { ForgePresentationSession } from "../src/forge/ForgePresentationSession";

describe("ForgePresentationSession", () => {
  test("owns initial presentation mode until a correlated session starts", () => {
    const session = new ForgePresentationSession<object>(true);
    expect(session.isPresentationMode).toBe(true);
    expect(session.activePresentationId).toBeNull();

    session.start(1, { name: "editor" });
    expect(session.isPresentationMode).toBe(true);
    expect(session.activePresentationId).toBe(1);
  });

  test("publishes animation completion once per active presentation", () => {
    const session = new ForgePresentationSession<object>();
    session.start(4, null);

    expect(session.completeAnimation()).toBe(4);
    expect(session.completeAnimation()).toBeNull();

    session.start(5, { name: "presentation" });
    expect(session.completeAnimation()).toBe(5);
  });

  test("replacement preserves the original editor and ignores late completion", () => {
    const editor = { name: "editor" };
    const session = new ForgePresentationSession<object>();
    session.start(10, editor);
    session.start(11, { name: "first presentation" });

    expect(session.finish(10)).toEqual({ kind: "ignored" });
    expect(session.activePresentationId).toBe(11);
    expect(session.finish(11)).toEqual({ kind: "finished", editorDungeon: editor });
    expect(session.finish(11)).toEqual({ kind: "ignored" });
    expect(session.isPresentationMode).toBe(false);
  });

  test("preserves an intentionally empty editor across replacement", () => {
    const session = new ForgePresentationSession<object>();
    session.start(1, null);
    session.start(2, { name: "presentation" });

    expect(session.finish(2)).toEqual({ kind: "finished", editorDungeon: null });
  });
});
