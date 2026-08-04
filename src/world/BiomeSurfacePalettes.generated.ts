import type { DungeonMoodId } from "../systems/DungeonMood";

export type BiomeSurfacePaletteRole = "floor" | "wall" | "ceiling";

export interface BiomeSurfacePalette {
  readonly shadow: number;
  readonly base: number;
  readonly highlight: number;
  readonly accent: number;
  readonly propTint: number;
}

/** Generated from the shipped biome albedo maps in perceptual OKLab. */
export const BIOME_SURFACE_PALETTES: Readonly<
  Record<DungeonMoodId, Readonly<Record<BiomeSurfacePaletteRole, BiomeSurfacePalette>>>
> = Object.freeze({
  ancient: {
    floor: {
      shadow: 0x212b34,
      base: 0x3a4956,
      highlight: 0x415261,
      accent: 0x405261,
      propTint: 0x647686,
    },
    wall: {
      shadow: 0x2f3f4d,
      base: 0x495e6e,
      highlight: 0x516878,
      accent: 0x4e6577,
      propTint: 0x748da0,
    },
    ceiling: {
      shadow: 0x10141a,
      base: 0x192029,
      highlight: 0x202b35,
      accent: 0x1f2a34,
      propTint: 0x606a75,
    },
  },
  ash: {
    floor: {
      shadow: 0x222224,
      base: 0x3c3b3b,
      highlight: 0x4a4642,
      accent: 0x3d3a39,
      propTint: 0x6a6968,
    },
    wall: {
      shadow: 0x3e3d3d,
      base: 0x5e5954,
      highlight: 0x68615b,
      accent: 0x665f59,
      propTint: 0x8d8782,
    },
    ceiling: {
      shadow: 0x171718,
      base: 0x242322,
      highlight: 0x2c2a28,
      accent: 0x262423,
      propTint: 0x6a6867,
    },
  },
  backrooms: {
    floor: {
      shadow: 0x443a2b,
      base: 0x4d4231,
      highlight: 0x564a37,
      accent: 0x544835,
      propTint: 0x7b6e5a,
    },
    wall: {
      shadow: 0x594d28,
      base: 0x6c5e31,
      highlight: 0x796a36,
      accent: 0x796a35,
      propTint: 0x9d8d59,
    },
    ceiling: {
      shadow: 0x534d3c,
      base: 0x6a6450,
      highlight: 0x746e59,
      accent: 0x6e6852,
      propTint: 0x9a937b,
    },
  },
  frost: {
    floor: {
      shadow: 0x5d6e79,
      base: 0x798d9a,
      highlight: 0x8297a3,
      accent: 0x7b92a0,
      propTint: 0x859caa,
    },
    wall: {
      shadow: 0x303a47,
      base: 0x455363,
      highlight: 0x505f6f,
      accent: 0x4b5a6b,
      propTint: 0x718193,
    },
    ceiling: {
      shadow: 0x11171d,
      base: 0x1a242c,
      highlight: 0x23303b,
      accent: 0x23303b,
      propTint: 0x5e6b75,
    },
  },
  fungal: {
    floor: {
      shadow: 0x29232d,
      base: 0x332c38,
      highlight: 0x433c47,
      accent: 0x392f43,
      propTint: 0x6e6574,
    },
    wall: {
      shadow: 0x1b1920,
      base: 0x2a252f,
      highlight: 0x3e3741,
      accent: 0x352b3d,
      propTint: 0x6c6673,
    },
    ceiling: {
      shadow: 0x201c23,
      base: 0x29242d,
      highlight: 0x352f39,
      accent: 0x312737,
      propTint: 0x6d6672,
    },
  },
  grim: {
    floor: {
      shadow: 0x292e25,
      base: 0x44493a,
      highlight: 0x4e5243,
      accent: 0x454b39,
      propTint: 0x707664,
    },
    wall: {
      shadow: 0x30322c,
      base: 0x42453a,
      highlight: 0x494d40,
      accent: 0x484c3e,
      propTint: 0x6e7265,
    },
    ceiling: {
      shadow: 0x12130f,
      base: 0x20231c,
      highlight: 0x2d3228,
      accent: 0x292f23,
      propTint: 0x666b61,
    },
  },
  iron: {
    floor: {
      shadow: 0x202428,
      base: 0x3d454a,
      highlight: 0x454e54,
      accent: 0x434c52,
      propTint: 0x687177,
    },
    wall: {
      shadow: 0x31373c,
      base: 0x464f54,
      highlight: 0x4d565c,
      accent: 0x495258,
      propTint: 0x737c83,
    },
    ceiling: {
      shadow: 0x0f1012,
      base: 0x1b1e20,
      highlight: 0x222629,
      accent: 0x1f2327,
      propTint: 0x66696d,
    },
  },
  molten: {
    floor: {
      shadow: 0x231a16,
      base: 0x3a2c22,
      highlight: 0x433428,
      accent: 0x423225,
      propTint: 0x776558,
    },
    wall: {
      shadow: 0x281f1b,
      base: 0x3d2f26,
      highlight: 0x46352a,
      accent: 0x463328,
      propTint: 0x77655a,
    },
    ceiling: {
      shadow: 0x100c0a,
      base: 0x1b1410,
      highlight: 0x241c16,
      accent: 0x241b15,
      propTint: 0x706762,
    },
  },
  obsidian: {
    floor: {
      shadow: 0x0f111a,
      base: 0x141620,
      highlight: 0x1d1c2b,
      accent: 0x1b172c,
      propTint: 0x656877,
    },
    wall: {
      shadow: 0x0c0e15,
      base: 0x12141c,
      highlight: 0x191a25,
      accent: 0x151523,
      propTint: 0x656875,
    },
    ceiling: {
      shadow: 0x10111b,
      base: 0x14151f,
      highlight: 0x1a1a27,
      accent: 0x181528,
      propTint: 0x666876,
    },
  },
  sunken: {
    floor: {
      shadow: 0x16231f,
      base: 0x1c2c28,
      highlight: 0x263833,
      accent: 0x233327,
      propTint: 0x5a6e68,
    },
    wall: {
      shadow: 0x141f1a,
      base: 0x1c2a25,
      highlight: 0x253732,
      accent: 0x233227,
      propTint: 0x5c6e67,
    },
    ceiling: {
      shadow: 0x14201c,
      base: 0x1c2a25,
      highlight: 0x26362f,
      accent: 0x233229,
      propTint: 0x5c6e68,
    },
  },
  verdant: {
    floor: {
      shadow: 0x1c211b,
      base: 0x2e342b,
      highlight: 0x3d4336,
      accent: 0x394033,
      propTint: 0x646c60,
    },
    wall: {
      shadow: 0x272a27,
      base: 0x323831,
      highlight: 0x363d35,
      accent: 0x343b33,
      propTint: 0x646b63,
    },
    ceiling: {
      shadow: 0x101210,
      base: 0x1a1d19,
      highlight: 0x252822,
      accent: 0x1c211b,
      propTint: 0x666a65,
    },
  },
});

export function biomeSurfacePalette(
  mood: DungeonMoodId,
  surface: BiomeSurfacePaletteRole,
): BiomeSurfacePalette {
  return BIOME_SURFACE_PALETTES[mood][surface];
}
