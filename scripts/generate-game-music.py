#!/usr/bin/env python3
"""Rebuild Dungeon Escape scene music with Neo-SPC.

Beds are written to sit under play, not on top of it: low energy, long rests,
sparse drums, and no chase/fanfare writing. Portal cues keep the biome's key,
mode, and motif, then lift tempo and pulse only enough to mark the escape.

Evidence lives in `.scratch/audio/soundtrack-v2/<cue>/`. Runtime copies land in
`public/assets/audio/dungeon/`.

Requires the Neo-SPC skill, FFmpeg, and the render Python extras.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
NEOSPC = Path(r"C:\Users\cristian\.codex\skills\neospc-music-composer")
NEOSPC_CLI = NEOSPC / "scripts" / "neospc.py"
SCRATCH = ROOT / ".scratch" / "audio" / "soundtrack-v2"
PUBLIC_AUDIO = ROOT / "public" / "assets" / "audio" / "dungeon"
KEYS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

Cue = dict[str, Any]


def biome_cues() -> list[Cue]:
    biomes: list[dict[str, Any]] = [
        {
            "id": "ancient",
            "explore_title": "Dust Litany",
            "portal_title": "Unsealed Dust",
            "subcategory": "Ancient Ruins",
            "category": "horror",
            "mood": "sacred",
            "tension": 0.34,
            "key": "D",
            "mode": "phrygian",
            "meter": "5/4",
            "bpm": 62,
            "lead": "reed",
            "secondary": "strings",
            "ensemble": "chamber",
            "bass": "bowed",
            "kit": "ritual",
            "contour": "terrace",
            "progression": "modal_phr_01",
            "motif": "A falling half-step on beat one, answered two beats later by a quiet fifth that never climbs",
            "thesis": "Turn the weight of old stone into a held breath the player can walk through without noticing the melody",
            "brightness": 0.38,
        },
        {
            "id": "molten",
            "explore_title": "Slag Breath",
            "portal_title": "Ember Path",
            "subcategory": "Subterranean Dread",
            "category": "horror",
            "mood": "tense",
            "tension": 0.42,
            "key": "E",
            "mode": "phrygian",
            "meter": "4/4",
            "bpm": 70,
            "lead": "synth_lead",
            "secondary": "reed",
            "ensemble": "hybrid",
            "bass": "analog",
            "kit": "industrial",
            "contour": "narrow",
            "progression": "modal_phr_01",
            "motif": "A three-note ember cell that smoulders on one pitch, then drops a minor third and stays there",
            "thesis": "Keep heat as pressure in the low register so the cave can roar while the score only glows",
            "brightness": 0.48,
        },
        {
            "id": "frost",
            "explore_title": "Still Glass",
            "portal_title": "Fracture Light",
            "subcategory": "Frozen Cavern",
            "category": "mystery",
            "mood": "lonely",
            "tension": 0.28,
            "key": "F#",
            "mode": "dorian",
            "meter": "6/8",
            "bpm": 58,
            "lead": "flute",
            "secondary": "vibes",
            "ensemble": "chamber",
            "bass": "bowed",
            "kit": "brush",
            "contour": "wave",
            "progression": "modal_dor_01",
            "motif": "A rising fourth that never arrives, melting back by two ice-small steps",
            "thesis": "Leave wide cold gaps so footsteps and wind stay louder than the tune",
            "brightness": 0.62,
        },
        {
            "id": "grim",
            "explore_title": "Bone Interval",
            "portal_title": "Procession Stir",
            "subcategory": "Occult Ritual",
            "category": "horror",
            "mood": "dread",
            "tension": 0.4,
            "key": "C",
            "mode": "aeolian",
            "meter": "3/4",
            "bpm": 64,
            "lead": "reed",
            "secondary": "strings",
            "ensemble": "choir_orchestra",
            "bass": "bowed",
            "kit": "ritual",
            "contour": "descending",
            "progression": "modal_aeo_01",
            "motif": "A two-note funeral sigh, down a minor third, rest, then the same sigh a step lower",
            "thesis": "Make grief feel processional without turning the crypt into a choir concert",
            "brightness": 0.32,
        },
        {
            "id": "verdant",
            "explore_title": "Root Hum",
            "portal_title": "Canopy Wake",
            "subcategory": "Jungle Exploration",
            "category": "adventure",
            "mood": "dreamlike",
            "tension": 0.26,
            "key": "G",
            "mode": "dorian",
            "meter": "6/8",
            "bpm": 68,
            "lead": "flute",
            "secondary": "guitar",
            "ensemble": "folk_ensemble",
            "bass": "upright",
            "kit": "brush",
            "contour": "wave",
            "progression": "modal_dor_01",
            "motif": "A leaf-slow neighbor tone around the fifth, answered by a plucked open fourth",
            "thesis": "Suggest living growth in the gaps between notes so moss and insects can speak first",
            "brightness": 0.52,
        },
        {
            "id": "ash",
            "explore_title": "Cinder Veil",
            "portal_title": "Buried Glow",
            "subcategory": "Unsafe Safe Room",
            "category": "horror",
            "mood": "lonely",
            "tension": 0.3,
            "key": "Bb",
            "mode": "aeolian",
            "meter": "4/4",
            "bpm": 60,
            "lead": "piano",
            "secondary": "strings",
            "ensemble": "chamber",
            "bass": "sub",
            "kit": "minimal",
            "contour": "narrow",
            "progression": "modal_aeo_02",
            "motif": "A single piano tone that returns after four beats, each time with one quieter grace note",
            "thesis": "Hold the aftermath of fire as almost-silence, with warmth only in the decay",
            "brightness": 0.36,
        },
        {
            "id": "iron",
            "explore_title": "Bolt Murmur",
            "portal_title": "Gear Lift",
            "subcategory": "Industrial Assault",
            "category": "electronic",
            "mood": "tense",
            "tension": 0.38,
            "key": "D",
            "mode": "mixolydian",
            "meter": "4/4",
            "bpm": 72,
            "lead": "synth_lead",
            "secondary": "vibes",
            "ensemble": "electronic_stack",
            "bass": "analog",
            "kit": "industrial",
            "contour": "terrace",
            "progression": "modal_mix_01",
            "motif": "A mechanical fourth that locks on the off-beat, then releases down a whole step",
            "thesis": "Let the foundry pulse under the mix so sparks and cages stay the foreground",
            "brightness": 0.44,
        },
        {
            "id": "obsidian",
            "explore_title": "Mirror Undercurrent",
            "portal_title": "Glass Tilt",
            "subcategory": "Psychological Horror",
            "category": "mystery",
            "mood": "uncanny",
            "tension": 0.36,
            "key": "Ab",
            "mode": "lydian",
            "meter": "5/4",
            "bpm": 66,
            "lead": "vibes",
            "secondary": "strings",
            "ensemble": "chamber",
            "bass": "sub",
            "kit": "minimal",
            "contour": "angular",
            "progression": "modal_lyd_01",
            "motif": "A raised fourth that hangs too long, then slips down by a glass-thin semitone",
            "thesis": "Keep the brightness uncanny and distant so reflections do the talking",
            "brightness": 0.58,
        },
        {
            "id": "sunken",
            "explore_title": "Pressure Drift",
            "portal_title": "Surface Pull",
            "subcategory": "Underground River",
            "category": "mystery",
            "mood": "dreamlike",
            "tension": 0.32,
            "key": "E",
            "mode": "dorian",
            "meter": "12/8",
            "bpm": 58,
            "lead": "reed",
            "secondary": "flute",
            "ensemble": "chamber",
            "bass": "sub",
            "kit": "brush",
            "contour": "wave",
            "progression": "modal_dor_01",
            "motif": "A slow tide of three notes that crest on the fifth and recede without a downbeat accent",
            "thesis": "Push harmony below the waterline so drips and bubbles remain the close sound",
            "brightness": 0.4,
        },
        {
            "id": "fungal",
            "explore_title": "Spore Drift",
            "portal_title": "Bloom Pulse",
            "subcategory": "Body Horror",
            "category": "horror",
            "mood": "uncanny",
            "tension": 0.37,
            "key": "F#",
            "mode": "aeolian",
            "meter": "7/8",
            "bpm": 64,
            "lead": "vibes",
            "secondary": "reed",
            "ensemble": "choir_orchestra",
            "bass": "bowed",
            "kit": "ritual",
            "contour": "narrow",
            "progression": "modal_aeo_01",
            "motif": "A clustered neighbor cell that blooms one step outward, then collapses back to the same pitch",
            "thesis": "Let the cave feel alive in slow spores rather than a sung melody",
            "brightness": 0.46,
        },
        {
            "id": "backrooms",
            "explore_title": "Fluorescent Hum",
            "portal_title": "Exit Flicker",
            "subcategory": "Psychological Horror",
            "category": "electronic",
            "mood": "uncanny",
            "tension": 0.44,
            "key": "C",
            "mode": "mixolydian",
            "meter": "4/4",
            "bpm": 70,
            "lead": "synth_lead",
            "secondary": "vibes",
            "ensemble": "electronic_stack",
            "bass": "analog",
            "kit": "electronic",
            "contour": "terrace",
            "progression": "modal_mix_01",
            "motif": "A fluorescent fifth that flickers by repeating, then misses one repeat as if a ballast failed",
            "thesis": "Stay almost-boring on purpose so the wrongness lives in the hum, not a hook",
            "brightness": 0.5,
        },
    ]
    cues: list[Cue] = []
    for index, biome in enumerate(biomes):
        seed = 4100 + index * 19
        explore_energy = 0.24 + (index % 3) * 0.02
        cues.append(
            {
                "id": f"{biome['id']}_explore",
                "title": biome["explore_title"],
                "runtime_file": f"music-biome-{biome['id']}.ogg",
                "role": "explore",
                "biome": biome["id"],
                "category": biome["category"],
                "subcategory": biome["subcategory"],
                "game_context": "stealth",
                "game_function": f"{biome['id']} dungeon exploration bed",
                "mood": biome["mood"],
                "thesis": biome["thesis"],
                "bpm": biome["bpm"],
                "meter": biome["meter"],
                "key": biome["key"],
                "mode": biome["mode"],
                "voices": 12,
                "bars": 16,
                "energy": explore_energy,
                "tension": biome["tension"],
                "seed": seed,
                "motif": biome["motif"],
                "harmonic_language": f"{biome['mode']} field · {biome['progression']}, mostly root-position with a pedal under the loop seam",
                "bass_behavior": "Long roots with rare stepwise links at phrase ends; never walking",
                "groove": "Floating pulse with one soft mark on the first beat of every two bars",
                "silence_budget": "Leave at least the last beat of each two-bar cell empty so room tone can occupy it",
                "loop_strategy": "Hold the last color as a pickup that resolves on the first downbeat without a fill",
                "progression_id": biome["progression"],
                "ensemble": biome["ensemble"],
                "primary_lead": biome["lead"],
                "secondary_lead": biome["secondary"],
                "bass_family": biome["bass"],
                "drum_kit": biome["kit"],
                "groove_template": "floating",
                "melody_contour": biome["contour"],
                "brightness": biome["brightness"],
            }
        )
        cues.append(
            {
                "id": f"{biome['id']}_portal",
                "title": biome["portal_title"],
                "runtime_file": f"music-biome-{biome['id']}-portal.ogg",
                "role": "portal",
                "biome": biome["id"],
                "category": biome["category"],
                "subcategory": biome["subcategory"],
                "game_context": "reveal",
                "game_function": f"{biome['id']} four-stone portal bed",
                "mood": biome["mood"],
                "thesis": (
                    f"Keep the {biome['explore_title']} identity, then hurry the breath just enough "
                    "that the open portal feels urgent without stealing the mix from footsteps and threats"
                ),
                "bpm": biome["bpm"] + 16,
                "meter": biome["meter"],
                "key": biome["key"],
                "mode": biome["mode"],
                "voices": 16,
                "bars": 16,
                "energy": min(0.48, explore_energy + 0.14),
                "tension": min(0.62, biome["tension"] + 0.12),
                "seed": seed + 1000,
                "motif": biome["motif"] + ", spoken closer together with a shorter rest before the answer",
                "harmonic_language": f"Same {biome['mode']} shuttle as exploration, cadence slightly stronger at the loop",
                "bass_behavior": "Same root family as exploration, with one extra pickup into the loop seam",
                "groove": "The exploration float plus a light inner pulse on the back half of the bar",
                "silence_budget": "Keep one empty eighth at each phrase end so the portal still breathes",
                "loop_strategy": "Use a short dominant-color pickup into the first downbeat, no drum fill",
                "progression_id": biome["progression"],
                "ensemble": biome["ensemble"],
                "primary_lead": biome["lead"],
                "secondary_lead": biome["secondary"],
                "bass_family": biome["bass"],
                "drum_kit": biome["kit"],
                "groove_template": "floating",
                "melody_contour": biome["contour"],
                "brightness": min(0.7, biome["brightness"] + 0.06),
            }
        )
    return cues


def screen_cues() -> list[Cue]:
    return [
        {
            "id": "threshold_ember",
            "title": "Threshold Ember",
            "runtime_file": "music-menu.ogg",
            "role": "screen",
            "biome": None,
            "category": "mystery",
            "subcategory": "Unsafe Safe Room",
            "game_context": "town",
            "game_function": "welcome home bed",
            "mood": "mysterious",
            "thesis": "Invite the player to the lantern without selling a theme song; curiosity, then a held hush",
            "bpm": 72,
            "meter": "6/8",
            "key": "D",
            "mode": "dorian",
            "voices": 12,
            "bars": 16,
            "energy": 0.3,
            "tension": 0.22,
            "seed": 2711,
            "motif": "A lantern-small rising fourth that falls back two steps and waits a full bar before repeating",
            "harmonic_language": "Dorian shuttle with a soft i–IV turn and almost no dominant punch",
            "bass_behavior": "Upright roots on the dotted pulse, silent on the last beat of every two bars",
            "groove": "Two broad 6/8 breaths with a late, quiet lift into the second bar",
            "silence_budget": "Leave the final dotted quarter of each phrase empty for UI clicks",
            "loop_strategy": "Sustain the last dorian color under a one-note pickup into bar one",
            "progression_id": "modal_dor_01",
            "ensemble": "chamber",
            "primary_lead": "piano",
            "secondary_lead": "flute",
            "bass_family": "upright",
            "drum_kit": "brush",
            "groove_template": "floating",
            "melody_contour": "arch",
            "brightness": 0.46,
        },
        {
            "id": "names_in_stone",
            "title": "Names in Stone",
            "runtime_file": "music-hall.ogg",
            "role": "screen",
            "biome": None,
            "category": "emotion",
            "subcategory": "Homecoming Journey",
            "game_context": "dialogue",
            "game_function": "Hall of Escapes bed",
            "mood": "melancholic",
            "thesis": "Honor recorded escapes as quiet names, never as a victory march",
            "bpm": 56,
            "meter": "4/4",
            "key": "A",
            "mode": "aeolian",
            "voices": 8,
            "bars": 16,
            "energy": 0.18,
            "tension": 0.16,
            "seed": 2713,
            "motif": "A three-note name-cell, descending, with a long rest where a fourth note would have been",
            "harmonic_language": "Aeolian cadence that lingers on i and only glances at bVII",
            "bass_behavior": "Bowed pedal on the tonic, moving only at the loop seam",
            "groove": "Almost no grid; one soft brush on beat one of odd bars",
            "silence_budget": "Keep half of every four-bar phrase as air around the ledger text",
            "loop_strategy": "Let the last tonic hang and re-enter without a drum or harp pickup",
            "progression_id": "modal_aeo_02",
            "ensemble": "chamber",
            "primary_lead": "piano",
            "secondary_lead": "strings",
            "bass_family": "bowed",
            "drum_kit": "brush",
            "groove_template": "floating",
            "melody_contour": "descending",
            "brightness": 0.34,
        },
        {
            "id": "choose_the_descent",
            "title": "Choose the Descent",
            "runtime_file": "music-biome-select.ogg",
            "role": "screen",
            "biome": None,
            "category": "mystery",
            "subcategory": "Ancient Ruins",
            "game_context": "puzzle",
            "mood": "mysterious",
            "game_function": "biome picker bed",
            "thesis": "Hold a slightly more awake curiosity than the welcome bed, still behind the biome list",
            "bpm": 76,
            "meter": "5/4",
            "key": "E",
            "mode": "dorian",
            "voices": 12,
            "bars": 16,
            "energy": 0.28,
            "tension": 0.26,
            "seed": 2717,
            "motif": "A questioning fifth that lands late in the 5/4 bar, answered by two short falling steps",
            "harmonic_language": "Dorian field with a delayed i–IV, cadence withheld until the loop",
            "bass_behavior": "Light analog-adjacent roots that skip the extra beat in 5/4",
            "groove": "Uneven walk of 3+2 with the 2 left mostly empty",
            "silence_budget": "Keep the last two beats of each phrase open for pointer hover",
            "loop_strategy": "Carry the unanswered fifth across the seam into the first downbeat",
            "progression_id": "modal_dor_01",
            "ensemble": "chamber",
            "primary_lead": "vibes",
            "secondary_lead": "flute",
            "bass_family": "upright",
            "drum_kit": "minimal",
            "groove_template": "floating",
            "melody_contour": "call_response",
            "brightness": 0.5,
        },
        {
            "id": "open_air",
            "title": "Open Air",
            "runtime_file": "music-win.ogg",
            "role": "ending",
            "biome": None,
            "category": "emotion",
            "subcategory": "Homecoming Journey",
            "game_context": "victory",
            "game_function": "escape win bed",
            "mood": "hopeful",
            "thesis": "Release dungeon pressure into daylight without a fanfare; relief first, pride only at the edges",
            "bpm": 84,
            "meter": "4/4",
            "key": "G",
            "mode": "ionian",
            "voices": 12,
            "bars": 16,
            "energy": 0.36,
            "tension": 0.14,
            "seed": 2729,
            "motif": "A rising fourth that lands on the fifth, then steps down as if exhaling rather than crowning",
            "harmonic_language": "Ionian Romanesca that walks I–V–vi without a brass cadence; dominant only as the loop seam",
            "bass_behavior": "Warm upright roots, still leaving the last beat of the phrase open",
            "groove": "Soft brush walk that never fills; downbeats stay light",
            "silence_budget": "Keep a breath before the return so the win sting SFX can speak",
            "loop_strategy": "Resolve to I on the downbeat from a quiet V pickup, no brass stab",
            "progression_id": "classical_01",
            "ensemble": "chamber",
            "primary_lead": "flute",
            "secondary_lead": "strings",
            "bass_family": "upright",
            "drum_kit": "brush",
            "groove_template": "floating",
            "melody_contour": "arch",
            "brightness": 0.56,
        },
        {
            "id": "last_wick",
            "title": "Last Wick",
            "runtime_file": "music-lose.ogg",
            "role": "ending",
            "biome": None,
            "category": "emotion",
            "subcategory": "Haunted Childhood",
            "game_context": "defeat",
            "game_function": "death end-screen bed",
            "mood": "melancholic",
            "thesis": "Let the lantern fail in slow motion: tenderness, then the dark, never a sting reprise",
            "bpm": 54,
            "meter": "3/4",
            "key": "D",
            "mode": "aeolian",
            "voices": 8,
            "bars": 16,
            "energy": 0.32,
            "tension": 0.22,
            "seed": 2741,
            "motif": "A two-note wick: tonic, falling minor third, then a rest long enough to feel like smoke",
            "harmonic_language": "Aeolian i–bVI–i with the cadence dissolving instead of closing",
            "bass_behavior": "Bowed pedal that thins toward the loop rather than walking",
            "groove": "Waltz ghost with the third beat often missing",
            "silence_budget": "Leave whole bars of air after the motif so the death SFX can decay",
            "loop_strategy": "Re-enter from silence on the tonic; no drum pickup",
            "progression_id": "modal_aeo_02",
            "ensemble": "chamber",
            "primary_lead": "piano",
            "secondary_lead": "strings",
            "bass_family": "bowed",
            "drum_kit": "brush",
            "groove_template": "waltz",
            "melody_contour": "descending",
            "brightness": 0.3,
        },
    ]


def all_cues() -> list[Cue]:
    return screen_cues() + biome_cues()


def run_neospc(args: list[str]) -> subprocess.CompletedProcess[str]:
    command = [sys.executable, str(NEOSPC_CLI), *args]
    return subprocess.run(command, check=False, text=True, capture_output=True)


def require_ok(result: subprocess.CompletedProcess[str], label: str) -> None:
    if result.returncode == 0:
        return
    detail = (result.stdout or "") + (result.stderr or "")
    raise RuntimeError(f"{label} failed:\n{detail.strip()}")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def apply_plan(plan: dict[str, Any], cue: Cue) -> None:
    plan["id"] = cue["id"]
    plan["title"] = cue["title"]
    plan["category"] = cue["category"]
    plan["subcategory"] = cue["subcategory"]
    plan["game_function"] = cue["game_function"]
    plan["emotional_thesis"] = cue["thesis"]
    plan["voice_budget"] = cue["voices"]
    plan["voice_profile"] = {8: "legacy_8", 12: "compact_12", 16: "expanded_16"}[cue["voices"]]
    identity = plan["musical_identity"]
    identity.update(
        {
            "meter": cue["meter"],
            "bpm": cue["bpm"],
            "key": cue["key"],
            "mode": cue["mode"],
            "motif": cue["motif"],
            "harmonic_language": cue["harmonic_language"],
            "bass_behavior": cue["bass_behavior"],
            "groove": cue["groove"],
            "silence_budget": cue["silence_budget"],
            "loop_strategy": cue["loop_strategy"],
        }
    )
    for section in plan["form"]:
        section["bars"] = cue["bars"] // 4
    if cue["role"] == "portal":
        plan["form"][1]["function"] = "raise inner pulse"
        plan["form"][2]["function"] = "open a path without climax"
    elif cue["role"] == "explore":
        plan["form"][1]["function"] = "thin the motif into atmosphere"
        plan["form"][2]["function"] = "contrast by subtraction"
    plan["voice_architecture"] = {
        "core": ["quiet lead cell", "root bass", "held harmony"],
        "ensemble": ["one answering color"],
        "ornament": ["rare pickup into the loop"],
        "texture": ["room-tone pad or drone"],
        "effects": ["no stingers; music must yield to SFX"],
    }


def apply_harness(harness: dict[str, Any], cue: Cue) -> None:
    role = cue["role"]
    explore_like = role in {"explore", "screen"}
    harness["brief"].update(
        {
            "category": cue["category"],
            "game_context": cue["game_context"],
            "mood_primary": cue["mood"],
            "mood_secondary": "ominous" if role in {"explore", "portal"} else "tender",
            "energy": cue["energy"],
            "tension": cue["tension"],
            "dominance": -0.46 if explore_like else -0.28,
            "certainty": 0.6,
            "complexity": 0.3 if explore_like else 0.4,
            "voice_budget": cue["voices"],
            "loop_bars": cue["bars"],
            "seed": cue["seed"],
        }
    )
    harness["harmony"].update(
        {
            "key": KEYS.index(cue["key"]),
            "scale_id": cue["mode"],
            "progression_id": cue["progression_id"],
            "cadence_strength": 0.28 if explore_like else 0.42,
            "pedal_point": 0.48 if explore_like else 0.32,
            "secondary_dominants": 0.02,
            "modulation_rate": 0.04,
            "extension_level": 0.16,
        }
    )
    harness["form"]["architecture"] = "layered_build" if role == "portal" else "period"
    harness["melody"].update(
        {
            "contour": cue["melody_contour"],
            "density": 0.22 if explore_like else 0.32,
            "rest_ratio": 0.48 if explore_like else 0.34,
            "tessitura": 0.42,
            "range_semitones": 9 if explore_like else 12,
            "syncopation": 0.12,
            "stepwise_weight": 0.82,
        }
    )
    harness["counterpoint"]["enabled"] = False
    harness["arp"].update({"enabled": role == "portal", "density": 0.18 if role == "portal" else 0.08})
    harness["bassline"].update(
        {
            "family": cue["bass_family"],
            "preset": "root",
            "density": 0.26 if explore_like else 0.34,
            "pedal_weight": 0.55,
            "on_beat": 0.78,
        }
    )
    harness["rhythm"].update(
        {
            "meter": cue["meter"],
            "groove_template": cue["groove_template"],
            "syncopation": 0.1,
        }
    )
    drum_density = {"explore": 0.14, "screen": 0.12, "portal": 0.26, "ending": 0.16}[role]
    harness["drums"].update(
        {
            "enabled": True,
            "kit": cue["drum_kit"],
            "density": drum_density,
            "kick_weight": 0.18 if explore_like else 0.28,
            "snare_weight": 0.08 if explore_like else 0.18,
            "fill_rate": 0.04,
            "section_variation": 0.62,
        }
    )
    harness["orchestration"].update(
        {
            "ensemble_profile": cue["ensemble"],
            "primary_lead": cue["primary_lead"],
            "secondary_lead": cue["secondary_lead"],
            "layer_count": 3 if explore_like else 4,
            "doubling_rate": 0.04,
            "density_curve": "sparse_to_full" if role == "portal" else "terraced",
            "foreground_clarity": 0.48 if explore_like else 0.58,
            "ensemble_entry_threshold": 0.72,
        }
    )
    harness["texture"].update(
        {
            "pad_density": 0.42 if explore_like else 0.3,
            "drone_density": 0.28 if explore_like else 0.16,
            "fx_density": 0.08,
            "spectral_brightness": cue["brightness"],
            "space_depth": 0.62,
            "low_mid_density": 0.28,
        }
    )
    harness["mix"].update(
        {
            "lead_priority": 0.4 if explore_like else 0.52,
            "drum_presence": 0.18 if explore_like else 0.3,
            "atmosphere_weight": 0.62,
            "harmony_weight": 0.5,
            "bass_weight": 0.48,
            "reverb_send": 0.42,
            "delay_send": 0.08,
            "target_lufs": -18,
        }
    )
    harness["humanize"].update(
        {
            "timing_depth": 0.3,
            "dynamics_depth": 0.44,
            "breath_rate": 0.28,
            "phrasing_weight": 0.8,
        }
    )
    if cue["id"] in {
        "last_wick",
        "molten_explore",
        "frost_explore",
        "ash_explore",
        "obsidian_explore",
    }:
        harness["brief"]["energy"] = min(0.42, float(harness["brief"]["energy"]) + 0.1)
        harness["drums"]["density"] = min(0.3, float(harness["drums"]["density"]) + 0.08)


def init_and_compose(cue: Cue, force: bool) -> Path:
    project = SCRATCH / cue["id"]
    project.mkdir(parents=True, exist_ok=True)
    init = run_neospc(
        [
            "init",
            str(project),
            "--title",
            cue["title"],
            "--id",
            cue["id"],
            "--category",
            cue["category"],
            "--subcategory",
            cue["subcategory"],
            "--game-function",
            cue["game_function"],
            "--game-context",
            cue["game_context"],
            "--mood",
            cue["mood"],
            "--thesis",
            cue["thesis"],
            "--bpm",
            str(cue["bpm"]),
            "--meter",
            cue["meter"],
            "--key",
            cue["key"],
            "--mode",
            cue["mode"],
            "--voices",
            str(cue["voices"]),
            "--bars",
            str(cue["bars"]),
            "--energy",
            str(cue["energy"]),
            "--tension",
            str(cue["tension"]),
            "--seed",
            str(cue["seed"]),
            "--force",
        ]
    )
    require_ok(init, f"init {cue['id']}")
    plan_path = project / "composition-plan.json"
    harness_path = project / "generation-harness.json"
    plan = load_json(plan_path)
    harness = load_json(harness_path)
    apply_plan(plan, cue)
    apply_harness(harness, cue)
    write_json(plan_path, plan)
    write_json(harness_path, harness)
    validate = run_neospc(["validate", str(plan_path), str(harness_path), "--strict"])
    require_ok(validate, f"validate plan {cue['id']}")
    compose_args = ["compose", str(project)]
    if force or (project / "composition.json").exists():
        compose_args.append("--force")
    compose = run_neospc(compose_args)
    require_ok(compose, f"compose {cue['id']}")
    catalog = project / "catalog.json"
    validate_out = run_neospc(
        ["validate", str(project / "composition.json"), str(catalog), "--strict"]
    )
    require_ok(validate_out, f"validate composition {cue['id']}")
    return catalog


def review_and_export(cue: Cue, catalog: Path) -> dict[str, Any]:
    project = catalog.parent
    review_path = project / "review.json"
    review = run_neospc(["review", str(catalog), str(review_path)])
    require_ok(review, f"review {cue['id']}")
    midi = run_neospc(["export-midi", str(catalog), str(project / "midi")])
    require_ok(midi, f"midi {cue['id']}")
    bank = run_neospc(
        ["audit-bank", str(catalog), "--output", str(project / "bank-audit.json")]
    )
    require_ok(bank, f"bank audit {cue['id']}")
    report = load_json(review_path)
    tracks = report.get("tracks") or report.get("reviews") or []
    if not tracks and "status" in report:
        tracks = [report]
    status = tracks[0]["status"] if tracks else report.get("summary", {})
    return {"id": cue["id"], "review": report, "status": status}


def retry_if_rebuild(cue: Cue, force: bool) -> dict[str, Any]:
    last: dict[str, Any] | None = None
    for attempt in range(3):
        if attempt:
            cue = {**cue, "seed": cue["seed"] + 17 + attempt}
        catalog = init_and_compose(cue, force=True)
        last = review_and_export(cue, catalog)
        status = last.get("status")
        if isinstance(status, dict):
            label = next(iter(status), "")
        else:
            label = str(status)
        last["label"] = label
        if label != "rebuild":
            return last
    assert last is not None
    return last


def combined_catalog(cues: list[Cue]) -> Path:
    styles = []
    categories: dict[str, str] = {}
    for cue in cues:
        catalog = load_json(SCRATCH / cue["id"] / "catalog.json")
        for style in catalog["styles"]:
            styles.append(style)
            categories[style["category"]] = style.get("category", cue["category"])
    payload = {
        "version": "1.0.0-local",
        "project": "Dungeon Escape subconscious soundtrack",
        "voice_model": {"profiles": [8, 12, 16, 24, 32], "selected": 12},
        "categories": [{"id": key, "label": key, "count": 1} for key in sorted(categories)],
        "styles": styles,
        "license": "Neo-SPC Factory Bank, CC0-1.0. Original compositions for Dungeon Escape.",
    }
    path = SCRATCH / "catalog.json"
    write_json(path, payload)
    return path


def copy_runtime(cues: list[Cue], audio_dir: Path) -> list[str]:
    PUBLIC_AUDIO.mkdir(parents=True, exist_ok=True)
    copied: list[str] = []
    for cue in cues:
        source = audio_dir / f"{cue['id']}.ogg"
        if not source.is_file():
            raise FileNotFoundError(f"Missing render {source}")
        dest = PUBLIC_AUDIO / cue["runtime_file"]
        shutil.copy2(source, dest)
        copied.append(str(dest.relative_to(ROOT)))
        for stale in (PUBLIC_AUDIO / cue["runtime_file"].replace(".ogg", ".opus"),):
            if stale.suffix == ".opus" and stale.is_file() and dest.suffix == ".ogg":
                # Replaced chiptune opus beds.
                stale.unlink()
    return copied


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cue", action="append", help="Compose only this cue id. Repeatable.")
    parser.add_argument(
        "--skip-compose",
        action="store_true",
        help="Reuse existing cue catalogs; only rebuild the combined catalog, render, and copy.",
    )
    parser.add_argument("--skip-render", action="store_true")
    parser.add_argument("--skip-copy", action="store_true")
    parser.add_argument("--workers", type=int, default=4)
    return parser.parse_args()


def main() -> int:
    if not NEOSPC_CLI.is_file():
        print(f"Neo-SPC CLI missing: {NEOSPC_CLI}", file=sys.stderr)
        return 2
    args = parse_args()
    cues = all_cues()
    if args.cue:
        wanted = set(args.cue)
        cues = [cue for cue in cues if cue["id"] in wanted]
        missing = wanted - {cue["id"] for cue in cues}
        if missing:
            print("Unknown cue ids: " + ", ".join(sorted(missing)), file=sys.stderr)
            return 2
    SCRATCH.mkdir(parents=True, exist_ok=True)
    if not args.skip_compose:
        summaries = []
        for cue in cues:
            print(f"== {cue['id']} · {cue['title']}", flush=True)
            summaries.append(retry_if_rebuild(cue, force=True))
            print(f"   review {summaries[-1].get('label')}", flush=True)
        write_json(SCRATCH / "review-summary.json", summaries)
    catalog = combined_catalog(cues)
    if not args.skip_render:
        audio_dir = SCRATCH / "audio"
        render = run_neospc(
            ["render", str(catalog), str(audio_dir), "--workers", str(args.workers)]
        )
        require_ok(render, "render soundtrack")
        if not args.skip_copy:
            copied = copy_runtime(cues, audio_dir)
            print("copied " + ", ".join(copied))
    print(f"READY {len(cues)} cues -> {SCRATCH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
