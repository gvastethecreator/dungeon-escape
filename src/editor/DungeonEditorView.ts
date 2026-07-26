import type { DungeonData, GridCell } from "../dungeon/types";
import { FLOOR } from "../dungeon/generateDungeon";
import {
  createDungeonEditorProjection,
  EDITOR_CELL_KIND,
  type DungeonEditorProjection,
  type EditorProjectionRoom,
} from "./DungeonEditorProjection";
import type { DungeonMood, DungeonMoodId } from "../systems/DungeonMood";
import { getDungeonMood, listDungeonMoodIds } from "../systems/DungeonMood";
import { biomeTextureUrl } from "../world/AssetLibrary";
import { ITEM_FRAMES } from "../world/AssetLibrary";
import { ENEMY_ANIMATIONS } from "../world/EnemySpriteAtlas";

interface EditorViewOptions {
  onSelectSpawn(cell: GridCell): void;
}

interface ViewTransform {
  scale: number;
  originX: number;
  originY: number;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load editor texture ${url}`));
    image.src = url;
  });
}

export class DungeonEditorView {
  private readonly canvas: HTMLCanvasElement;
  private readonly onSelectSpawn: (cell: GridCell) => void;
  private dungeon: DungeonData | null = null;
  private projection: DungeonEditorProjection | null = null;
  private spawn: GridCell | null = null;
  private debug = false;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private dragging = false;
  private moved = false;
  private lastX = 0;
  private lastY = 0;
  private floorImage: HTMLImageElement | null = null;
  private wallImage: HTMLImageElement | null = null;
  private enemyImage: HTMLImageElement | null = null;
  private enemyTintImage: HTMLCanvasElement | null = null;
  private enemyTintMood: DungeonMoodId | null = null;
  private itemImage: HTMLImageElement | null = null;
  private readonly stoneImages = new Map<string, HTMLImageElement>();
  private texturesReady = false;
  private mood: DungeonMood = getDungeonMood("ash");
  private readonly biomeImages = new Map<
    DungeonMoodId,
    { floor: HTMLImageElement; wall: HTMLImageElement }
  >();

  constructor(canvas: HTMLCanvasElement, options: EditorViewOptions) {
    this.canvas = canvas;
    this.onSelectSpawn = options.onSelectSpawn;
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointercancel", this.handlePointerCancel);
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", this.preventContextMenu);
    void this.loadTextures();
    void this.loadFeatureImages();
    void this.loadEditorFont();
  }

  /** Ensure Pixelify Sans is ready before the canvas paints editor captions. */
  private async loadEditorFont(): Promise<void> {
    if (typeof document === "undefined" || !("fonts" in document)) return;
    try {
      await document.fonts.load('10px "Pixelify Sans"');
      await document.fonts.load('bold 10px "Pixelify Sans"');
      this.draw();
    } catch {
      /* fall back to Courier New silently */
    }
  }

  setDungeon(dungeon: DungeonData, mood?: DungeonMood): void {
    this.dungeon = dungeon;
    this.projection = createDungeonEditorProjection(dungeon);
    this.spawn = { ...dungeon.spawn };
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    if (mood) this.applyMood(mood);
    else this.draw();
  }

  setMood(mood: DungeonMood): void {
    this.applyMood(mood);
  }

  setDebug(debug: boolean): void {
    this.debug = debug;
    this.draw();
  }
  setSpawn(spawn: GridCell): void {
    this.spawn = { ...spawn };
    this.draw();
  }
  redraw(): void {
    this.draw();
  }

  dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.handlePointerCancel);
    this.canvas.removeEventListener("wheel", this.handleWheel);
    this.canvas.removeEventListener("contextmenu", this.preventContextMenu);
  }

  private applyMood(mood: DungeonMood): void {
    this.mood = mood;
    this.enemyTintImage = null;
    this.enemyTintMood = null;
    const cached = this.biomeImages.get(mood.id);
    if (cached) {
      this.floorImage = cached.floor;
      this.wallImage = cached.wall;
      this.texturesReady = true;
    }
    this.draw();
  }

  private async loadTextures(): Promise<void> {
    try {
      await Promise.all(
        listDungeonMoodIds().map(async (id) => {
          const [floor, wall] = await Promise.all([
            loadImage(biomeTextureUrl(id, "floor")),
            loadImage(biomeTextureUrl(id, "wall")),
          ]);
          this.biomeImages.set(id, { floor, wall });
        }),
      );
      const active = this.biomeImages.get(this.mood.id);
      if (active) {
        this.floorImage = active.floor;
        this.wallImage = active.wall;
        this.texturesReady = true;
      }
      this.draw();
    } catch {
      this.texturesReady = false;
    }
  }

  private async loadFeatureImages(): Promise<void> {
    try {
      const [enemies, items, ...stones] = await Promise.all([
        loadImage("/assets/sprites/enemies-v5/iron-ash-enemies-v5.png"),
        loadImage("/assets/sprites/iron-ash-items.png"),
        ...(["ember", "ash", "crypt", "verdant"] as const).map((id) =>
          loadImage(`/assets/sprites/keyed/${id}-sheet.png`),
        ),
      ]);
      this.enemyImage = enemies;
      this.enemyTintImage = null;
      this.enemyTintMood = null;
      this.itemImage = items;
      (["ember", "ash", "crypt", "verdant"] as const).forEach((id, index) => {
        const image = stones[index];
        if (image) this.stoneImages.set(id, image);
      });
      this.draw();
    } catch {
      // Structural map stays usable if an optional preview sprite fails.
    }
  }

  private getTransform(width: number, height: number): ViewTransform {
    if (!this.dungeon) return { scale: 1, originX: 0, originY: 0 };
    const fit = Math.min((width - 48) / this.dungeon.width, (height - 48) / this.dungeon.height);
    const scale = Math.max(1.2, fit * this.zoom);
    return {
      scale,
      originX: (width - this.dungeon.width * scale) / 2 + this.panX,
      originY: (height - this.dungeon.height * scale) / 2 + this.panY,
    };
  }

  private paintCell(
    context: CanvasRenderingContext2D,
    image: HTMLImageElement | null,
    fallback: string,
    x: number,
    y: number,
    size: number,
    tint: string | null,
  ): void {
    if (image && this.texturesReady) {
      // Full tile sample — iron-ash maps are authored as seamless floor/wall tiles.
      context.drawImage(image, 0, 0, image.width, image.height, x, y, size, size);
      if (tint) {
        context.fillStyle = tint;
        context.fillRect(x, y, size, size);
      }
      return;
    }
    context.fillStyle = fallback;
    context.fillRect(x, y, size, size);
  }

  private draw(): void {
    const dungeon = this.dungeon;
    const projection = this.projection;
    const bounds = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(bounds.width));
    const height = Math.max(1, Math.floor(bounds.height));
    if (
      this.canvas.width !== Math.floor(width * dpr) ||
      this.canvas.height !== Math.floor(height * dpr)
    ) {
      this.canvas.width = Math.floor(width * dpr);
      this.canvas.height = Math.floor(height * dpr);
    }
    const context = this.canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = this.texturesReady ? false : true;
    context.fillStyle = "#050606";
    context.fillRect(0, 0, width, height);
    if (!dungeon || !projection) return;
    const view = this.getTransform(width, height);
    const cell = Math.max(1, Math.ceil(view.scale));

    for (let y = 0; y < dungeon.height; y += 1) {
      for (let x = 0; x < dungeon.width; x += 1) {
        const index = y * dungeon.width + x;
        const kind = projection.cells[index];
        if (kind === EDITOR_CELL_KIND.empty) continue;
        const px = view.originX + x * view.scale;
        const py = view.originY + y * view.scale;
        if (kind === EDITOR_CELL_KIND.wall) {
          this.paintCell(
            context,
            this.wallImage,
            "#1a1c1d",
            px,
            py,
            cell,
            this.mood.editorWallTint,
          );
          continue;
        }
        if (kind === EDITOR_CELL_KIND.pool || kind === EDITOR_CELL_KIND.lake) {
          this.drawLiquidCell(context, px, py, cell, kind === EDITOR_CELL_KIND.lake, x + y);
          continue;
        }
        const isCorridor = kind === EDITOR_CELL_KIND.corridor;
        this.paintCell(
          context,
          this.floorImage,
          isCorridor ? "#2a2c2b" : "#323430",
          px,
          py,
          cell,
          isCorridor ? this.mood.editorCorridorTint : this.mood.editorFloorTint,
        );
      }
    }

    for (const room of projection.rooms) this.drawRoomIdentity(context, room, view);
    this.drawForgeFeatures(context, projection, view);

    if (this.debug) {
      context.lineWidth = 1;
      context.strokeStyle = "rgba(116, 125, 130, 0.28)";
      dungeon.rooms.forEach((room) =>
        context.strokeRect(
          view.originX + room.x * view.scale,
          view.originY + room.y * view.scale,
          room.width * view.scale,
          room.height * view.scale,
        ),
      );
      context.lineWidth = 1.5;
      dungeon.edges.forEach((edge) => {
        const left = dungeon.rooms[edge.left];
        const right = dungeon.rooms[edge.right];
        if (!left || !right) return;
        context.strokeStyle = edge.kind === "tree" ? "#8d9089" : "#655c57";
        context.beginPath();
        context.moveTo(
          view.originX + (left.center.x + 0.5) * view.scale,
          view.originY + (left.center.y + 0.5) * view.scale,
        );
        context.lineTo(
          view.originX + (right.center.x + 0.5) * view.scale,
          view.originY + (right.center.y + 0.5) * view.scale,
        );
        context.stroke();
      });
    }

    this.drawMarker(context, dungeon.exit, view, "#d8d4c9", "E");
    this.drawMarker(context, this.spawn ?? dungeon.spawn, view, "#8da69b", "S");
    context.fillStyle = "#777873";
    context.font = '10px "Pixelify Sans", "Courier New", monospace';
    context.fillText(
      `${dungeon.seed} · ${dungeon.stats.roomCount} rooms · ${dungeon.stats.loopCount} loops`,
      14,
      height - 14,
    );
    if (dungeon.forge) this.drawLegend(context, width, height);
  }

  private drawLiquidCell(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    frozen: boolean,
    phase: number,
  ): void {
    context.fillStyle = frozen ? "#47646c" : "#273f46";
    context.fillRect(x, y, size, size);
    context.fillStyle = frozen ? "rgba(183, 222, 226, 0.32)" : "rgba(92, 154, 164, 0.28)";
    const stripe = Math.max(1, size * 0.16);
    const offset = (phase % 3) * stripe;
    context.fillRect(x, y + ((size * 0.3 + offset) % Math.max(1, size - stripe)), size, stripe);
  }

  private drawRoomIdentity(
    context: CanvasRenderingContext2D,
    room: EditorProjectionRoom,
    view: ViewTransform,
  ): void {
    if (!room.identity) return;
    const colors: Record<string, string> = {
      lake: "rgba(93, 155, 166, 0.22)",
      grave: "rgba(116, 126, 105, 0.24)",
      treasure: "rgba(178, 133, 61, 0.23)",
      shrine: "rgba(116, 127, 171, 0.24)",
      elite: "rgba(144, 65, 58, 0.24)",
      boss: "rgba(150, 52, 48, 0.28)",
    };
    const x = view.originX + room.bounds.x * view.scale;
    const y = view.originY + room.bounds.y * view.scale;
    const width = room.bounds.width * view.scale;
    const height = room.bounds.height * view.scale;
    context.fillStyle = colors[room.identity] ?? "rgba(160, 160, 150, 0.16)";
    context.fillRect(x, y, width, height);
    context.strokeStyle = (colors[room.identity] ?? "rgba(160, 160, 150, 0.4)").replace(
      /0\.\d+\)$/,
      "0.72)",
    );
    context.lineWidth = Math.max(1, Math.min(2, view.scale * 0.18));
    context.strokeRect(x + 0.5, y + 0.5, Math.max(1, width - 1), Math.max(1, height - 1));
    if (view.scale < 3.4) return;
    context.fillStyle = "#d3d0c5";
    context.font = `bold ${Math.max(7, Math.min(10, view.scale * 1.05))}px "Pixelify Sans", monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(
      room.label,
      view.originX + (room.cell.x + 0.5) * view.scale,
      view.originY + (room.cell.y + 0.5) * view.scale,
    );
    context.textAlign = "start";
    context.textBaseline = "alphabetic";
  }

  private drawForgeFeatures(
    context: CanvasRenderingContext2D,
    projection: DungeonEditorProjection,
    view: ViewTransform,
  ): void {
    const center = (cell: GridCell) => ({
      x: view.originX + (cell.x + 0.5) * view.scale,
      y: view.originY + (cell.y + 0.5) * view.scale,
    });
    const size = Math.max(1.4, Math.min(4.8, view.scale * 0.46));

    context.fillStyle = "#d1843e";
    for (const torch of projection.torches) {
      const point = center(torch);
      context.beginPath();
      context.arc(point.x, point.y, size * 0.58, 0, Math.PI * 2);
      context.fill();
    }

    const enemyPreviewImage = this.getEnemyPreviewImage();
    for (const spawn of projection.enemySpawns) {
      const point = center(spawn.cell);
      const frame = ENEMY_ANIMATIONS[spawn.kind].frames[0];
      if (!enemyPreviewImage || !frame) continue;
      const iconHeight = Math.max(10, Math.min(30, view.scale * (2.5 + spawn.tier * 0.24)));
      const iconWidth = iconHeight;
      context.save();
      context.globalAlpha = 0.68;
      context.shadowColor = `#${this.mood.surfaceTint.toString(16).padStart(6, "0")}`;
      context.shadowBlur = Math.max(1.5, iconHeight * 0.12);
      context.drawImage(
        enemyPreviewImage,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        point.x - iconWidth / 2,
        point.y - iconHeight * 0.76,
        iconWidth,
        iconHeight,
      );
      context.restore();
    }

    for (const prop of projection.keyProps) {
      const point = center(prop.cell);
      const frame =
        prop.kind === "chest" || prop.kind === "reliquary"
          ? ITEM_FRAMES.reliquary
          : prop.kind === "grave"
            ? ITEM_FRAMES.skullSeal
            : null;
      if (this.itemImage && frame) {
        const iconSize = Math.max(9, Math.min(24, view.scale * 2.15));
        context.drawImage(
          this.itemImage,
          frame.x,
          frame.y,
          frame.w,
          frame.h,
          point.x - iconSize / 2,
          point.y - iconSize / 2,
          iconSize,
          iconSize,
        );
        continue;
      }
      const crystalImage =
        prop.kind === "bossCrystal"
          ? this.stoneImages.get("ember")
          : prop.kind === "shrineCrystal"
            ? this.stoneImages.get("crypt")
            : undefined;
      if (!crystalImage) continue;
      const iconSize = Math.max(9, Math.min(23, view.scale * 2));
      context.drawImage(
        crystalImage,
        0,
        0,
        crystalImage.width / 2,
        crystalImage.height / 2,
        point.x - iconSize / 2,
        point.y - iconSize / 2,
        iconSize,
        iconSize,
      );
    }

    for (const stone of projection.stones) {
      const point = center(stone.cell);
      const image = this.stoneImages.get(stone.id);
      if (!image) continue;
      const iconSize = Math.max(10, Math.min(26, view.scale * 2.4));
      context.save();
      context.shadowColor = "rgba(98, 160, 178, 0.78)";
      context.shadowBlur = Math.max(2, iconSize * 0.16);
      context.drawImage(
        image,
        0,
        0,
        image.width / 2,
        image.height / 2,
        point.x - iconSize / 2,
        point.y - iconSize / 2,
        iconSize,
        iconSize,
      );
      context.restore();
    }
  }

  /** Dark biome-tinted atlas: Creation reveals threat silhouettes, not the full roster art. */
  private getEnemyPreviewImage(): HTMLCanvasElement | null {
    if (!this.enemyImage) return null;
    if (this.enemyTintImage && this.enemyTintMood === this.mood.id) return this.enemyTintImage;
    const canvas = document.createElement("canvas");
    canvas.width = this.enemyImage.width;
    canvas.height = this.enemyImage.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.filter = "brightness(0.48) saturate(0.62)";
    context.drawImage(this.enemyImage, 0, 0);
    context.filter = "none";
    context.globalCompositeOperation = "source-atop";
    context.globalAlpha = 0.48;
    context.fillStyle = `#${this.mood.surfaceTint.toString(16).padStart(6, "0")}`;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    this.enemyTintImage = canvas;
    this.enemyTintMood = this.mood.id;
    return canvas;
  }

  private drawLegend(context: CanvasRenderingContext2D, width: number, height: number): void {
    const items = [
      ["#47646c", "WATER"],
      ["#d1843e", "FIRE"],
      ["#b4463f", "THREAT"],
      ["#62a0b2", "STONE"],
    ] as const;
    const itemWidth = 62;
    const x = Math.max(12, width - items.length * itemWidth - 12);
    const y = height - 18;
    context.font = '8px "Pixelify Sans", monospace';
    for (const [index, [color, label]] of items.entries()) {
      const itemX = x + index * itemWidth;
      context.fillStyle = color;
      context.fillRect(itemX, y - 7, 6, 6);
      context.fillStyle = "#8f918b";
      context.fillText(label, itemX + 9, y - 1);
    }
  }

  private drawMarker(
    context: CanvasRenderingContext2D,
    cell: GridCell,
    view: ViewTransform,
    color: string,
    label: string,
  ): void {
    const x = view.originX + (cell.x + 0.5) * view.scale;
    const y = view.originY + (cell.y + 0.5) * view.scale;
    const radius = Math.max(5, Math.min(10, view.scale * 1.25));
    context.fillStyle = color;
    context.fillRect(Math.round(x - radius), Math.round(y - radius), radius * 2, radius * 2);
    context.fillStyle = "#070809";
    context.font = 'bold 10px "Pixelify Sans", "Courier New", monospace';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, x, y + 0.5);
    context.textAlign = "start";
    context.textBaseline = "alphabetic";
  }

  private cellAt(clientX: number, clientY: number): GridCell | null {
    if (!this.dungeon) return null;
    const bounds = this.canvas.getBoundingClientRect();
    const view = this.getTransform(bounds.width, bounds.height);
    const x = Math.floor((clientX - bounds.left - view.originX) / view.scale);
    const y = Math.floor((clientY - bounds.top - view.originY) / view.scale);
    if (
      x < 0 ||
      y < 0 ||
      x >= this.dungeon.width ||
      y >= this.dungeon.height ||
      this.dungeon.grid[y]?.[x] !== FLOOR
    )
      return null;
    return { x, y };
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.dragging = event.button === 1 || event.button === 2 || event.shiftKey;
    this.moved = false;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.canvas.hasPointerCapture(event.pointerId) || !this.dragging) return;
    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.panX += dx;
    this.panY += dy;
    this.moved ||= Math.abs(dx) + Math.abs(dy) > 1;
    this.draw();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.canvas.hasPointerCapture(event.pointerId))
      this.canvas.releasePointerCapture(event.pointerId);
    if (!this.dragging && !this.moved && event.button === 0) {
      const cell = this.cellAt(event.clientX, event.clientY);
      if (cell) this.onSelectSpawn(cell);
    }
    this.dragging = false;
  };

  private readonly handlePointerCancel = (): void => {
    this.dragging = false;
  };
  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.zoom = Math.max(0.55, Math.min(4.5, this.zoom * Math.exp(-event.deltaY * 0.0012)));
    this.draw();
  };
  private readonly preventContextMenu = (event: Event): void => {
    event.preventDefault();
  };
}
