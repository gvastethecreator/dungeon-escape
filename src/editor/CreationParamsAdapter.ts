import type { DungeonParams } from "../domain/core";

/** DOM fields the Creation form uses. Play campaign never reads this shape. */
export interface CreationParamsForm {
  readonly roomCount: { value: string };
  readonly roomCountLabel: { value: string };
  readonly loopRate: { value: string };
  readonly loopRateLabel: { value: string };
  readonly decorDensity: { value: string };
  readonly decorDensityLabel: { value: string };
  readonly mapWidth: { value: string };
  readonly mapWidthLabel: { value: string };
  readonly mapHeight: { value: string };
  readonly mapHeightLabel: { value: string };
  readonly minRoom: { value: string };
  readonly minRoomLabel: { value: string };
  readonly maxRoom: { value: string };
  readonly maxRoomLabel: { value: string };
  readonly corridorRadius: { value: string };
  readonly corridorLabel: { value: string };
  readonly roomPadding: { value: string };
  readonly paddingLabel: { value: string };
  readonly enemyDensity: { value: string };
  readonly lightLevel: { value: string };
  readonly lightLevelLabel: { value: string };
  readonly profileSelect: {
    value: string;
    readonly options: ArrayLike<{ readonly value: string }>;
  };
}

export interface ApplyCreationParamsHooks {
  syncDifficultyLabel?(): void;
}

export function readCreationParams(form: CreationParamsForm): DungeonParams {
  return {
    roomTarget: Number(form.roomCount.value),
    loopRate: Number(form.loopRate.value),
    decorDensity: Number(form.decorDensity.value),
    mapWidth: Number(form.mapWidth.value),
    mapHeight: Number(form.mapHeight.value),
    minRoomSize: Number(form.minRoom.value),
    maxRoomSize: Number(form.maxRoom.value),
    corridorRadius: Number(form.corridorRadius.value),
    roomPadding: Number(form.roomPadding.value),
    enemyDensity: Number(form.enemyDensity.value),
    lightLevel: Number(form.lightLevel.value),
    profile: form.profileSelect.value || "custom",
  };
}

export function applyCreationParamsToForm(
  form: CreationParamsForm,
  params: Readonly<DungeonParams>,
  hooks: ApplyCreationParamsHooks = {},
): void {
  form.roomCount.value = String(params.roomTarget);
  form.roomCountLabel.value = String(params.roomTarget);
  form.loopRate.value = String(params.loopRate);
  form.loopRateLabel.value = `${params.loopRate}%`;
  form.decorDensity.value = String(params.decorDensity);
  form.decorDensityLabel.value = `${params.decorDensity}%`;
  form.mapWidth.value = String(params.mapWidth);
  form.mapWidthLabel.value = String(params.mapWidth);
  form.mapHeight.value = String(params.mapHeight);
  form.mapHeightLabel.value = String(params.mapHeight);
  form.minRoom.value = String(params.minRoomSize);
  form.minRoomLabel.value = String(params.minRoomSize);
  form.maxRoom.value = String(params.maxRoomSize);
  form.maxRoomLabel.value = String(params.maxRoomSize);
  form.corridorRadius.value = String(params.corridorRadius);
  form.corridorLabel.value = String(params.corridorRadius);
  form.roomPadding.value = String(params.roomPadding);
  form.paddingLabel.value = String(params.roomPadding);
  form.enemyDensity.value = String(params.enemyDensity);
  hooks.syncDifficultyLabel?.();
  form.lightLevel.value = String(params.lightLevel);
  form.lightLevelLabel.value = `${params.lightLevel}%`;
  const profileKnown = Array.from({ length: form.profileSelect.options.length }, (_, index) => {
    return form.profileSelect.options[index]!.value;
  }).includes(params.profile);
  form.profileSelect.value = profileKnown ? params.profile : "custom";
}
