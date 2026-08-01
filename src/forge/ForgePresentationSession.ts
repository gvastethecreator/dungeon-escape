export type ForgePresentationFinish<TEditor> =
  | { kind: "ignored" }
  | { kind: "finished"; editorDungeon: TEditor | null };

interface ActiveForgePresentation<TEditor> {
  presentationId: number;
  editorDungeon: TEditor | null;
  animationCompleted: boolean;
}

/** Owns iframe presentation identity, one-shot completion, and editor restoration. */
export class ForgePresentationSession<TEditor> {
  private active: ActiveForgePresentation<TEditor> | null = null;

  constructor(private initialPresentationMode = false) {}

  get isPresentationMode(): boolean {
    return this.initialPresentationMode || this.active !== null;
  }

  get activePresentationId(): number | null {
    return this.active?.presentationId ?? null;
  }

  start(presentationId: number, currentEditorDungeon: TEditor | null): void {
    const editorDungeon = this.active ? this.active.editorDungeon : currentEditorDungeon;
    this.initialPresentationMode = false;
    this.active = {
      presentationId,
      editorDungeon,
      animationCompleted: false,
    };
  }

  completeAnimation(): number | null {
    if (!this.active || this.active.animationCompleted) return null;
    this.active.animationCompleted = true;
    return this.active.presentationId;
  }

  finish(presentationId: number): ForgePresentationFinish<TEditor> {
    if (!this.active || this.active.presentationId !== presentationId) {
      return { kind: "ignored" };
    }
    const editorDungeon = this.active.editorDungeon;
    this.active = null;
    this.initialPresentationMode = false;
    return { kind: "finished", editorDungeon };
  }
}
