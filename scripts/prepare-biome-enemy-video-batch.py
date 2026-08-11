#!/usr/bin/env python3
"""Prepare resumable Grok-video animation jobs for biome enemy identities."""

from __future__ import annotations

import argparse
from collections import deque
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "assets-source" / "enemies" / "biomes-v2" / "sources"
DEFAULT_OUT = ROOT / ".scratch" / "biome-enemy-animation-video-batch"
DEFAULT_SKILL = Path("X:/skills/spritesheet-expert-skill/SKILLS/spritesheet-expert")
GENERATION_SAFE_EXTENT_RATIO = 0.70
GENERATION_SAFE_EXTENT_BY_ENEMY = {
    "husk": 0.58,
    "white-eyed-shadow": 0.64,
}
BIOME_ORDER = (
    "molten", "frost", "grim", "verdant", "ash",
    "iron", "obsidian", "sunken", "fungal", "backrooms",
)


# Lighting must match the first frame for the whole clip (no re-lighting mid animation).
_LIGHT = (
    "Hold the exact first-frame lighting fixed for the whole shot: same key direction, "
    "same brightness, same shadows, same speculars; no flicker, no pulsing glow, no exposure "
    "ramps, no rim-light shifts, no global dimming or brightening"
)
_WALK_BIPED = (
    "a true fully frontal in-place walk cycle as if advancing toward the player: hip-driven "
    "complete strides with clear weight transfer, plant one foot fully before the other lifts, "
    "visible pelvis drop on contact, natural body bob, and opposite arm counter-swing; "
    "never a static torso with only twitching limbs or mirrored limb waves"
)
_WALK_QUAD = (
    "a true fully frontal in-place crawl or walk toward the player: full diagonal gait with "
    "weight shifting through the torso and spine, clear plant-and-lift steps, readable body "
    "bob, and opposite supports; never a frozen body with only waving paws"
)
_IN_PLACE_SCALE_LOCK = (
    "animate on an invisible treadmill: the creature never approaches or retreats; keep the camera and every "
    "background pixel locked; keep the creature's total pixel height, torso width, head size, center, and distance "
    "from every image boundary exactly equal to the supplied first frame in every frame; no zoom, push-in, "
    "reframing, perspective growth, or whole-body enlargement"
)

SPECS = {
    "carrion": {
        "anatomy": "quadruped", "locomotion": "crawl", "anchor": "body-bottom",
        "movement_source": "full diagonal crawl gait with torso weight transfer and plant/lift steps",
        "attack_source": "mouth and both forelimbs",
        "move": (
            f"{_WALK_QUAD}: screen-left forelimb plants with opposite hind support, pass through "
            f"the exact idle, then screen-right forelimb plants with opposite hind support; keep "
            f"spine level and total body mass stable; {_LIGHT}"
        ),
        "attack": (
            f"a threatening frontal attack: brace, open the exact existing mouth, drive head and "
            f"both forelimbs toward the player, then recover to the exact supplied pose; {_LIGHT}"
        ),
    },
    "goblin": {
        "anatomy": "biped", "locomotion": "walk", "anchor": "body-bottom",
        "movement_source": "complete hip-driven walk strides with weight transfer and opposite arm swing",
        "attack_source": "exact visible hands, claws, mouth, or held weapon",
        "move": (
            f"{_WALK_BIPED}: screen-left foot plants with screen-right arm counter-swing, exact idle "
            f"pass, then screen-right foot plants with screen-left arm counter-swing; {_LIGHT}"
        ),
        "attack": (
            f"a short threatening frontal attack using only the exact visible natural weapon or held "
            f"weapon: compact anticipation, decisive contact toward the player, exact-pose recovery; {_LIGHT}"
        ),
    },
    "ghost": {
        "anatomy": "hovering", "locomotion": "hover", "anchor": "center",
        "movement_source": "lower shroud, tendrils, membranes, or floating body segments",
        "attack_source": "the exact mouth, arms, tendrils, membranes, or forward body opening",
        "move": "an in-place frontal hover cycle driven by coordinated compression and extension of the exact lower shroud, tendrils, membranes, or floating segments; keep the head, upper body, center, and scale stable",
        "attack": "a threatening frontal convergence using the exact existing mouth, arms, tendrils, membranes, or body opening: gather inward, project toward the player, then restore the exact supplied pose",
    },
    "ratling": {
        "anatomy": "quadruped", "locomotion": "crawl", "anchor": "body-bottom",
        "movement_source": "alternating diagonal supports with tail or shell follow-through",
        "attack_source": "mouth and front limbs",
        "move": "a low fully frontal quadruped scuttle in place with opposite diagonal support groups, a neutral passing pose, and delayed tail or shell follow-through; keep the torso level",
        "attack": "a fast frontal bite or body thrust: brace the rear supports, draw the head back slightly, drive the exact mouth and front limbs toward the player, then return to the exact supplied pose",
    },
    "husk": {
        "anatomy": "biped", "locomotion": "walk", "anchor": "body-bottom",
        "movement_source": "heavy hip-driven walk strides with full weight transfer",
        "attack_source": "both arms and hands",
        "move": (
            f"a heavy {_WALK_BIPED}: long stilt legs complete full opposite strides only from the hips, "
            f"screen-left foot plants while screen-right foot stays behind, exact idle pass, then "
            f"screen-right foot plants while screen-left stays behind; keep the skull, shoulders, "
            f"ribcage, pelvis, and chest opening square to the camera with no yaw, no three-quarter "
            f"turn, no lateral cape swing, and no whole-body lean; preserve torso height and volume; {_LIGHT}"
        ),
        "attack": (
            f"a threatening two-handed frontal grab: both arms draw back below shoulder height, both "
            f"hands thrust toward the player together while remaining inside the central 70 percent "
            f"of the frame, exact-pose recovery; keep the exact hooded head, face opening, neck, torso, "
            f"leg length, and body scale unchanged; never reveal a skull face, brighten or enlarge the "
            f"head, grow hair, add fingers, or zoom the creature; {_LIGHT}"
        ),
    },
    "imp": {
        "anatomy": "winged", "locomotion": "fly", "anchor": "center",
        "movement_source": "clear bilateral wing stroke around a fixed body core",
        "attack_source": "only the two existing ring-shaped foreclaws while the compact body remains airborne",
        "move": (
            "a fully frontal in-place flight cycle driven only by the two wings: both complete wings "
            "power down together, pass through the exact idle, then both complete wings recover upward "
            "together; keep the head, face, horns, torso, pelvis, arms, hands, legs, feet, body center, "
            "and body scale visually fixed; the wing motion must be large and readable but every wing "
            f"tip stays inside the frame with clear margin; {_LIGHT}"
        ),
        "attack": (
            f"a short threatening frontal claw snap while the creature remains airborne in the exact "
            f"supplied compact hover pose: only the two existing ring-shaped foreclaws move; both retract "
            f"slightly, then snap toward the player together with mild foreshortening, then recover; "
            f"preserve the exact two tucked legs, two feet, curled tail, wing pose, head, horns, mouth, "
            f"torso, pelvis, body center, silhouette, and scale; the feet never touch a floor and the legs "
            f"never unfold or extend; never stand, squat, land, walk, grow, or become humanoid; never add, "
            f"remove, split, merge, or redesign any limb, digit, claw, tooth, wing, horn, or tail; {_LIGHT}"
        ),
    },
    "zombie-orc": {
        "anatomy": "biped", "locomotion": "walk", "anchor": "body-bottom",
        "movement_source": "heavy hip-driven orc walk with full weight transfer",
        "attack_source": "exact visible weapon, otherwise both arms and head",
        "move": (
            f"a heavy {_WALK_BIPED}: screen-left foot plants with body weight shift, exact idle pass, "
            f"then screen-right foot plants; preserve exact armor, weapon, orc face, torso scale, and "
            f"volume; {_LIGHT}"
        ),
        "attack": (
            f"a powerful frontal orc attack using the exact visible weapon without inventing equipment; "
            f"if unarmed use both arms and head together: clear anticipation, forceful contact toward "
            f"the player, exact-pose recovery; {_LIGHT}"
        ),
    },
    "spider": {
        "anatomy": "multi-legged", "locomotion": "crawl", "anchor": "body-bottom",
        "movement_source": "opposed diagonal multi-leg groups around a stable central body",
        "attack_source": "central mouth and paired front legs or pincers",
        "move": "a fully frontal in-place multi-legged scuttle: one opposed diagonal leg group advances, neutral pose, then the complementary group advances; move several legs per phase while the central body remains level",
        "attack": "a threatening frontal attack with the exact central mouth and paired front legs or pincers: brace rear legs, open or gather the attack anatomy, strike toward the player, return to the exact supplied pose",
    },
    "bone-slime": {
        "anatomy": "amorphous", "locomotion": "pulse", "anchor": "body-bottom",
        "movement_source": "localized lower-body folds and mass-preserving contractions",
        "attack_source": "exact central maw and embedded bones or appendages",
        "move": "an in-place amorphous creep cycle: a localized lower front fold advances, neutral pose, then a different lower mass contracts and advances; preserve total mass, top silhouette, center, and scale",
        "attack": "a threatening frontal maw attack: the exact embedded bones or appendages brace and gather, the existing central mouth opens and projects toward the player, then all mass returns to the exact supplied pose",
    },
    "white-eyed-shadow": {
        "anatomy": "biped", "locomotion": "walk", "anchor": "body-bottom",
        "movement_source": "two outer biped legs with two separate central hanging shadow tails",
        "attack_source": "both arms and hands",
        "first_frame_fill_enclosed_voids": True,
        "move": (
            "preserve the exact supplied bipedal shadow mass without making it humanoid: the horned V-shaped "
            "head silhouette, solid-black head-and-torso void, two white eyes, long hanging arms, ragged high "
            "shoulder membranes, exactly two outer articulated legs with their existing root-shaped feet, and "
            "exactly two separate central hanging shadow tails must remain visibly identical; animate one compact "
            "fully frontal in-place walk during the first 1.5 seconds using only the two outer legs: screen-left "
            "outer foot plants, pass through the exact supplied pose, then screen-right outer foot plants; the two "
            "central tails are not legs and only trail subtly; keep the torso square and counter-swing the long "
            "arms only a few pixels; after the cycle hold the exact supplied pose; never merge a central tail into "
            f"either leg, never remove either tail, and never smooth or round the horned head; {_LIGHT}"
        ),
        "attack": (
            "preserve every contour of the exact supplied bipedal shadow mass: keep the horned V-shaped head, "
            "solid-black head-and-torso void, two white eyes, ragged high shoulder membranes, exactly two long "
            "thin arms with the existing hands, exactly two outer legs, and exactly two separate central hanging "
            "shadow tails unchanged; during the first "
            "1.5 seconds perform one compact threatening two-handed frontal grab: both existing hands gather "
            "below the chest, both project toward the player together, then return to the exact supplied pose; "
            "hold that exact pose afterward; freeze the head, shoulders, torso, both outer legs and both central "
            "tails throughout; never add, split, thicken or branch the arms or fingers, never merge or remove the "
            f"central tails, and never create a smooth oval head, mouth, or internal anatomy; {_LIGHT}"
        ),
        "extra_preserve": [
            "continuous featureless solid-black head-and-torso void",
            "only two small white eyes",
            "two long thin arms and existing hands",
            "exactly two outer articulated legs with root-shaped feet",
            "exactly two separate central hanging shadow tails",
            "ragged shoulder membranes attached to the exact same points",
        ],
        "extra_reject": [
            "hood or robe",
            "rib cage or skeleton",
            "mouth, teeth, nose, or human facial features",
            "armor or clothing",
            "new torso markings or internal anatomy",
            "turning the shoulder membranes into wings",
            "smooth oval head",
            "removing or merging either central hanging shadow tail",
            "using either central tail as a leg",
            "branching or multiplying arms and fingers",
        ],
    },
    "carrion-stalker": {
        "anatomy": "quadruped", "locomotion": "crawl", "anchor": "body-bottom",
        "movement_source": "stalking diagonal gait with torso weight transfer and clear plant/lift",
        "attack_source": "mouth and both forward attack limbs",
        "move": (
            f"{_WALK_QUAD}: screen-left diagonal support plants while the opposite front limb clearly "
            f"lifts and advances, exact idle pass, then the complementary support phase; preserve body "
            f"height and center; {_LIGHT}"
        ),
        "attack": (
            f"a threatening frontal ambush: both forward attack limbs draw back, the exact mouth drives "
            f"toward the player while both limbs converge around it, exact-pose recovery; {_LIGHT}"
        ),
    },
}


BIOME_OVERRIDES = {
    ("frost", "bone-slime"): {
        "anatomy": "multi-legged",
        "locomotion": "crawl",
        "movement_source": "alternating groups of the exact visible clawed support limbs under a stable central mound",
        "attack_source": "the exact circular central maw and the paired front claws",
        "move": (
            "a low fully frontal crawl in place: one group of exact visible clawed support limbs "
            "plants and pulls, pass through the exact supplied pose, then the complementary group "
            "plants and pulls; keep the central mound, circular maw, dorsal spikes, and round frost "
            f"nodules level and stable; never turn the creature into a liquid blob; {_LIGHT}"
        ),
        "attack": (
            "a threatening frontal maw strike: the paired front claws pull inward and brace under the "
            "body without moving sideways; the exact circular central maw opens and projects toward "
            "the player; then all limbs and the maw return to the exact supplied pose; every claw tip "
            "must stay at least 15 percent of the frame width from every image boundary; preserve every "
            f"dorsal spike and frost nodule; {_LIGHT}"
        ),
        "extra_preserve": ["grounded mound silhouette", "all visible clawed support limbs", "circular central maw", "dorsal spikes and round frost nodules"],
        "extra_reject": ["liquid slime motion", "biped walk", "invented tail", "missing support limb", "rolling the whole body"],
    },
    ("frost", "carrion-stalker"): {
        "anatomy": "quadruped",
        "locomotion": "crawl",
        "movement_source": "the four exact planted legs in an alternating diagonal stalking gait; the two raised rear looped appendages only settle",
        "attack_source": "the exact hanging split jaw and both front legs",
        "move": (
            "complete one compact fully frontal in-place four-leg step cycle within the first half "
            "second, then hold the exact supplied pose for the entire rest of the video: reach the "
            "first diagonal foot phase almost immediately, return through the exact supplied pose, "
            "and reach the complementary diagonal foot phase before 0.45 seconds; use a strict motion mask: "
            "only the lower leg portions, ankles, and four exact planted feet below the bottom tip of "
            "the hanging jaw can move; every pixel above that horizontal line must remain visually "
            "identical to the first frame for the whole video; screen-left outer foot and screen-right "
            "inner foot make one short plant-and-lift phase, return through the exact supplied pose, "
            "then screen-right outer foot and screen-left inner foot make the complementary phase; "
            "freeze the exact ribbed back, body volume, hanging jaw, two sensory fans, and both rigid "
            "raised rear looped appendages; never grow, curl, lift, shorten, or redraw either rear loop; "
            f"never unfold or thin the torso; {_LIGHT}"
        ),
        "attack": (
            "a threatening frontal ambush: both front legs brace, the exact hanging split jaw opens "
            "and snaps toward the player, then the jaw and all four legs return to the exact supplied "
            f"pose; the sensory fans can flare only a small amount; the two rear loops only settle; {_LIGHT}"
        ),
        "extra_preserve": ["exactly four planted long legs", "two raised rear looped appendages", "hanging split jaw", "ribbed back", "two lateral sensory fans"],
        "extra_reject": ["extra planted leg", "missing rear loop", "turning a rear loop into a leg or wing", "wings", "upright biped pose", "side profile", "body roll"],
    },
    ("frost", "carrion"): {
        "anatomy": "multi-legged",
        "locomotion": "crawl",
        "movement_source": "alternating small support legs with controlled placement of both oversized foreclaws",
        "attack_source": "both oversized foreclaws and the exact circular mouth",
        "move": (
            "a fully frontal in-place scuttle: one opposed group of small support legs plants while "
            "the other group lifts, pass through the exact supplied pose, then use the complementary "
            "group; both oversized foreclaws shift only enough to carry weight; keep the round body "
            f"and mouth level; {_LIGHT}"
        ),
        "attack": (
            "a threatening frontal pincer strike: both oversized foreclaws draw outward, close toward "
            "the player around the exact circular mouth, then return to the exact supplied pose; keep "
            f"all small support legs planted and preserve the dorsal quills; {_LIGHT}"
        ),
        "extra_preserve": ["two oversized foreclaws", "all small support legs", "round dorsal body", "circular mouth", "dorsal quills"],
        "extra_reject": ["biped walk", "single-claw attack", "missing support legs", "tail", "sideways crab rotation"],
    },
    ("frost", "ghost"): {
        "anatomy": "hovering",
        "locomotion": "hover",
        "movement_source": "small staggered vertical drift of the six exact jaw pods around a fixed central eye",
        "attack_source": "all six exact jaw pods",
        "move": (
            "a fully frontal hover cycle completed once within the first 0.6 seconds and then repeated: "
            "the six exact jaw pods keep their original clustered positions and make only tiny staggered "
            "vertical offsets, pass through the exact supplied pose, then use the complementary offsets; "
            "keep the central pale eye as the same narrow horizontal slit, never a round eyeball; keep every "
            "pod close to the central smoky core, keep the cluster center and total scale fixed, never spread "
            f"the pods radially and never rotate the whole colony; {_LIGHT}"
        ),
        "attack": (
            "a threatening frontal colony bite completed once within the first 0.8 seconds and then repeated: "
            "all six exact jaw pods remain close to their original clustered positions, open slightly wider, "
            "snap inward toward the central smoky core together, then return to the exact supplied pose; keep "
            "the central pale eye as the same narrow horizontal slit, never a round eyeball; preserve all six "
            f"tether lines and never arrange the pods as a radial wheel; {_LIGHT}"
        ),
        "extra_preserve": ["exactly six jaw pods", "narrow horizontal pale eye slit", "central smoky core", "six tether lines", "original compact vertical cluster", "open black space between pods"],
        "extra_reject": ["humanoid body", "arms or legs", "missing or extra mouth", "round eyeball", "radial wheel", "flower shape", "whole-cluster spin", "whole-cluster zoom"],
    },
    ("frost", "goblin"): {
        "anatomy": "multi-legged",
        "locomotion": "crawl",
        "movement_source": "the four exact walking legs in alternating diagonal pairs while both scythe arms stay ready",
        "attack_source": "both exact scythe forearms",
        "move": (
            "a fully frontal in-place insect scuttle: one diagonal pair of the four walking legs "
            "plants and advances, pass through the exact supplied pose, then the complementary pair "
            "plants and advances; keep both scythe forearms raised with small counter-settling; keep "
            f"the head, thorax, and abdomen centered; {_LIGHT}"
        ),
        "attack": (
            "a threatening bilateral mantis strike: both exact scythe forearms draw outward for "
            "anticipation, slash inward toward the player together, then return to the exact supplied "
            f"pose; all four walking legs stay grounded; {_LIGHT}"
        ),
        "extra_preserve": ["two scythe forearms", "four walking legs", "segmented insect torso", "frontal armored head"],
        "extra_reject": ["biped walk", "wings", "single-arm swipe", "human hands", "missing walking leg"],
    },
    ("frost", "husk"): {
        "anatomy": "biped",
        "locomotion": "walk",
        "movement_source": "two long bird legs in complete alternating strides with subtle feather settling",
        "attack_source": "both hooked wing tips",
        "move": (
            f"a tall bird {_WALK_BIPED}: screen-left foot plants, pass through the exact supplied pose, "
            "then screen-right foot plants; keep the narrow beaked head and feathered torso square to "
            "the camera; both long hooked wings stay low with only subtle feather settling; preserve "
            f"body height and volume; {_LIGHT}"
        ),
        "attack": (
            "a threatening bilateral hook attack: both long wing-arms draw outward, both hooked tips "
            "rake inward toward the player together, then return to the exact supplied pose; keep the "
            f"beaked head frontal and both feet grounded; {_LIGHT}"
        ),
        "extra_preserve": ["long narrow beaked head", "two long bird legs", "two long feathered wing-arms", "two hooked wing tips"],
        "extra_reject": ["human arms or hands", "full flight", "single-wing attack", "shortened legs", "body flattening"],
    },
    ("frost", "imp"): {
        "anatomy": "winged",
        "locomotion": "fly",
        "movement_source": "synchronized bilateral strokes of the two large upper wings and two smaller lower wings",
        "attack_source": "the exact central circular mouth",
        "move": (
            "a fully frontal in-place flight cycle: both large upper wings and both smaller lower wings "
            "complete a clear synchronized downstroke, pass through the exact supplied pose, then "
            "complete a clear synchronized upstroke; keep the mouth, thorax, abdomen, antennae, body "
            f"center, and body scale fixed; keep every wing tip inside the frame; {_LIGHT}"
        ),
        "attack": (
            "a threatening frontal mouth strike: hold a subtle bilateral wing beat, draw the exact "
            "central circular mouth tight for anticipation, open it wide toward the player for contact, "
            f"then return to the exact supplied pose; keep the antennae and body scale fixed; {_LIGHT}"
        ),
        "extra_preserve": ["two large upper wings", "two smaller lower wings", "two antennae", "central circular mouth", "insect thorax and abdomen"],
        "extra_reject": ["arms or hands", "legs or feet", "single-wing flap", "standing humanoid pose", "body shrink or zoom"],
    },
    ("frost", "ratling"): {
        "anatomy": "quadruped",
        "locomotion": "crawl",
        "movement_source": "alternating oversized forehands with opposite small rear feet",
        "attack_source": "both oversized forehands and the exact open mouth",
        "move": (
            "a low fully frontal hand-over-hand crawl in place: the screen-left oversized forehand "
            "plants with the opposite small rear foot, pass through the exact supplied pose, then the "
            "screen-right forehand plants with the complementary rear foot; keep the spined back, head, "
            f"and torso level; {_LIGHT}"
        ),
        "attack": (
            "a threatening frontal reptile strike: both oversized forehands brace, the exact open mouth "
            "and blue tongue snap toward the player, then the mouth, tongue, and all four limbs return "
            f"to the exact supplied pose; {_LIGHT}"
        ),
        "extra_preserve": ["two oversized forehands", "two small rear feet", "spined back", "blue tongue", "frontal reptile head"],
        "extra_reject": ["biped stance", "human hands", "missing rear leg", "side turn", "whole-body flattening"],
    },
    ("frost", "spider"): {
        "anatomy": "multi-legged",
        "locomotion": "crawl",
        "movement_source": "alternating diagonal groups across all four exact leg pairs",
        "attack_source": "the exact circular front maw and the frontmost leg pair",
        "move": (
            "a fully frontal in-place spider scuttle: two legs from opposed pairs lift and plant while "
            "the other six support the body, pass through the exact supplied pose, then two complementary "
            "legs lift and plant; keep all four leg pairs readable; keep the central body level with no "
            f"side lean; {_LIGHT}"
        ),
        "attack": (
            "a threatening frontal spider strike: the frontmost leg pair braces and gathers, the exact "
            "circular front maw opens toward the player, then the maw and all eight legs return to the "
            f"exact supplied pose; {_LIGHT}"
        ),
        "extra_preserve": ["exactly four leg pairs", "low level body", "circular front maw", "dorsal frost growths"],
        "extra_reject": ["missing or extra leg", "moving only one body side", "body tilt", "top-down view", "biped motion"],
    },
    ("frost", "white-eyed-shadow"): {
        "anatomy": "biped",
        "locomotion": "walk",
        "movement_source": "two long legs in a normal alternating biped walk with restrained arm counter-swing",
        "attack_source": "both long arms and both hands",
        "first_frame_fill_enclosed_voids": True,
        "move": (
            f"a true fully frontal {_WALK_BIPED}: screen-left foot plants, pass through the exact supplied "
            "pose, then screen-right foot plants; allow only a small forward torso incline during each "
            "step; keep the long arms in restrained opposite counter-swing; preserve the narrow head, "
            f"two white eyes, long limbs, body height, and black interior; {_LIGHT}"
        ),
        "attack": (
            "a threatening two-handed frontal grab: both long hands draw back below the shoulders, both "
            "hands thrust toward the player together, then return to the exact supplied pose; keep the "
            f"head, two white eyes, legs, torso height, and black interior unchanged; {_LIGHT}"
        ),
        "extra_preserve": ["narrow featureless head", "only two white eyes", "two long arms", "two long legs", "continuous black interior"],
        "extra_reject": ["mouth or teeth", "extra limbs", "elastic body deformation", "comic pose", "three-quarter turn", "whole-body mirror sway"],
    },
    ("frost", "zombie-orc"): {
        "movement_source": "heavy complete biped strides with full weight transfer and restrained arm counter-swing",
        "attack_source": "both exact oversized hands",
        "move": (
            f"a heavy {_WALK_BIPED}: screen-left foot plants with full body weight, pass through the exact "
            "supplied pose, then screen-right foot plants; keep the skull face, tusks, shoulder armor, "
            f"straps, wounds, frost, torso scale, and volume identical; {_LIGHT}"
        ),
        "attack": (
            "a powerful two-hand frontal crushing grab: both oversized hands draw apart and back, both "
            "hands drive inward toward the player together for contact, then return to the exact supplied "
            f"pose; keep both feet grounded and preserve all armor and wounds; {_LIGHT}"
        ),
        "extra_preserve": ["orc identity and tusks", "two oversized hands", "shoulder armor", "leather straps", "all wounds and frost"],
        "extra_reject": ["weapon or new equipment", "single-hand attack", "missing armor", "small humanoid proportions", "body zoom"],
    },
    ("verdant", "carrion"): {
        "anatomy": "quadruped",
        "locomotion": "crawl",
        "movement_source": "alternating oversized forelegs with the two small rear feet of the squat toad body",
        "attack_source": "the exact wide toothed mouth and both oversized foreclaws",
        "move": (
            "a low fully frontal toad crawl in place: the screen-left oversized foreclaw plants with "
            "the opposite small rear foot, pass through the exact supplied pose, then the screen-right "
            "foreclaw plants with the complementary rear foot; keep the heavy belly low and the seed pods, "
            f"vines, eyes, and back silhouette fixed; {_LIGHT}"
        ),
        "attack": (
            "a threatening frontal toad bite: both oversized foreclaws brace and pull inward while the exact "
            "wide toothed mouth opens and drives toward the player, then the mouth and all four feet return "
            f"to the exact supplied pose; {_LIGHT}"
        ),
        "extra_preserve": ["squat toad anatomy", "two oversized foreclaws", "two small rear feet", "wide toothed mouth", "seed pods and back vines"],
        "extra_reject": ["biped stance", "jump", "tongue attack", "missing seed pod", "invented tail", "whole-body inflation"],
    },
    ("verdant", "goblin"): {
        "anatomy": "biped",
        "locomotion": "walk",
        "movement_source": "complete digitigrade biped strides with restrained counter-swing of both hooked foreclaws",
        "attack_source": "both exact hooked foreclaws",
        "move": (
            f"a grounded digitigrade {_WALK_BIPED}: screen-left foot plants with the opposite hooked foreclaw "
            "counter-swing, pass through the exact supplied pose, then screen-right foot plants with the "
            f"complementary arm phase; both leaf-shaped ears remain tall with only tiny settling; {_LIGHT}"
        ),
        "attack": (
            "a threatening bilateral hook attack: both exact crescent foreclaws draw outward, rake inward "
            f"toward the player together, then return to the exact supplied pose; keep both feet grounded; {_LIGHT}"
        ),
        "extra_preserve": ["two tall leaf-shaped ears", "two hooked crescent foreclaws", "digitigrade feet", "rabbit-like face"],
        "extra_reject": ["flight", "ear flapping", "human hands", "single-claw attack", "quadruped stance"],
    },
    ("verdant", "ghost"): {
        "anatomy": "hovering",
        "locomotion": "hover",
        "movement_source": "coordinated lower root-tendril compression and extension with restrained settling of both long arms and loose leaves",
        "attack_source": "both exact long root-claw hands",
        "move": (
            "a fully frontal plant-wraith hover: the lower root tendrils gather upward, pass through the exact "
            "supplied pose, then extend in a complementary arrangement; both long arms counter-settle slightly "
            f"while the face, ribbed torso, scale, and body center remain fixed; {_LIGHT}"
        ),
        "attack": (
            "a threatening two-arm root grab: both exact long root-claw hands draw back beside the torso, "
            "thrust toward the player together, then return to the exact supplied pose; lower tendrils only "
            f"brace and the human-like face stays unchanged; {_LIGHT}"
        ),
        "extra_preserve": ["human-like pale face", "two long root-claw arms", "leaf crown", "floating lower root tendrils", "ribbed plant torso"],
        "extra_reject": ["legs or feet", "walking", "mouth transformation", "single-arm swipe", "body zoom", "leaf explosion"],
    },
    ("verdant", "ratling"): {
        "anatomy": "quadruped",
        "locomotion": "crawl",
        "movement_source": "alternating oversized foreclaws with opposite small rear feet under a stable plated shell",
        "attack_source": "both oversized foreclaws and the exact pointed armored snout",
        "move": (
            "a low fully frontal armored crawl: the screen-left foreclaw plants with the opposite small rear "
            "foot, pass through the exact supplied pose, then use the complementary diagonal pair; keep every "
            f"overlapping shell plate and the pointed snout level and unchanged; {_LIGHT}"
        ),
        "attack": (
            "a threatening frontal armored shove: both oversized foreclaws brace, the exact pointed snout and "
            f"head drive toward the player, then all four feet return to the exact supplied pose; {_LIGHT}"
        ),
        "extra_preserve": ["pangolin-like plated shell", "pointed snout", "two oversized foreclaws", "two small rear feet", "all overlapping plates"],
        "extra_reject": ["rolling into a ball", "biped stance", "missing plate", "open humanoid mouth", "invented tail"],
    },
    ("verdant", "husk"): {
        "anatomy": "biped",
        "locomotion": "walk",
        "movement_source": "heavy root-bound biped strides with full hip weight transfer and restrained long-arm counter-swing",
        "attack_source": "both exact long root hands",
        "move": (
            f"a heavy root-bound {_WALK_BIPED}: screen-left foot plants with the opposite long arm counter-swing, "
            "pass through the exact supplied pose, then screen-right foot plants with the complementary arm "
            f"phase; preserve both rib cages, the central skull, vines, and dangling roots; {_LIGHT}"
        ),
        "attack": (
            "a threatening two-hand frontal root grab: both long root hands draw back below the shoulders, "
            f"thrust toward the player together, then return exactly; keep both feet planted and the central skull fixed; {_LIGHT}"
        ),
        "extra_preserve": ["central skull", "two exposed rib cages", "two long root arms", "two root-bound legs", "dangling central roots"],
        "extra_reject": ["extra skull", "missing rib cage", "single-hand attack", "elastic torso", "three-quarter turn"],
    },
    ("verdant", "imp"): {
        "anatomy": "winged",
        "locomotion": "fly",
        "movement_source": "clear synchronized bilateral strokes of the exact two leaf-like wings around a fixed insect body",
        "attack_source": "the exact fanged mandibles and paired upper grasping limbs",
        "move": (
            "a fully frontal in-place insect flight cycle: both exact leaf-like wings make a synchronized "
            "downstroke, pass through the exact supplied pose, then a synchronized upstroke; keep the head, "
            f"thorax, abdomen, all visible limbs, antennae, tail, body center, and scale fixed; {_LIGHT}"
        ),
        "attack": (
            "a threatening frontal insect bite: maintain a subtle bilateral wing beat, draw both upper grasping "
            "limbs inward as the exact fanged mandibles open and strike toward the player, then return to the "
            f"exact supplied pose; {_LIGHT}"
        ),
        "extra_preserve": ["exactly two leaf-like wings", "fanged insect head", "paired antennae", "segmented abdomen and tail", "all visible insect limbs"],
        "extra_reject": ["standing pose", "human arms", "single-wing flap", "body shrink", "missing insect limb", "new wing pair"],
    },
    ("verdant", "zombie-orc"): {
        "movement_source": "heavy complete orc strides with full hip weight transfer and asymmetric arm counter-swing",
        "attack_source": "the exact oversized screen-left plant gauntlet",
        "move": (
            f"a heavy {_WALK_BIPED}: screen-left foot plants with restrained counter-swing of the normal arm, "
            "pass through the exact supplied pose, then screen-right foot plants while the oversized plant "
            f"gauntlet counterbalances; preserve the orc face, tusks, wounds, roots, and hollow abdomen; {_LIGHT}"
        ),
        "attack": (
            "a powerful one-gauntlet frontal punch: the exact oversized screen-left plant gauntlet draws back, "
            f"drives toward the player for contact, then returns; the normal screen-right hand only braces; {_LIGHT}"
        ),
        "extra_preserve": ["orc face and tusks", "single oversized screen-left plant gauntlet", "normal screen-right hand", "hollow root-filled abdomen"],
        "extra_reject": ["second oversized gauntlet", "weapon", "two-hand hammer attack", "missing tusk", "symmetric arm redesign"],
    },
    ("verdant", "spider"): {
        "anatomy": "multi-legged",
        "locomotion": "crawl",
        "movement_source": "alternating opposed diagonal groups across all four exact thorny leg pairs",
        "attack_source": "the exact central fangs and the frontmost leg pair",
        "move": (
            "a fully frontal in-place spider scuttle: two legs from opposed pairs lift and plant while the other "
            "six support the body, pass through the exact supplied pose, then complementary legs lift and plant; "
            f"keep all eight legs readable and the leaf-armored abdomen level; {_LIGHT}"
        ),
        "attack": (
            "a threatening frontal fang strike: the frontmost leg pair braces and gathers, the exact central "
            f"fangs open and drive toward the player, then all eight legs and fangs return exactly; {_LIGHT}"
        ),
        "extra_preserve": ["exactly eight thorny legs", "clustered frontal eyes", "central fangs", "leaf-armored abdomen"],
        "extra_reject": ["missing or extra leg", "moving only one body side", "top-down view", "human face", "biped motion"],
    },
    ("verdant", "bone-slime"): {
        "anatomy": "amorphous",
        "locomotion": "pulse",
        "movement_source": "mass-preserving lower ooze contractions under the fixed bone-caged mound",
        "attack_source": "the exact circular central maw",
        "move": (
            "a low flat in-place ooze cycle: ONLY the screen-left lower perimeter folds compress as the opposite "
            "ground-hugging edge extends, pass through the exact supplied pose, then use the complementary lower-edge "
            "phase; the mound never rises or becomes upright; keep the exact two tiny short green-tipped stalks, their "
            "tip size and color, the closed circular maw, every bone-cage bar, and amber sac completely fixed; never "
            f"enlarge the stalk tips into eyeballs and never create arms, hands, feet, or a head; {_LIGHT}"
        ),
        "attack": (
            "a threatening frontal slime bite: the flat lower ooze braces while ONLY the exact circular central maw "
            "opens wider in the same location and snaps toward the player, then closes and returns exactly; keep the "
            "mound low and wide; the exact two tiny short green-tipped stalks, every bone-cage bar, and amber sac remain "
            f"fixed; never create arms, hands, feet, upright posture, or large eyeballs; {_LIGHT}"
        ),
        "extra_preserve": ["low mound silhouette", "circular central maw", "two eye stalks", "external bone cage", "amber internal sac"],
        "extra_reject": ["large eyeball", "long eye stalk", "humanoid skeleton", "arms, hands, feet, or legs", "upright posture", "rolling", "whole-body inflation", "missing bone bar"],
    },
    ("verdant", "white-eyed-shadow"): {
        "anatomy": "biped",
        "locomotion": "walk",
        "movement_source": "two crooked tree legs in a normal alternating walk with restrained settling of the single long arm and opposite branch",
        "attack_source": "the single exact long screen-left arm while the opposite horizontal branch braces",
        "move": (
            f"a crooked tree {_WALK_BIPED}: screen-left foot plants, pass through the exact supplied pose, then "
            "screen-right foot plants; allow only a slight forward torso incline and restrained settling of the "
            f"single long arm and opposite branch; preserve every large open body void; {_LIGHT}"
        ),
        "attack": (
            "treat the supplied creature as a rigid paper cutout with exactly one animated chain: only the long arm "
            "already hanging on the left side of the image moves; its visible gold elbow bends, its existing claw "
            "lifts a short distance, makes one fast downward slash beside the same left leg, and returns; motion is "
            "small, planar, and fully contained inside the frame; every other pixel of the supplied creature remains "
            "visually identical to frame one for the entire shot; the gray background remains empty with no target, "
            "incoming object, detached hand, new limb, effect, or border entry; the mask remains the same small black "
            "oval with exactly two tiny white dot eyes; no mouth, expression, anatomy change, camera motion, zoom, "
            f"foreshortening, scale change, or body deformation; {_LIGHT}"
        ),
        "extra_preserve": ["only two white eyes", "single long screen-left arm", "opposite horizontal branch", "two crooked legs", "all large open body voids"],
        "extra_reject": ["second full arm", "split or forked attack arm", "extra claw or finger", "spider-like limb cluster", "wing or shield arm", "arm crossing torso center", "large oval head", "enlarged diamond eyes", "mouth or teeth", "filled body void", "extra leg", "two-hand attack", "elastic body deformation"],
    },
    ("verdant", "carrion-stalker"): {
        "anatomy": "quadruped",
        "locomotion": "crawl",
        "movement_source": "alternating oversized foreclaws with opposite small rear feet while both dorsal membranes remain spread",
        "attack_source": "the exact open mouth and both oversized foreclaws",
        "move": (
            "a low fully frontal dragon-like stalk: the screen-left oversized foreclaw plants with the opposite "
            "small rear foot, pass through the exact supplied pose, then use the complementary diagonal pair; "
            f"keep both dorsal bone-framed membranes spread and nearly rigid; {_LIGHT}"
        ),
        "attack": (
            "a threatening frontal ambush: both oversized foreclaws gather and brace, the exact open mouth and "
            "head drive toward the player while the claws converge, then all anatomy returns exactly; the dorsal "
            f"membranes only tense slightly and never flap; {_LIGHT}"
        ),
        "extra_preserve": ["two oversized foreclaws", "two small rear feet", "two bone-framed dorsal membranes", "central armored spine", "open toothed mouth"],
        "extra_reject": ["flight", "wing flapping", "biped stance", "missing membrane rib", "extra forelimb", "top-down view"],
    },
    ("ash", "carrion"): {
        "anatomy": "quadruped",
        "locomotion": "crawl",
        "movement_source": "alternating diagonal steps of the two oversized foreclaws and two compact rear feet; the approved creature has no visible tail",
        "attack_source": "the exact frontal maw and both oversized foreclaws",
        "move": (
            "a low fully frontal armored mole crawl in place: the screen-left oversized foreclaw plants "
            "with the opposite compact rear foot, pass through the exact supplied pose, then the screen-right "
            "foreclaw plants with the complementary rear foot; keep the shell-like back, head, maw, body center, "
            f"and total scale fixed; the approved first frame has no visible tail, so never reveal or invent one; {_LIGHT}"
        ),
        "attack": (
            "a threatening frontal maul: both oversized foreclaws draw inward and brace while the exact maw "
            "opens and drives toward the player, then return to the exact supplied pose; preserve fixed scale, "
            f"a generous empty border, and no visible tail; {_LIGHT}"
        ),
        "extra_preserve": ["armored mole-like quadruped", "two oversized foreclaws", "two compact rear feet", "frontal maw", "no visible tail"],
        "extra_reject": ["visible or invented tail", "biped stance", "missing foreclaw", "shell redesign", "side turn", "source-edge contact"],
    },
    ("ash", "ratling"): {
        "anatomy": "quadruped",
        "locomotion": "crawl",
        "movement_source": "alternating diagonal supports of the exact four short legs with restrained tail follow-through",
        "attack_source": "only the exact existing mouth while both forepaws brace on the same image plane",
        "move": (
            "a low fully frontal quadruped scuttle in place: the screen-left forepaw advances with the opposite rear "
            "support, pass through the exact supplied pose, then the screen-right forepaw advances with the "
            "complementary rear support; preserve the exact face, body width, four short legs, fixed scale, and "
            f"square frontal torso while the tail follows subtly; {_LIGHT}"
        ),
        "attack": (
            "a compact threatening bite performed as a rigid flat 2D cutout: both exact forepaws remain planted "
            "and unchanged while the same head retracts only a few pixels into a low anticipation, the exact existing "
            "mouth opens vertically without changing the snout, nose, eyes, ears, whiskers, head width, or tooth "
            "layout, then snaps shut for contact and returns to the exact supplied pose; never drive the head, paws, "
            "or body toward the camera, never enlarge any anatomy, and keep the torso silhouette and total pixel "
            f"height fixed throughout; {_LIGHT}"
        ),
        "extra_preserve": ["exact rodent face and split nose", "two pale eyes", "paired whisker fans", "four short legs and paws", "fixed quadruped body width"],
        "extra_reject": ["head or body enlargement", "camera-facing lunge", "face morph", "cat-like replacement face", "nose redesign", "ear redesign", "tooth redesign", "raised forepaw", "three-quarter turn", "source-edge contact"],
    },
    ("ash", "zombie-orc"): {
        "anatomy": "biped",
        "locomotion": "walk",
        "movement_source": "short alternating steps below the fixed hips with restrained counter-settling of the two asymmetric arms",
        "attack_source": "the huge cracked screen-left fist and the smaller clawed screen-right hand converging across the rib cage on the same flat image plane",
        "move": (
            "a stationary treadmill walk performed as a flat paper-cutout rig, never a walk toward the camera: every "
            "pixel of the head, shoulders, exposed rib-cage shell, abdomen, pelvis, and background stays locked at the "
            "exact first-frame coordinates, brightness, width, and height; animate only the two leg chains below the "
            "fixed hips, with no perspective scaling: the screen-left knee bends and its same-size foot slides a short "
            "distance forward while the screen-right same-size foot stays behind, pass through the exact supplied pose, "
            "then the screen-right knee bends and its same-size foot slides forward while the screen-left stays behind; "
            "the two asymmetric arms may rotate only a few pixels at the shoulder but their exact lengths, silhouettes, "
            "and hand sizes never change; the top of the head and both shoulder tips must remain on the same exact image "
            f"coordinates in every frame; no body bob, translation, growth, approach, or foreshortening; {_LIGHT}"
        ),
        "attack": (
            "a threatening bilateral flat 2D crushing clamp across the chest: the huge cracked fist on screen-left "
            "draws only a short distance outward while the smaller clawed screen-right hand braces, then both existing "
            "arms sweep inward together on the same image plane and cross once in front of the exposed rib-cage shell "
            "for contact before returning exactly; keep both feet planted and keep the head, tusks, shoulders, rib "
            "cage, abdomen, pelvis, arm lengths, fist dimensions, total pixel height, center, and empty border fixed; "
            f"never thrust either hand, head, or body toward the camera; {_LIGHT}"
        ),
        "extra_preserve": ["exact gray orc head and tusks", "exposed rib-cage shell", "huge cracked screen-left arm and fist", "thin screen-right arm and smaller clawed hand", "two heavy legs and feet"],
        "extra_reject": ["walk toward camera", "body zoom", "giant foreground hand", "fist enlargement", "cropped hand or foot", "open redesigned mouth", "brighter replacement skin", "symmetrical arm redesign", "three-quarter turn", "source-edge contact"],
    },
    ("ash", "carrion-stalker"): {
        "anatomy": "quadruped",
        "locomotion": "crawl",
        "movement_source": "alternating diagonal knuckle supports of the two exact long forearms and two compact rear legs",
        "attack_source": "both exact long forearms and same-size knuckled hands in a bilateral downward ground smash",
        "move": (
            "a fully frontal ape-like knuckle-walk on a stationary treadmill, rendered as a flat 2D rig: keep the head, "
            "ribbed muzzle, shoulders, chest, pelvis, pixel height, and body center fixed; phase A bends the screen-left "
            "elbow and lifts its same-size knuckled hand a short distance while the opposite rear foot advances, pass "
            "through the exact supplied pose, then phase B uses the screen-right forearm and complementary rear foot; "
            "both hands stay below the jaw and on the same image plane, both shoulders remain level, and every claw "
            f"keeps its original size; no lunge, foreshortening, yaw, side lean, or camera approach; {_LIGHT}"
        ),
        "attack": (
            "a compact threatening bilateral ground smash on the same flat image plane: both exact long elbows bend "
            "together so the two same-size knuckled hands rise only to lower-chest height for anticipation, then both "
            "forearms extend downward together and the two knuckles strike the fixed ground line for contact before "
            "returning exactly; lock the ribbed face, eyes, mouth, shoulders, torso, pelvis, rear legs, total pixel "
            f"height, center, hand dimensions, and empty border; no forward grab, zoom, mouth enlargement, or crop; {_LIGHT}"
        ),
        "extra_preserve": ["exact ribbed ape-like muzzle", "two pale eyes", "two extremely long furred forearms", "two same-size knuckled hands", "two compact bent rear legs and feet", "square frontal shoulders"],
        "extra_reject": ["three-quarter or side turn", "camera-facing lunge", "giant foreground hand", "hand or finger redesign", "face or mouth enlargement", "body zoom", "one-arm-only motion", "raised shoulder tilt", "cropped hand or foot", "source-edge contact"],
    },
    ("ash", "husk"): {
        "movement_source": "complete heavy biped strides with restrained counter-swing of both elongated arms",
        "attack_source": "both exact elongated three-finger hands in one bilateral inward X-shaped claw slash",
        "move": (
            f"a heavy {_WALK_BIPED}: screen-left foot plants with the opposite elongated arm counter-swing, "
            "pass through the exact supplied pose, then screen-right foot plants with the complementary arm "
            f"phase; preserve the shell-like skull, long arms, torso height, and fixed scale; {_LIGHT}"
        ),
        "attack": (
            "a locked-camera flat 2D bilateral inward X-shaped claw slash: both exact elongated hands begin low beside "
            "the thighs and move only inside the existing silhouette plane, sweep diagonally inward together, and the "
            "two compact three-finger claw bundles cross once in a sharp X directly centered in front of the rib cage "
            "for contact, then return to the exact supplied pose; never move either hand toward the camera in depth; "
            "never spread the arms outward into a T pose; keep both feet planted, the shell-like skull unchanged, "
            "and total pixel height, shoulder width, head size, framing, center, and empty border exactly fixed in every "
            "frame; absolutely no camera zoom and no subject enlargement or recentering; preserve exactly the same three "
            "long claw fingers on each hand as the "
            "first frame: keep each three-finger bundle compact and never fan fingers sideways or create a new digit; "
            "every fingertip must stay at least "
            f"15 percent of the frame width from every image boundary; {_LIGHT}"
        ),
        "extra_preserve": ["shell-like skull", "two elongated arms and hands", "exactly three long claw fingers per hand", "two planted legs", "tall biped silhouette"],
        "extra_reject": ["single-hand attack", "arms spread outward", "T pose", "cropped hand", "source-edge contact", "body zoom", "extra finger or digit", "fanned multi-finger cluster", "three-quarter turn"],
    },
    ("ash", "imp"): {
        "anatomy": "winged",
        "locomotion": "fly",
        "movement_source": "synchronized bilateral strokes of the exact two feathered wings around a fixed owl-like body",
        "attack_source": "both exact existing talons while both wings make only a subtle bilateral beat",
        "move": (
            "a fully frontal in-place owl-like flight cycle: both exact feathered wings make a synchronized "
            "downstroke, pass through the exact supplied pose, then a synchronized upstroke; keep the owl mask, "
            f"black eyes, torso, both talons, body center, and body scale fixed; {_LIGHT}"
        ),
        "attack": (
            "a threatening frontal double-talon strike: both existing talons draw compactly upward beneath the "
            "body, thrust toward the player together, then return to the exact supplied pose; the two wings make "
            "only a subtle synchronized beat; preserve the exact closed owl mask and black eyes at every instant; "
            f"keep the creature fully inside a generous empty border and at fixed scale; {_LIGHT}"
        ),
        "extra_preserve": ["exact owl-like mask", "only two black eyes", "exactly two feathered wings", "exactly two existing talons", "fixed flying body"],
        "extra_reject": ["ring or circular appendage", "tendril", "new hand", "new limb", "open mammal mouth", "bright eye", "face morph", "body zoom", "source-edge contact"],
    },
    ("ash", "spider"): {
        "anatomy": "multi-legged",
        "locomotion": "crawl",
        "movement_source": "alternating opposed groups across the exact four walking-leg pairs while the two huge toothed front pincers and raised segmented rear appendage stay stable",
        "attack_source": "both exact huge toothed front pincers",
        "move": (
            "the armored scorpion-spider runs briskly in place on an invisible treadmill, fully frontal, with obvious "
            "large jointed leg pumping readable at thumbnail size: during phase A four thin side walking legs lift high "
            "and fold at their knees while the opposite four extend and plant; pass once through the exact supplied "
            "pose; during phase B the other four thin side walking legs lift high and fold while the first four extend "
            "and plant; show two unmistakably different support patterns, not tiny twitches; the exact two huge toothed "
            "front pincers remain aimed forward and never act as feet, while the single raised segmented rear appendage "
            "stays upright with only minimal follow-through; preserve the exact armored body, facial mouth, all eight "
            "thin walking legs, both toothed pincers, fixed subject scale, framing, and empty border; no body tilt, zoom, "
            f"side sway, translation, or top-down view; {_LIGHT}"
        ),
        "attack": (
            "a threatening bilateral pincer bite: both exact huge toothed front pincers draw outward, close "
            "toward the player together, then return to the exact supplied pose; all eight walking legs remain "
            f"grounded and the raised segmented rear appendage stays fixed; {_LIGHT}"
        ),
        "extra_preserve": ["exactly four walking-leg pairs", "two huge toothed front pincers", "single raised segmented rear appendage", "frontal low crawler body"],
        "extra_reject": ["static or barely twitching legs", "moving only one body side", "missing or extra walking leg", "body tilt", "top-down view", "side sway", "tail redesign"],
    },
    ("ash", "goblin"): {
        "anatomy": "biped",
        "locomotion": "walk",
        "movement_source": "only the exact two long bird legs performing a grounded alternating frontal walk while both long feathered arms remain compact beside the torso",
        "attack_source": "only the exact hooked three-claw hand on the screen-right arm",
        "move": (
            "a restrained fully frontal in-place biped walk driven from the hips and knees: the screen-left bird foot "
            "plants slightly forward while the screen-right foot stays behind, pass once through the exact supplied "
            "pose, then the screen-right foot plants slightly forward while the screen-left stays behind; both long "
            "feathered arms remain hanging compactly beside the torso with only tiny opposite counter-settling; lock "
            "the exact feathered head, closed bone beak mask, two pale eyes, ribbed chest, arm length, hand size, leg "
            "length, body scale, center, and frontal silhouette; never flap, spread, enlarge, foreshorten, or redesign "
            f"either arm or hand; keep every claw inside a generous empty border; {_LIGHT}"
        ),
        "attack": (
            "treat the supplied creature as a rigid paper cutout with exactly one animated chain: only the feathered "
            "arm already hanging on the screen-right side bends at its existing elbow; its same hooked three-claw hand "
            "draws a short distance inward below the rib cage and makes one fast downward rake in front of the same "
            "screen-right leg, then returns; the hand never rises above the waist and never grows or turns toward the "
            "camera; every pixel of the other arm, closed bone beak mask, two pale eyes, feathered head, ribbed chest, "
            "both legs, and both feet remains visually identical to frame one; keep fixed scale, center, and frontal "
            f"silhouette; no open beak, mouth, human finger, spread arms, wing pose, zoom, or border contact; {_LIGHT}"
        ),
        "extra_preserve": ["closed bone beak mask", "two pale eyes", "two long feathered arms", "one hooked three-claw hand per arm", "two long bird legs and feet", "ribbed chest"],
        "extra_reject": ["open mouth or tongue", "human hand or finger", "giant hand", "bilateral attack", "T pose", "wing flap", "spread arms", "arm above waist", "arm foreshortening", "perspective enlargement", "extra claw or digit", "missing foot", "three-quarter turn", "body zoom", "source-edge contact"],
    },
    ("ash", "bone-slime"): {
        "anatomy": "amorphous",
        "locomotion": "pulse",
        "movement_source": "mass-preserving contractions only in the lower ooze perimeter beneath the fixed bone-studded mound and exact central circular maw",
        "attack_source": "only the exact circular central maw",
        "move": (
            "a low in-place ooze cycle: the screen-left lower slime folds compress while the opposite lower edge "
            "extends, pass through the exact supplied pose, then use the complementary lower folds; every bone "
            "and the exact circular central maw stay fixed on the same headless mound; never create a head, eyes, "
            f"second face, second mouth, limbs, or articulated bone appendages; preserve total mass and scale; {_LIGHT}"
        ),
        "attack": (
            "a threatening frontal slime bite: the lower ooze braces while only the exact circular central maw "
            "opens toward the player, then closes and returns to the exact supplied pose; preserve the headless "
            f"bone-studded mound with no eyes, no new face, no limbs, and a generous empty border; {_LIGHT}"
        ),
        "extra_preserve": ["headless low slime mound", "single circular central maw", "all fixed embedded bones", "no eyes", "no limbs"],
        "extra_reject": ["new head", "eye", "second mouth", "second face", "arm or leg", "spider-like bone appendage", "whole-body inflation", "body zoom"],
    },
    ("ash", "white-eyed-shadow"): {
        "anatomy": "biped",
        "locomotion": "walk",
        "movement_source": "two long legs in a normal alternating biped walk with subtle torso incline and restrained counter-settling of the asymmetric arms",
        "attack_source": "the single exact extra-long screen-right clawed arm while the shorter screen-left arm braces across the chest",
        "first_frame_fill_enclosed_voids": True,
        "move": (
            f"a true fully frontal {_WALK_BIPED}: screen-left foot plants, pass through the exact supplied pose, "
            "then screen-right foot plants; use clear knee, hip, and foot pose changes with only a small forward "
            "torso incline; the shorter screen-left arm and extra-long screen-right arm counter-settle subtly; "
            f"preserve the exact featureless black face with only two white eyes and fixed body proportions; {_LIGHT}"
        ),
        "attack": (
            "a threatening one-arm frontal claw thrust: the single exact extra-long screen-right arm draws back "
            "compactly, then the same one existing hand and its exact original finger count drive straight toward "
            "the camera lens with strong controlled foreshortening so the forearm appears shorter, never sideways; "
            "the hand must remain one compact hand attached to one continuous arm and may never split into a fan, "
            "duplicate, sprout a second claw, or spread across the chest; then it returns exactly; the shorter "
            "screen-left arm remains braced across the chest; lock the exact "
            "featureless black face with exactly two small white eyes and no other facial mark; keep both feet "
            f"planted, total body scale fixed, and every claw inside a generous empty border; {_LIGHT}"
        ),
        "extra_preserve": ["featureless black face", "only two white eyes", "shorter screen-left arm across chest", "single extra-long screen-right clawed arm", "two long walking legs"],
        "extra_reject": ["mouth or teeth", "extra eye", "second long arm", "extra claw", "split or fanned hand", "finger duplication", "sideways arm extension", "elastic torso", "prayer pose", "comic shrug", "arm-only idle", "body zoom", "source-edge contact"],
    },
    ("iron", "carrion"): {
        "anatomy": "quadruped", "locomotion": "crawl",
        "movement_source": "alternating diagonal steps of the two huge armored forepaws and two compact rear feet beneath the exact plated boar body",
        "attack_source": "the exact boar snout, paired tusks, and both huge armored forepaws",
        "move": (
            f"a heavy fully frontal iron boar {_WALK_QUAD}: one huge forepaw and the opposite compact rear foot plant, "
            "pass through the exact supplied pose, then the complementary pair plant; preserve the plated spine, both "
            f"tusks, boar snout, four feet, level body, and fixed scale; {_LIGHT}"
        ),
        "attack": (
            "a threatening frontal boar maul: both huge forepaws brace, the exact snout and paired tusks draw back "
            f"slightly and drive toward the player, then all four feet and the head return exactly; {_LIGHT}"
        ),
        "extra_preserve": ["plated boar head and snout", "paired tusks", "two huge armored forepaws", "two compact rear feet", "spiked plated back"],
        "extra_reject": ["biped stance", "invented tail", "missing tusk", "rolling into a ball", "side turn", "top-down view"],
    },
    ("iron", "goblin"): {
        "anatomy": "biped", "locomotion": "walk",
        "movement_source": "complete goblin biped strides with restrained opposite-arm counter-swing beneath the fixed wedge helmet",
        "attack_source": "both exact three-clawed hands and the existing open mouth",
        "move": (
            f"a grounded fully frontal {_WALK_BIPED}: screen-left foot plants with opposite arm counter-swing, exact "
            "idle pass, then screen-right foot plants; preserve the wedge helmet, cheek guards, two hands, two feet, "
            f"open mouth, and fixed body scale; {_LIGHT}"
        ),
        "attack": (
            "a compact threatening two-claw rake: both exact hands gather beside the torso and slash inward together "
            f"while the existing mouth snarls, then both hands and feet return exactly; {_LIGHT}"
        ),
        "extra_preserve": ["wide wedge helmet", "paired metal cheek guards", "two three-clawed hands", "two wrapped feet", "existing open mouth"],
        "extra_reject": ["weapon", "single-hand attack", "helmet morph", "extra claw", "missing foot", "three-quarter turn"],
    },
    ("iron", "ghost"): {
        "anatomy": "hovering", "locomotion": "hover", "anchor": "bbox-bottom",
        "movement_source": "organic contraction and release only through the lower twisted shroud while the hood, bindings, and two long hands remain frontal",
        "attack_source": "only the single twisted lower shroud while the hood, five bindings, arms, and hands remain fixed",
        "move": (
            "a fully frontal in-place hover: the lower twisted shroud coils upward, passes through the exact supplied "
            "pose, then lengthens and uncoils; both long hands counter-settle slightly without alternating side sway; "
            f"preserve every iron binding, hooded skull, body height, and fixed scale; {_LIGHT}"
        ),
        "attack": (
            "a threatening lower-shroud lash: the single twisted lower shroud compresses into a tight coil, snaps into "
            f"one compact S-shaped contact pose, then returns exactly; the hood, five bindings, both arms, and both hands stay fixed; {_LIGHT}"
        ),
        "attack_provider_action": (
            "one compact fully frontal lower-shroud attack; only the single twisted lower shroud changes pose: "
            "short vertical coil for anticipation, compact S-shaped lash for contact, then exact idle; keep the hooded "
            "skull, five iron bindings, two arms, two hands, body width, hover center, and scale unchanged"
        ),
        "extra_preserve": ["hooded skull", "two exact long clawed hands", "five iron body bindings", "single twisted lower shroud"],
        "extra_reject": ["biped legs", "walking", "missing binding", "single-hand attack", "new face"],
    },
    ("iron", "ratling"): {
        "anatomy": "quadruped", "locomotion": "crawl",
        "movement_source": "alternating diagonal steps across the exact four rodent limbs beneath the fixed radial iron quills",
        "attack_source": "the exact rodent head, front teeth, and paired foreclaws",
        "move": (
            f"a low fully frontal porcupine-rat {_WALK_QUAD}: one foreclaw and opposite rear foot plant, exact idle "
            "pass, then the complementary pair plant; keep all radial iron quills rigid and the torso level; "
            f"preserve four limbs, snout holes, teeth, and fixed scale; {_LIGHT}"
        ),
        "attack": (
            "a threatening frontal rodent lunge: both foreclaws brace, the exact snout and front teeth drive toward "
            f"the player, then the head and all four limbs return while the quills remain fixed; {_LIGHT}"
        ),
        "move_provider_action": (
            "one compact fully frontal in-place four-leg crawl cycle with exact quadrant discipline; keep all four "
            "existing rodent legs visible and attached, each paw always below the body and on its original side; phase A "
            "subtly advances the screen-left forepaw while the screen-right rear paw flexes in place, then exact idle; "
            "phase B does the opposite pair; feet never rise above the lower edge of the snout and no limb crosses the "
            "centerline, face, mouth, or torso; freeze the radial iron quills, head, four-hole snout, teeth, body width, "
            "center, and scale; no tail of any length, no fifth appendage, no rear limb drawn as a tail, no hidden paw, "
            "no side turn, no body sway, and no mirror-flip"
        ),
        "extra_preserve": ["four rodent limbs", "radial iron quills", "four-hole snout", "two front teeth", "low frontal body"],
        "extra_reject": ["biped stance", "quill projectile", "missing limb", "invented tail", "side turn", "top-down view"],
    },
    ("iron", "husk"): {
        "anatomy": "biped", "locomotion": "walk",
        "movement_source": "complete stilt-legged biped strides with restrained counter-swing of both huge four-finger hands",
        "attack_source": "the exact skull jaw and mouth while both huge hands remain fixed",
        "move": (
            "a rigid 2D paper-cutout walk in place, never a walk toward the camera: keep the skull, rib cage, "
            "shoulder plate, hip plate, hand sizes, torso pixel box, and hip position identical to the first frame; "
            "only the two stilt legs exchange poses below the fixed hips, first screen-left knee forward and then "
            "screen-right knee forward, with feet sliding only a few pixels vertically and no foreshortening; the "
            "long arms may counter-swing by bending at the elbows but their hands never grow or move toward the "
            f"viewer; exact idle between the two leg phases; {_IN_PLACE_SCALE_LOCK}; {_LIGHT}"
        ),
        "attack": (
            "a threatening rigid 2D jaw strike: the exact skull tips back a few pixels for anticipation, then the "
            "existing jaw opens into one sharp frontal scream-bite and returns exactly; both huge hands, long arms, "
            "rib cage, shoulders, hips, and both stilt legs remain a pixel-locked rigid plate; the skull and jaw keep "
            f"their exact first-frame width and never approach the viewer; {_IN_PLACE_SCALE_LOCK}; {_LIGHT}"
        ),
        "move_provider_action": (
            "one compact fully frontal rigid 2D stilt-leg walk in place; only the two legs exchange supported poses "
            "below fixed hips: screen-left knee forward, exact idle, then screen-right knee forward; keep the skull, "
            "rib cage, shoulder plate, hip plate, torso pixel box, hip position, two arms, and both four-finger hand "
            "sizes unchanged; feet stay near the same baseline; no approach, body zoom, foreshortening, or hand growth"
        ),
        "attack_provider_action": (
            "one compact threatening fully frontal rigid 2D jaw strike; exact idle, the existing skull and jaw tip "
            "back only a few pixels, the same jaw opens sharply for one scream-bite contact, then exact idle; preserve "
            "skull width, head scale, tooth layout, body scale, and center; both huge hands, arms, rib cage, shoulders, "
            "hips, and both stilt legs remain a pixel-locked rigid plate; no hand attack, giant palms, zoom, or depth motion"
        ),
        "extra_preserve": ["skull face", "rib cage", "wide shoulder plate", "wide hip plate", "two huge four-finger hands", "two stilt legs"],
        "extra_reject": ["single-hand swipe", "extra finger", "cropped hand", "T pose", "body zoom", "three-quarter turn", "hands toward camera", "giant palms", "walk toward camera"],
    },
    ("iron", "imp"): {
        "anatomy": "winged", "locomotion": "fly", "anchor": "bbox-bottom",
        "movement_source": "synchronized bilateral beats of the exact two torn metal-framed wings around a fixed bat body",
        "attack_source": "the exact open bat mouth and both existing talons with a subtle bilateral wing beat",
        "move": (
            "a fully frontal in-place bat flight cycle: both exact torn metal-framed wings make one synchronized "
            "downstroke, pass through the exact supplied pose, then one synchronized upstroke; keep body, head, both "
            f"talons, scale, and center fixed; {_LIGHT}"
        ),
        "attack": (
            "a threatening frontal bite-and-talon strike: both existing talons gather beneath the body and thrust "
            "toward the player as the exact existing mouth opens wider; both wings make only a subtle synchronized "
            "beat, then mouth and talons return exactly; the bat torso, head outline, wing span, wing-tip positions, "
            f"and body center stay the exact supplied size; {_IN_PLACE_SCALE_LOCK}; {_LIGHT}"
        ),
        "extra_preserve": ["exactly two torn metal-framed wings", "bat head and open mouth", "exactly two talons", "fixed flying body"],
        "extra_reject": ["alternating one-wing flap", "new arm", "new leg", "missing wing panel", "body shrink", "body zoom", "side turn"],
    },
    ("iron", "zombie-orc"): {
        "anatomy": "biped", "locomotion": "walk",
        "movement_source": "heavy armored orc strides while the exact rusty machete remains in the screen-left hand",
        "attack_source": "the exact rusty machete in the screen-left hand",
        "move": (
            f"a heavy fully frontal {_WALK_BIPED}: screen-left foot plants while the machete arm stays braced low, "
            "exact idle pass, then screen-right foot plants with restrained free-hand counter-swing; preserve the orc "
            f"face, tusks, rusty armor, machete, and fixed scale; {_IN_PLACE_SCALE_LOCK}; {_LIGHT}"
        ),
        "attack": (
            "a powerful one-weapon diagonal machete chop: the exact screen-left machete draws back close to the shoulder, "
            "slashes diagonally inward across the torso plane for contact, then returns low; the free screen-right hand "
            f"braces and both armored feet stay planted; {_LIGHT}"
        ),
        "extra_preserve": ["orc face and tusks", "rusty iron armor", "single machete in screen-left hand", "empty screen-right hand", "two armored feet"],
        "extra_reject": ["second weapon", "weapon changing shape", "bare unarmored torso", "fist-only attack", "missing tusk", "cropped machete"],
    },
    ("iron", "spider"): {
        "anatomy": "multi-legged", "locomotion": "crawl",
        "movement_source": "opposed diagonal groups across all four exact metal leg pairs around a stable armored abdomen",
        "attack_source": "the exact central maw and the paired oversized front claw-legs",
        "move": (
            "a fully frontal in-place iron spider scuttle: two legs from opposed pairs lift and plant while the other "
            "six support the body, exact idle pass, then complementary legs lift and plant; all eight leg tips must "
            f"change support clearly while the armored abdomen stays level and fixed in scale; {_LIGHT}"
        ),
        "attack": (
            "a threatening frontal maw strike: the paired oversized front claw-legs gather inward as the exact central "
            f"maw opens toward the player, then all eight legs and the maw return exactly; {_LIGHT}"
        ),
        "extra_preserve": ["exactly four metal leg pairs", "three-piece armored abdomen", "central eye cluster", "central maw", "paired oversized front claw-legs"],
        "extra_reject": ["missing or extra leg", "moving only one side", "body tilt", "top-down view", "abdomen redesign", "biped motion"],
    },
    ("iron", "bone-slime"): {
        "anatomy": "amorphous", "locomotion": "pulse",
        "movement_source": "mass-preserving contractions only along the lower black ooze perimeter beneath the fixed bone maw and five iron nodules",
        "attack_source": "only the exact central horizontal bone maw",
        "move": (
            "a low in-place iron-slime cycle: the screen-left lower ooze edge compresses as the opposite edge extends, "
            "exact idle pass, then the complementary lower-edge phase; preserve total mass, the central skull, all fixed "
            "bones, five iron nodules, and exact single maw; keep the upper dome and mouth completely rigid and vary "
            f"only the bottom 20 percent of the ooze silhouette; {_IN_PLACE_SCALE_LOCK}; {_LIGHT}"
        ),
        "attack": (
            "a threatening frontal slime bite: only the exact central horizontal bone maw opens moderately wider "
            "without becoming taller than the supplied upper dome; the outer ooze silhouette, central skull, bones, "
            "and five nodules remain pixel-locked while the lower ooze braces, then the maw closes exactly; "
            f"{_IN_PLACE_SCALE_LOCK}; {_LIGHT}"
        ),
        "move_provider_action": (
            "one compact fully frontal rigid 2D low-ooze crawl cycle: exact idle; phase A changes only the bottom 15 "
            "percent, retracting the screen-left puddle lip 18 pixels inward while the screen-right puddle lip extends "
            "18 pixels outward along the same ground line; exact idle; phase B reverses those two bottom puddle lips; "
            "the upper 85 percent including the dome, five iron nodules, central skull, radial bones, and horizontal maw "
            "is a pixel-locked rigid plate; total height, center, mass, and ground contact remain unchanged; sharp readable edge plateaus"
        ),
        "attack_provider_action": (
            "one compact threatening fully frontal rigid 2D horizontal bone-maw snap: exact idle; anticipation closes "
            "the existing horizontal upper and lower bone teeth toward the same fixed center by a few pixels; contact "
            "opens that same horizontal maw only 18 pixels vertically while keeping its original width and oval "
            "orientation; exact idle recovery; the outer black ooze mound, upper dome, central skull, all five iron "
            "nodules, radial bone lengths, bottom puddle perimeter, total height, center, and ground line remain a "
            "pixel-locked rigid plate; sharp readable closed and open plateaus"
        ),
        "extra_preserve": ["single horizontal bone maw", "central skull", "fixed radial bones", "exactly five iron nodules", "headless low ooze mound"],
        "extra_reject": ["new head", "new eye", "second mouth", "arm or leg", "detached nodule", "whole-body inflation", "body zoom"],
    },
    ("iron", "white-eyed-shadow"): {
        "anatomy": "biped", "locomotion": "walk",
        "movement_source": "normal alternating biped strides with subtle torso incline and restrained long-arm counter-swing",
        "attack_source": "both exact long clawed hands in one bilateral low frontal maul",
        "move": (
            f"an uncanny but anatomically normal fully frontal {_WALK_BIPED}: screen-left foot plants, exact idle pass, "
            "then screen-right foot plants; use clear knee and hip changes with only a subtle torso incline and restrained "
            f"opposite long-arm counter-swing; preserve exactly two white eyes and no mouth; {_LIGHT}"
        ),
        "attack": (
            "a threatening fully frontal two-hand maul inspired by the accepted husk timing: both long arms draw back "
            "low and slightly outward with bent elbows, then both exact same-size clawed hands slash inward and down "
            "across the torso plane for one bilateral contact before returning exactly; shoulders stay level and both "
            "feet stay planted; preserve the featureless face and exactly two white eyes; no mouth, no prayer pose, no "
            f"hand growth, and no motion toward the camera; {_IN_PLACE_SCALE_LOCK}; {_LIGHT}"
        ),
        "attack_provider_action": (
            "one compact threatening fully frontal rigid 2D bilateral two-hand maul with exact idle recovery: both "
            "existing long arms bend at shoulders and elbows, both exact same-size clawed hands draw back low and "
            "slightly outward for anticipation, then slash inward and downward together across the torso plane for one "
            "clear contact; keep both hands below shoulder height and on the same flat image plane; both feet, pelvis, "
            "torso, shoulders, featureless black face, and exactly two white eyes remain stable; no mouth, prayer pose, "
            "comedy, extra limb, three-quarter turn, zoom, perspective growth, or motion toward the camera"
        ),
        "extra_preserve": ["exactly two white eyes", "featureless black face", "two armored shoulders", "two long arms and hands", "two walking legs"],
        "extra_reject": ["mouth or teeth", "extra eye", "split hand", "extra arm", "prayer pose", "comic shrug", "body zoom", "three-quarter turn"],
    },
    ("iron", "carrion-stalker"): {
        "anatomy": "quadruped", "locomotion": "crawl",
        "movement_source": "alternating diagonal steps of the exact four clawed feet beneath the fixed ribbed metal body and paired horn blades",
        "attack_source": "the exact central mouth and both paired lateral horn-blade sets in a frontal charge",
        "move": (
            f"a heavy fully frontal horned-beast {_WALK_QUAD}: one foreclaw and opposite rear foot plant, exact idle pass, "
            "then the complementary pair plant; keep both paired horn-blade sets symmetric, body level, and all four "
            f"feet readable; preserve fixed scale and generous empty side margins; {_IN_PLACE_SCALE_LOCK}; {_LIGHT}"
        ),
        "attack": (
            "a threatening stationary horn-and-maw attack: all four feet brace, the exact head dips a few pixels while "
            "the central mouth opens wide and both paired lateral horn-blade sets make only a short downward jerk, then "
            "the mouth, head, and horns return exactly; the ribbed torso and every horn keep their supplied pixel length "
            f"and never drive toward the camera; {_IN_PLACE_SCALE_LOCK}; {_LIGHT}"
        ),
        "extra_preserve": ["ribbed metal quadruped body", "exact four clawed feet", "central horned head and mouth", "paired upper horn blades", "paired lower horn blades"],
        "extra_reject": ["biped stance", "missing horn", "cropped horn", "source-edge contact", "top-down view", "side turn", "invented tail"],
    },
    ("molten", "carrion"): {
        "movement_source": "front-facing diagonal quadruped gait with no visible tail",
        "move": (
            f"{_WALK_QUAD}: screen-left forelimb advances with the opposite hind support, exact idle "
            f"pass, then screen-right forelimb advances with the complementary hind support; keep the "
            f"face, skull plate, shoulders, spine, and torso aimed squarely at the player throughout; "
            f"the approved identity has no visible tail, so never reveal or invent one; {_LIGHT}"
        ),
        "extra_preserve": ["square frontal skull plate and torso", "no visible tail"],
        "extra_reject": ["visible or invented tail", "head or torso rotating to three-quarter view"],
    },
    ("molten", "goblin"): {
        "anatomy": "biped",
        "locomotion": "walk",
        "movement_source": "complete hip-driven walk strides; head membranes are ears, not wings",
        "attack_source": "both clawed hands and the exact existing mouth",
        "move": (
            f"a grounded {_WALK_BIPED}: screen-left foot plants with restrained screen-right arm "
            f"counter-swing, exact idle pass, then screen-right foot plants with restrained screen-left "
            f"arm counter-swing; large membranous ears stay attached only to the head with tiny settling; "
            f"never create back wings or flight; {_LIGHT}"
        ),
        "attack": (
            f"a short threatening grounded frontal attack with both exact clawed hands: compact "
            f"anticipation, both claws drive toward the player, exact-pose recovery; head membranes are "
            f"ears and must never become wings; {_LIGHT}"
        ),
        "extra_preserve": ["wide membranous ears attached only to the head", "grounded feet"],
        "extra_reject": [
            "new back wings",
            "flight",
            "turning ears into wings",
            "lighting flicker",
            "limb-only twitching without weight transfer",
        ],
    },
    ("molten", "ghost"): {
        "anatomy": "hovering",
        "locomotion": "hover",
        "movement_source": "coordinated lower root-tendril compression and extension with tiny settling in the torn back membranes",
        "attack_source": "both crescent skeletal forearms and the exact orange rib-cage core",
        "move": "an in-place frontal hover cycle driven by the lower root-like tendrils: the tendrils gather upward, return through the exact pose, then extend in a different coordinated arrangement; allow only tiny settling in the torn back membranes and keep the rib cage, orange core, head, and scale fixed",
        "attack": "a threatening frontal two-arm reap: both exact crescent skeletal forearms draw inward around the orange rib-cage core, the core pulses brighter as both crescents project toward the player together, then the creature returns to the exact supplied pose; there is no mouth attack",
        "extra_preserve": ["two crescent skeletal forearms", "orange core inside the rib cage", "root-like lower tendrils", "torn back membranes"],
        "extra_reject": ["invented mouth", "legs or feet", "wing flapping", "single-arm swipe", "turning the core into a face"],
    },
    ("molten", "zombie-orc"): {
        "movement_source": "heavy unarmed orc walk with full hip-driven weight transfer",
        "attack_source": "both existing oversized hands and the exact orc head",
        "move": (
            f"a heavy {_WALK_BIPED}: screen-left foot plants with body weight shift and the opposite "
            f"oversized hand counter-swings, exact idle pass, then screen-right foot plants with the "
            f"complementary arm phase; preserve the exact unarmed orc face, rocky back plates, torso "
            f"scale, limb count, and volume; never invent a weapon; {_LIGHT}"
        ),
        "attack": (
            f"a powerful unarmed frontal two-hand hammer attack: both existing oversized hands draw "
            f"back and upward for anticipation, both drive toward the player together for contact while "
            f"the feet and torso scale stay fixed, then recover to the exact supplied pose; keep the "
            f"head frontal and never invent equipment, extra fingers, or extra limbs; {_LIGHT}"
        ),
        "extra_preserve": ["unarmed orc identity", "rocky back plates", "the same two oversized hands"],
        "extra_reject": ["weapon or equipment", "single-hand attack", "standing zoom toward the camera"],
    },
}


# Final quota-safe prompts for the last three biomes. These contracts describe
# the anatomy visible in each approved anchor instead of trusting the legacy
# enemy family name, which may refer to a completely different body plan.
BIOME_OVERRIDES.update({
    ("sunken", "carrion"): {
        "movement_source": "exactly two huge webbed forelimbs and two small rear feet in a four-support fish crawl",
        "attack_source": "the existing giant fish mouth while both webbed forelimbs brace",
        "move_provider_action": "one compact frontal four-support fish crawl: alternate the left forelimb with the opposite rear foot, pass through exact idle, then alternate the complementary pair; keep the angler body, lure, mouth, and scale fixed",
        "attack_provider_action": "one frontal bite: both huge webbed forelimbs brace without enlarging, the exact giant mouth closes then snaps open, and all anatomy returns to exact idle; keep the lure and body scale fixed",
        "extra_preserve": ["two huge webbed forelimbs", "two small rear feet", "giant circular fish mouth", "single glowing angler lure"],
        "extra_reject": ["biped motion", "human hands", "new tail", "giant perspective forelimb"],
    },
    ("sunken", "goblin"): {
        "anatomy": "quadruped", "locomotion": "crawl",
        "movement_source": "two broad pectoral walking fins and two small rear fins in alternating supports",
        "attack_source": "the split shark jaw and both broad pectoral fins",
        "move_provider_action": "one low frontal four-fin crawl: left broad pectoral fin plants with the opposite small rear fin, exact idle pass, then the complementary pair; keep the pointed shark body level",
        "attack_provider_action": "one compact frontal shark bite: both broad pectoral fins brace, the existing split jaw opens and snaps, then exact idle recovery; no body approach or fin growth",
        "extra_preserve": ["two broad pectoral walking fins", "two small rear fins", "pointed shark head", "split toothed jaw"],
        "extra_reject": ["biped stance", "arms or human hands", "side swim", "whole-body dive"],
    },
    ("sunken", "ghost"): {
        "movement_source": "the four thin central tentacles and two long outer arm-tentacles under a fixed skull bell",
        "attack_source": "both long outer arm-tentacles and the exact glowing mouth orb",
        "move_provider_action": "one frontal jellyfish hover cycle: four central tentacles compress and extend in two complementary grouped poses while the two long outer arm-tentacles trail subtly; freeze the skull bell, mouth orb, center, and scale",
        "attack_provider_action": "one threatening bilateral spectral grab: both long outer arm-tentacles gather around the glowing mouth orb and snap inward together, then exact idle recovery; keep all four central tentacles and the skull bell unchanged",
        "extra_preserve": ["skull-shaped bell", "glowing cyan mouth orb", "four central tentacles", "two long outer arm-tentacles"],
        "extra_reject": ["wings", "legs", "missing tentacle", "radial spin", "bell squash"],
    },
    ("sunken", "ratling"): {
        "anatomy": "multi-legged", "locomotion": "crawl",
        "movement_source": "all six small walking legs in opposed groups while the two raised crab claws remain ready",
        "attack_source": "both oversized raised crab claws and the central mouthparts",
        "move_provider_action": "one frontal crustacean scuttle: three alternating small walking legs plant, exact idle pass, then the complementary three legs plant; keep both oversized claws raised and the armored shell level",
        "attack_provider_action": "one bilateral crab clamp: both oversized claws open outward then close toward the central mouth together, followed by exact idle recovery; all six walking legs remain planted",
        "extra_preserve": ["six small walking legs", "two oversized crab claws", "armored rounded shell", "central mouthparts"],
        "extra_reject": ["quadruped paws", "biped walk", "single-claw attack", "missing walking leg"],
    },
    ("sunken", "husk"): {
        "move_provider_action": "one normal heavy frontal biped walk using only the two long legs: left foot plant, exact neutral pass, right foot plant; use small opposite counter-swing in the two long webbed arms and preserve the open torso wound",
        "attack_provider_action": "one threatening bilateral rake: both existing webbed claw-hands draw back below the chest and slash inward together, then exact idle recovery; keep head, torso wound, legs, and scale fixed",
        "extra_preserve": ["two long legs", "two long webbed claw-hands", "open right chest wound", "barnacle clusters"],
        "extra_reject": ["extra limb", "single-hand punch", "head enlargement", "body flattening"],
    },
    ("sunken", "imp"): {
        "movement_source": "the exact two side wings with restrained follow-through in all eight lower tentacles",
        "attack_source": "the central beak and the front pair of the eight lower tentacles",
        "move_provider_action": "one frontal airborne cycle driven by a synchronized downstroke and upstroke of the exact two side wings; all eight lower tentacles trail with tiny connected motion while the squid head, eyes, beak, center, and scale stay fixed",
        "attack_provider_action": "one compact airborne beak strike: maintain a subtle bilateral wing beat, gather only the front tentacle pair around the exact central beak, snap the beak open, then exact idle recovery; preserve all eight tentacles",
        "extra_preserve": ["exactly two side wings", "eight lower tentacles", "two black eyes", "central beak"],
        "extra_reject": ["humanoid arms", "walking legs", "landing", "missing tentacle", "single-wing flap"],
    },
    ("sunken", "zombie-orc"): {
        "move_provider_action": "one heavy normal frontal orc walk: left foot plant with restrained cleaver-arm counter-settle, exact neutral pass, right foot plant; preserve the actual orc face, armor, cleaver, and body volume",
        "attack_provider_action": "one forceful cleaver chop using the exact existing weapon: short shoulder-led anticipation, diagonal frontal contact on the same image plane, exact idle recovery; the free hand braces and never becomes the attack driver",
        "extra_preserve": ["actual orc face", "single rusted cleaver", "corroded shoulder armor", "two feet"],
        "extra_reject": ["human face", "new weapon", "weapon switching hands", "giant foreground cleaver"],
    },
    ("sunken", "spider"): {
        "movement_source": "opposed groups across all eight walking legs while both giant front pincers stay ready",
        "attack_source": "both giant front pincers and the exact central mouth",
        "move_provider_action": "one frontal spider-crab scuttle: lift and plant one opposed two-leg group, exact idle pass, then the complementary group; keep all eight walking legs readable, both giant pincers stable, and the body level",
        "attack_provider_action": "one bilateral pincer bite: both giant front pincers open then clamp around the exact central mouth together, followed by exact idle recovery; all eight walking legs remain supporting",
        "extra_preserve": ["eight walking legs", "two giant toothed front pincers", "central mouth", "level armored body"],
        "extra_reject": ["missing leg", "single-pincer attack", "body tilt", "top-down view"],
    },
    ("sunken", "bone-slime"): {
        "move_provider_action": "one mass-preserving frontal slime creep using only alternating lower folds; exact idle separates the two localized fold poses; keep the dorsal bones, circular maw, total silhouette, center, and height fixed",
        "attack_provider_action": "one compact maw snap: the existing circular bone-lined mouth constricts then opens sharply while the lower mass braces, followed by exact idle recovery; never grow limbs or change the dorsal bones",
        "extra_preserve": ["circular bone-lined maw", "three dorsal bone stumps", "side ribs", "same slime mass"],
        "extra_reject": ["legs", "arms", "whole-body squash", "new skeleton"],
    },
    ("sunken", "white-eyed-shadow"): {
        "movement_source": "exactly two long outer legs in a normal biped walk with restrained counter-swing of two long arms",
        "attack_source": "both long arms and both clawed hands",
        "move_provider_action": "one normal fully frontal biped walk: left foot plant, exact neutral pass with both legs centered, right foot plant; counter-swing the two long arms subtly and preserve the narrow hooded head and two white eyes",
        "attack_provider_action": "one threatening two-handed frontal grab: both existing clawed hands gather below the chest, strike together without growing, and return to exact idle; freeze the two legs, head, shoulders, and scale",
        "extra_preserve": ["exactly two long legs", "exactly two long arms", "narrow hooded black head", "two white eyes"],
        "extra_reject": ["central tails", "horned V head", "extra limb", "one-hand punch", "human face"],
    },
    ("sunken", "carrion-stalker"): {
        "movement_source": "two long seal foreflippers and two small rear feet in an alternating four-support crawl",
        "attack_source": "the exact seal-like mouth and both long foreflippers",
        "move_provider_action": "one low frontal seal-creature crawl: left foreflipper plants with the opposite small rear foot, exact idle pass, then the complementary pair; preserve the arched back, skull face, and scale",
        "attack_provider_action": "one frontal ambush bite: both long foreflippers brace without growing, the exact mouth snaps open, then all four supports return to exact idle; no body approach",
        "extra_preserve": ["two long foreflippers", "two small rear feet", "seal-like skull face", "arched back"],
        "extra_reject": ["biped stance", "new tail", "giant perspective flipper", "side roll"],
    },

    ("fungal", "carrion"): {
        "move_provider_action": "one heavy frontal alligator crawl: alternate the two huge forelimbs with the two small rear feet around a level torso, with exact idle between phases; keep every dorsal mushroom shelf fixed",
        "attack_provider_action": "one compact alligator bite: both huge forelimbs brace, the exact existing jaw closes then snaps open, followed by exact idle recovery; preserve all mushrooms and body scale",
        "extra_preserve": ["two huge forelimbs", "two small rear feet", "alligator jaw", "dorsal mushroom shelves"],
        "extra_reject": ["biped walk", "mushroom growth", "giant hand perspective", "new tail"],
    },
    ("fungal", "goblin"): {
        "move_provider_action": "one normal frontal biped walk using exactly two legs: left foot plant, exact neutral pass, right foot plant; the two ring-claw arms counter-swing subtly and the vertical ribbed face opening stays unchanged",
        "attack_provider_action": "one threatening bilateral ring-claw strike: both existing circular claw-hands draw back and clamp inward together while the vertical ribbed face opening flares slightly, then exact idle recovery",
        "extra_preserve": ["vertical ribbed face opening", "two circular claw-hands", "two clawed feet", "dorsal fungal cluster"],
        "extra_reject": ["normal human face", "single-hand attack", "extra leg", "head redesign"],
    },
    ("fungal", "ghost"): {
        "anatomy": "winged", "locomotion": "fly", "anchor": "center",
        "movement_source": "synchronized strokes of the exact two upper wings and two lower wings around a fixed insect body",
        "attack_source": "both thin forearms converging around the exact cyan chest core",
        "move_provider_action": "one frontal airborne cycle: both upper wings and both lower wings complete synchronized downstroke and upstroke poses; freeze the insect mask, branching antennae, arms, cyan core, segmented tail, center, and scale",
        "attack_provider_action": "one airborne two-arm core strike: keep a subtle four-wing beat, draw both thin forearms outward then clamp them around the cyan chest core together, followed by exact idle recovery; no body zoom",
        "extra_preserve": ["two upper wings", "two lower wings", "branching fungal antennae", "cyan chest core", "segmented tail"],
        "extra_reject": ["legs or feet", "single-wing flap", "landing", "human face", "wing count change"],
    },
    ("fungal", "ratling"): {
        "move_provider_action": "one low frontal pangolin crawl using the two oversized foreclaws and two smaller rear feet in alternating diagonal supports; exact idle separates phases; let the thick tail follow subtly",
        "attack_provider_action": "one short frontal body-and-claw thrust: both oversized foreclaws brace then rake inward together beneath the exact narrow snout, followed by exact idle recovery; preserve the shell mushrooms and tail",
        "extra_preserve": ["two oversized foreclaws", "two small rear feet", "thick curled tail", "armored shell with mushroom shelves"],
        "extra_reject": ["biped motion", "missing tail", "single-claw attack", "rolling into a ball"],
    },
    ("fungal", "husk"): {
        "move_provider_action": "one heavy normal frontal biped walk: left foot plant, exact neutral pass, right foot plant; keep the split hood-head, exposed rib cage, fungal shoulder stalk, and long arm proportions stable",
        "attack_provider_action": "one threatening bilateral hook grab: both long hooked hands gather below the rib cage, snap inward together, then exact idle recovery; keep the head split, legs, torso, and scale fixed",
        "extra_preserve": ["split hood-like head", "exposed rib cage", "two long hooked hands", "single fungal shoulder stalk"],
        "extra_reject": ["human head", "one-hand attack", "new mushroom stalk", "head enlargement"],
    },
    ("fungal", "imp"): {
        "movement_source": "a synchronized bilateral stroke of the exact two torn bat wings around a fixed round body",
        "attack_source": "the exact central snout-mouth while both curled feet remain tucked",
        "move_provider_action": "one frontal airborne cycle driven only by the exact two bat wings: synchronized downstroke, exact idle, synchronized upstroke; freeze the horned head, round egg-filled abdomen, two curled feet, center, and scale",
        "attack_provider_action": "one airborne mouth snap: maintain a subtle bilateral wing beat, constrict then open the exact central snout-mouth, and return to exact idle; both curled feet remain tucked and unchanged",
        "extra_preserve": ["two torn bat wings", "two curled feet", "round cyan egg-filled abdomen", "horned furry head"],
        "extra_reject": ["ring-shaped foreclaws", "arms or hands", "landing", "walking", "single-wing motion"],
    },
    ("fungal", "zombie-orc"): {
        "move_provider_action": "one heavy frontal unarmed orc walk: left foot plant, exact neutral pass, right foot plant with restrained opposite arm counter-swing; preserve the actual orc face and all fungal growths",
        "attack_provider_action": "one powerful bilateral orc hammer strike: both existing hands draw back then drive down and inward together on the same image plane, followed by exact idle recovery; never invent a weapon",
        "extra_preserve": ["actual orc face", "two hands", "fungal shoulder shelves", "root-web loin covering"],
        "extra_reject": ["weapon", "human face", "single-hand punch", "fungal growth animation"],
    },
    ("fungal", "spider"): {
        "move_provider_action": "one frontal spider-crab scuttle using opposed groups across all eight walking legs; exact idle separates the two groups; keep the two huge front pincers and all dorsal mushrooms stable",
        "attack_provider_action": "one bilateral pincer clamp: both huge front pincers open and close toward the exact central mouth together, then exact idle recovery; all eight walking legs remain supporting",
        "extra_preserve": ["eight walking legs", "two huge front pincers", "central mouthparts", "dorsal mushroom shelves"],
        "extra_reject": ["missing leg", "single-pincer attack", "body tilt", "top-down view"],
    },
    ("fungal", "bone-slime"): {
        "movement_source": "alternating lower side lobes while both dorsal loop-tendrils and the top silhouette remain stable",
        "attack_source": "the exact giant rib-lined maw and both dorsal loop-tendrils",
        "move_provider_action": "one mass-preserving frontal creep using two complementary lower side-lobe contractions with exact idle between them; both dorsal loops, the giant rib-lined maw, embedded bones, center, and height remain fixed",
        "attack_provider_action": "one compact maw attack: both dorsal loops brace with only a tiny inward set, the exact giant rib-lined maw constricts then snaps open, followed by exact idle recovery; preserve total mass",
        "extra_preserve": ["giant rib-lined maw", "two dorsal loop-tendrils", "embedded rib cage", "same lower side lobes"],
        "extra_reject": ["new legs", "loop becomes arm", "whole-body squash", "missing bone"],
    },
    ("fungal", "white-eyed-shadow"): {
        "movement_source": "exactly two root-like outer legs in a normal biped walk with restrained counter-swing of two root-like arms",
        "attack_source": "both root-like arms and both two-pronged hands",
        "move_provider_action": "one normal fully frontal biped walk: left root-foot plant, exact neutral pass, right root-foot plant; counter-swing the two long root-arms subtly and preserve the two white eyes, narrow head, and fungal growths",
        "attack_provider_action": "one threatening two-handed root grab: both existing two-pronged hands gather below the chest and strike together without growing, then exact idle recovery; freeze the two legs and head",
        "extra_preserve": ["exactly two root-like legs", "exactly two root-like arms", "two white eyes", "narrow black head", "fungal growths"],
        "extra_reject": ["central tails", "horned V head", "extra limb", "human face", "one-hand punch"],
    },
    ("fungal", "carrion-stalker"): {
        "move_provider_action": "one low frontal quadruped stalk using the two huge forelimbs and two small rear feet in alternating diagonal supports; exact idle separates phases; keep the quilled back level",
        "attack_provider_action": "one frontal ambush bite: both huge forelimbs brace without enlarging, the exact open mouth snaps wider, then all four supports return to exact idle; preserve all dorsal mushrooms",
        "extra_preserve": ["two huge forelimbs", "two small rear feet", "quilled back", "open mammal mouth", "dorsal mushrooms"],
        "extra_reject": ["biped stance", "giant perspective hand", "mushroom growth", "side roll"],
    },

    ("backrooms", "carrion"): {
        "move_provider_action": "one low frontal quadruped crawl using exactly two huge forearms and two small rear feet in alternating diagonal supports; exact idle separates phases; preserve the same uncanny human face and grin",
        "attack_provider_action": "one frontal uncanny bite: both huge forearms brace without enlarging, the exact human-like grin opens into a snap, then exact idle recovery; the face identity never changes",
        "extra_preserve": ["same uncanny human face", "same grin and eyes", "two huge forearms", "two small rear feet"],
        "extra_reject": ["animal face", "face replacement", "giant perspective hand", "biped stance"],
    },
    ("backrooms", "goblin"): {
        "move_provider_action": "one normal frontal biped walk: left foot plant, exact neutral pass, right foot plant; counter-swing both long clawed arms subtly and preserve the exact uncanny bald human face and horizontal toothy mouth",
        "attack_provider_action": "one threatening bilateral claw grab: both long clawed hands draw back and clamp inward together while the exact toothy human mouth opens slightly, then exact idle recovery",
        "extra_preserve": ["same uncanny bald human face", "horizontal toothy mouth", "two long arms", "two legs"],
        "extra_reject": ["animal head", "face redesign", "one-hand punch", "extra limb"],
    },
    ("backrooms", "ghost"): {
        "movement_source": "small coordinated compression and extension of the lower hanging shroud around a fixed uncanny human face",
        "attack_source": "the exact vertical upper mouth opening while the human face and side shrouds remain fixed",
        "move_provider_action": "one frontal hover cycle using only subtle coordinated lower-shroud compression and extension in two complementary poses; freeze the exact upside-down uncanny human face, upper mouth opening, center, and scale",
        "attack_provider_action": "one threatening shroud-mouth snap: gather the two side shrouds slightly inward, open the exact vertical upper mouth, then exact idle recovery; never rotate, invert, or redesign the human face",
        "extra_preserve": ["same upside-down uncanny human face", "vertical upper mouth", "two side shrouds", "tapered lower shroud"],
        "extra_reject": ["normal upright face", "arms or legs", "whole-body spin", "face replacement"],
    },
    ("backrooms", "ratling"): {
        "anatomy": "multi-legged", "locomotion": "crawl",
        "movement_source": "all six small walking legs in alternating opposed groups while both oversized human-faced crab pincers stay ready",
        "attack_source": "both oversized pincers and the exact central tusked mouth below the human face",
        "move_provider_action": "one frontal six-leg crustacean scuttle: three alternating walking legs plant, exact idle pass, then the complementary three; keep both oversized pincers, shell, horns, and uncanny human face stable",
        "attack_provider_action": "one bilateral pincer clamp: both oversized pincers open then close around the exact tusked mouth together, followed by exact idle recovery; preserve the human face and all six walking legs",
        "extra_preserve": ["same uncanny human face", "six walking legs", "two oversized pincers", "two antenna horns", "central tusked mouth"],
        "extra_reject": ["rat face", "quadruped paws", "single-pincer attack", "missing leg", "face redesign"],
    },
    ("backrooms", "husk"): {
        "move_provider_action": "one heavy normal frontal biped walk: left foot plant, exact neutral pass, right foot plant; both long arms counter-swing subtly while the exact vertical head-mouth and torso cavities stay unchanged",
        "attack_provider_action": "one threatening bilateral downward grab: both heavy forearms draw back then both forked hands drive inward together, followed by exact idle recovery; preserve the vertical head-mouth and body scale",
        "extra_preserve": ["vertical toothed head-mouth", "two long forearms", "two legs", "same torso cavities"],
        "extra_reject": ["normal human head", "one-hand attack", "head enlargement", "extra limb"],
    },
    ("backrooms", "imp"): {
        "movement_source": "synchronized strokes of the exact two upper wings and two lower wings around a fixed skull-faced insect body",
        "attack_source": "the exact lower circular maw while all six insect legs remain tucked",
        "move_provider_action": "one frontal airborne cycle: both upper wings and both lower wings complete synchronized downstroke and upstroke poses; freeze the skull-like human face, lower circular maw, all six legs, center, and scale",
        "attack_provider_action": "one airborne maw snap: maintain a subtle synchronized four-wing beat, constrict then open the exact lower circular maw, and return to exact idle; preserve the skull face and all six tucked legs",
        "extra_preserve": ["same skull-like uncanny human face", "two upper wings", "two lower wings", "six insect legs", "lower circular maw"],
        "extra_reject": ["ring foreclaws", "human arms", "landing", "wing count change", "face redesign"],
    },
    ("backrooms", "zombie-orc"): {
        "move_provider_action": "one heavy frontal orc walk: left foot plant, exact neutral pass, right foot plant with restrained cleaver-arm counter-settle; preserve the actual orc head, exact cleaver, and embedded human chest face",
        "attack_provider_action": "one forceful cleaver chop using the exact existing weapon on the same image plane, followed by exact idle recovery; freeze the embedded human chest face and never enlarge the cleaver",
        "extra_preserve": ["actual orc head", "single cleaver", "same embedded human chest face", "two feet"],
        "extra_reject": ["human head replacing orc", "chest face animation", "new weapon", "giant foreground cleaver"],
    },
    ("backrooms", "spider"): {
        "move_provider_action": "one frontal spider scuttle using opposed groups across all eight exact legs; exact idle separates the groups; keep both long feelers and the same uncanny human face stable with no body tilt",
        "attack_provider_action": "one central mouth strike: brace the front leg pair, open the exact vertical mouth beneath the human face, then exact idle recovery; both long feelers settle only a few pixels",
        "extra_preserve": ["same uncanny human face", "eight legs", "two long feelers", "vertical central mouth"],
        "extra_reject": ["face redesign", "missing leg", "top-down view", "body tilt", "feelers become legs"],
    },
    ("backrooms", "bone-slime"): {
        "move_provider_action": "one mass-preserving frontal creep using two complementary lower slime-fold contractions with exact idle between them; keep the central ribbed maw, all four embedded bone clusters, center, and height fixed",
        "attack_provider_action": "one compact maw snap: the exact central ribbed mouth constricts then opens sharply while the four embedded bone clusters remain fixed, followed by exact idle recovery; no new limbs",
        "extra_preserve": ["central ribbed maw", "four embedded bone clusters", "same slime mass", "same yellow-brown palette"],
        "extra_reject": ["legs", "arms", "new face", "whole-body squash", "missing bone cluster"],
    },
    ("backrooms", "white-eyed-shadow"): {
        "movement_source": "exactly two long legs in a normal biped walk with restrained counter-swing of exactly two long arms",
        "attack_source": "both long arms and both clawed hands below the same uncanny human face",
        "move_provider_action": "one normal fully frontal biped walk: left foot plant, exact neutral pass, right foot plant; counter-swing the two long arms subtly and preserve the same black human face, two white eyes, teeth, torso, and scale",
        "attack_provider_action": "one threatening two-handed grab: both existing clawed hands gather below the chest and strike together without growing, then exact idle recovery; freeze the human face, two legs, and torso",
        "extra_preserve": ["same uncanny black human face", "two white eyes", "same visible teeth", "exactly two arms", "exactly two legs"],
        "extra_reject": ["horned V head", "central tails", "face redesign", "one-hand punch", "extra limb"],
    },
    ("backrooms", "carrion-stalker"): {
        "move_provider_action": "one low frontal quadruped stalk using exactly two huge forearms and two small rear feet in alternating diagonal supports; exact idle separates phases; preserve the same three-part uncanny human mouth structure",
        "attack_provider_action": "one frontal triple-jaw snap: both huge forearms brace without enlarging, the central and two side mouths close inward together, then exact idle recovery; the uncanny human face never changes identity",
        "extra_preserve": ["same uncanny human face", "central mouth", "two side mouths", "two huge forearms", "two small rear feet"],
        "extra_reject": ["animal face", "face redesign", "giant perspective hand", "missing side mouth", "biped stance"],
    },
})


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def restore_large_enclosed_regions(
    cutout: Image.Image,
    original: Image.Image,
    *,
    min_pixels: int = 1024,
) -> tuple[Image.Image, list[dict]]:
    """Restore dark subject regions enclosed by a Lucida foreground boundary."""
    result = cutout.convert("RGBA")
    alpha = result.getchannel("A")
    width, height = alpha.size
    alpha_pixels = alpha.load()
    outside = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def enqueue(x: int, y: int) -> None:
        offset = y * width + x
        if alpha_pixels[x, y] == 0 and not outside[offset]:
            outside[offset] = 1
            queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        enqueue(width - 1, y)
    while queue:
        x, y = queue.popleft()
        if x > 0:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y > 0:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)

    visited = bytearray(outside)
    source = original.convert("RGBA")
    source_pixels = source.load()
    result_pixels = result.load()
    restored: list[dict] = []
    for y in range(height):
        for x in range(width):
            offset = y * width + x
            if alpha_pixels[x, y] != 0 or visited[offset]:
                continue
            component: list[tuple[int, int]] = []
            queue.append((x, y))
            visited[offset] = 1
            min_x = max_x = x
            min_y = max_y = y
            while queue:
                px, py = queue.popleft()
                component.append((px, py))
                min_x = min(min_x, px)
                max_x = max(max_x, px)
                min_y = min(min_y, py)
                max_y = max(max_y, py)
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if not (0 <= nx < width and 0 <= ny < height):
                        continue
                    neighbor = ny * width + nx
                    if alpha_pixels[nx, ny] == 0 and not visited[neighbor]:
                        visited[neighbor] = 1
                        queue.append((nx, ny))
            if len(component) < min_pixels:
                continue
            for px, py in component:
                red, green, blue, _ = source_pixels[px, py]
                result_pixels[px, py] = (red, green, blue, 255)
            restored.append(
                {
                    "pixels": len(component),
                    "bbox": [min_x, min_y, max_x + 1, max_y + 1],
                }
            )
    return result, restored


def build_first_frame(
    source: Path,
    target: Path,
    background_name: str,
    skill_root: Path,
    sessions: dict,
    safe_extent_ratio: float = GENERATION_SAFE_EXTENT_RATIO,
    fill_enclosed_voids: bool = False,
) -> dict:
    scripts_dir = skill_root / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    from extract_sprite_row_frames import apply_alpha_policy, remove_lucida_background

    config = {
        "model": "egeorcun/lucida",
        "revision": "6ee11122534c8de59402a589d2293c198cfbf848",
        "device": "auto",
        "input_size": 1024,
        "alpha_mode": "hard",
        "hard_alpha_threshold": 64,
    }
    if fill_enclosed_voids:
        config["hard_alpha_threshold"] = 4
    with Image.open(source) as opened:
        original = opened.convert("RGB")
    cutout = apply_alpha_policy(remove_lucida_background(original, config, sessions), config)
    restored_regions: list[dict] = []
    if fill_enclosed_voids:
        cutout, restored_regions = restore_large_enclosed_regions(cutout, original)
    bbox = cutout.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"Lucida found no subject in {source}")
    cropped = cutout.crop(bbox)
    canvas_size = max(original.size)
    safe_extent = int(canvas_size * safe_extent_ratio)
    scale = min(1.0, safe_extent / max(cropped.size))
    if scale < 1.0:
        cropped = cropped.resize(
            (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
            Image.Resampling.LANCZOS,
        )
    background = (128, 128, 128, 255) if background_name == "gray" else (0, 0, 0, 255)
    canvas = Image.new("RGBA", (canvas_size, canvas_size), background)
    position = ((canvas_size - cropped.width) // 2, (canvas_size - cropped.height) // 2)
    canvas.alpha_composite(cropped, position)
    target.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(target)
    return {
        "source": source.relative_to(ROOT).as_posix(),
        "source_sha256": sha256(source),
        "background": background_name,
        "lucida_revision": config["revision"],
        "lucida_hard_alpha_threshold": config["hard_alpha_threshold"],
        "source_bbox": list(bbox),
        "safe_extent_ratio": safe_extent_ratio,
        "fill_enclosed_voids": fill_enclosed_voids,
        "restored_enclosed_regions": restored_regions,
        "scale": round(scale, 6),
        "output_sha256": sha256(target),
        "output_size": [canvas_size, canvas_size],
    }


def request_for(biome: str, enemy: str) -> dict:
    spec = {**SPECS[enemy], **BIOME_OVERRIDES.get((biome, enemy), {})}
    safe_extent_ratio = GENERATION_SAFE_EXTENT_BY_ENEMY.get(
        enemy, GENERATION_SAFE_EXTENT_RATIO
    )
    edge_margin_ratio = round((1.0 - safe_extent_ratio) / 2.0, 2)
    move_provider_action = spec.get("move_provider_action") or (
        f"one compact fully frontal in-place {spec['locomotion']} cycle; animate exactly "
        f"{spec['movement_source']}; phase A and phase B are two complementary supported "
        "articulation poses from the same cycle, the registered root stays fixed, non-driving "
        "anatomy only follows with restrained connected secondary motion, and the exact supplied "
        "idle separates the two phases"
    )
    attack_provider_action = spec.get("attack_provider_action") or (
        "one compact threatening fully frontal attack; animate exactly "
        f"{spec['attack_source']}; anticipation visibly prepares that exact anatomy, contact is "
        "a sharp committed strike, snap, clamp, bite, or impact appropriate to it on the same flat "
        "image plane, non-driving anatomy braces without redesign, and recovery reaches the exact "
        "supplied idle"
    )
    background_name = "gray" if enemy == "white-eyed-shadow" else "black"
    background_rgb = [128, 128, 128] if background_name == "gray" else [0, 0, 0]
    background_hex = "#808080" if background_name == "gray" else "#000000"
    return {
        "version": 2,
        "kind": "sprite-gen-request",
        "engine": "component-row",
        "asset_kind": "sprite",
        "extraction_mode": "components",
        "character": {"id": f"{biome}-{enemy}", "description": f"Approved {biome} {enemy} identity anchor"},
        "cell": {"shape": "square", "width": 512, "height": 512, "size": 512, "safe_margin": 16},
        "generation_background": {"family": "neutral", "name": background_name, "hex": background_hex, "rgb": background_rgb, "selection": "manual"},
        "background_removal": {"method": "lucida", "model": "egeorcun/lucida", "revision": "6ee11122534c8de59402a589d2293c198cfbf848", "device": "auto", "input_size": 1024, "alpha_mode": "hard", "hard_alpha_threshold": 64, "source_family": "neutral"},
        "grid_segmentation": "adaptive",
        "creature_motion": {
            "anatomy": spec["anatomy"], "locomotion": spec["locomotion"], "camera": "front-fps",
            "registration_anchor": spec["anchor"], "shared_idle": True, "screen_side_labels": True,
            "movement_source": spec["movement_source"], "attack_source": spec["attack_source"],
            "preserve": ["exact approved identity", "full frontal orientation", "head and torso scale", "body volume", "limb count", "palette and surface markings", *spec.get("extra_preserve", [])],
            "reject": ["camera movement", "three-quarter rotation", "top-down tilt", "whole-body side sway", "body scaling", "extra or missing limbs", "identity morphing", "cropped anatomy", *spec.get("extra_reject", [])],
        },
        "states": {
            "idle-step": {"frames": 4, "fps": 8, "loop": True, "label": "Move", "action": spec["move"], "animation_workflows": ["front-fps-creature-locomotion"], "video_prompt": {"provider_action": move_provider_action, "motion_window_seconds": 1.6, "edge_margin_ratio": edge_margin_ratio, "motion_plane": "image-plane"}, "raw_layout": {"kind": "compact-grid", "columns": 2, "rows": 2, "order": "row-major", "delivery": "compose-runtime-row"}},
            "attack": {"frames": 4, "fps": 10, "loop": False, "label": "Attack", "action": spec["attack"], "animation_workflows": ["front-fps-creature-attack"], "video_prompt": {"provider_action": attack_provider_action, "motion_window_seconds": 1.6, "edge_margin_ratio": edge_margin_ratio, "motion_plane": "image-plane"}, "raw_layout": {"kind": "compact-grid", "columns": 2, "rows": 2, "order": "row-major", "delivery": "compose-runtime-row"}},
        },
        "style_preset": "pixel-art",
        "style": "Preserve the exact approved pixel-art-adjacent enemy identity, palette, texture, outline, lighting, and flat black background.",
        "raw_layout_policy": "compact-body-grids",
        "frame_semantics": "animation",
        "output": {"use": "custom-atlas", "frame_semantics": "animation"},
        "registration": {
            "method": "register_sprite_frames",
            "anchor": spec["anchor"],
            "target_x": 0.5,
            "target_bottom": 496,
            **(
                {"scale_policy": "source-reference"}
                if spec["anatomy"] in {"winged", "flying"}
                else {}
            ),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--biome", choices=BIOME_ORDER)
    parser.add_argument("--enemy", choices=tuple(SPECS))
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--skill-root", type=Path, default=DEFAULT_SKILL)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    if args.all == bool(args.biome):
        parser.error("choose exactly one of --biome or --all")
    biomes = BIOME_ORDER if args.all else (args.biome,)
    if args.all and args.enemy:
        parser.error("--enemy requires --biome")
    enemies = (args.enemy,) if args.enemy else tuple(SPECS)
    prepare = args.skill_root / "scripts" / "prepare_grok_video_animation.py"
    manifest_path = args.out / "batch-manifest.json"
    existing_entries: dict[tuple[str, str], dict] = {}
    if manifest_path.is_file():
        existing_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        existing_entries = {
            (entry["biome"], entry["enemy"]): entry
            for entry in existing_manifest.get("entries", [])
        }
    entries = dict(existing_entries)
    lucida_sessions = {}
    for biome in biomes:
        for enemy in enemies:
            source = SOURCE_ROOT / biome / f"{enemy}.png"
            run = args.out / "runs" / biome / enemy
            if run.exists() and not args.force:
                raise FileExistsError(f"run already exists: {run}; use --force")
            run.mkdir(parents=True, exist_ok=True)
            request_path = run / "sprite-request.json"
            request_path.write_text(json.dumps(request_for(biome, enemy), indent=2) + "\n", encoding="utf-8")
            background_name = "gray" if enemy == "white-eyed-shadow" else "black"
            safe_extent_ratio = GENERATION_SAFE_EXTENT_BY_ENEMY.get(
                enemy, GENERATION_SAFE_EXTENT_RATIO
            )
            fill_enclosed_voids = bool(
                SPECS[enemy].get("first_frame_fill_enclosed_voids", False)
            )
            prepared_identity = run / "references" / "identity-first-frame.png"
            prep_report_path = run / "references" / "identity-first-frame.json"
            prep_report = None
            if prepared_identity.is_file() and prep_report_path.is_file():
                previous = json.loads(prep_report_path.read_text(encoding="utf-8"))
                if (
                    previous.get("source_sha256") == sha256(source)
                    and previous.get("background") == background_name
                    and previous.get("lucida_revision")
                    == "6ee11122534c8de59402a589d2293c198cfbf848"
                    and previous.get("lucida_hard_alpha_threshold")
                    == (4 if fill_enclosed_voids else 64)
                    and previous.get("safe_extent_ratio") == safe_extent_ratio
                    and previous.get("fill_enclosed_voids") == fill_enclosed_voids
                    and previous.get("output_sha256") == sha256(prepared_identity)
                ):
                    prep_report = previous
            if prep_report is None:
                prep_report = build_first_frame(
                    source,
                    prepared_identity,
                    background_name,
                    args.skill_root,
                    lucida_sessions,
                    safe_extent_ratio,
                    fill_enclosed_voids,
                )
                prep_report_path.write_text(
                    json.dumps(prep_report, indent=2) + "\n", encoding="utf-8"
                )
            for state in ("idle-step", "attack"):
                first = run / "provider" / "grok-imagine" / state / "first-frame.png"
                first.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(prepared_identity, first)
                command = [sys.executable, str(prepare), "--repo-root", str(ROOT), "--run-dir", str(run), "--state", state, "--first-frame", first.relative_to(run).as_posix()]
                if args.force:
                    command.append("--force")
                subprocess.run(command, cwd=args.skill_root, check=True)
            key = (biome, enemy)
            previous = entries.get(key, {})
            entries[key] = {
                "biome": biome,
                "enemy": enemy,
                "source": source.relative_to(ROOT).as_posix(),
                "source_sha256": sha256(source),
                "run": run.relative_to(ROOT).as_posix(),
                "states": previous.get(
                    "states", {"idle-step": "prepared", "attack": "prepared"}
                ),
                **({"review": previous["review"]} if "review" in previous else {}),
            }
    ordered_entries = [
        entries[(biome, enemy)]
        for biome in BIOME_ORDER
        for enemy in SPECS
        if (biome, enemy) in entries
    ]
    manifest = {
        "version": 1,
        "kind": "biome-enemy-video-animation-batch",
        "biome_order": list(BIOME_ORDER),
        "generation_policy": {
            "quota_sealed": True,
            "states_per_identity": ["idle-step", "attack"],
            "max_provider_videos_per_state": 1,
            "max_provider_videos_per_identity": 2,
            "after_success": "freeze-video-generation-and-repair-isolated-frames-with-imagegen",
        },
        "entries": ordered_entries,
    }
    args.out.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "prepared", "biomes": len(biomes), "runs": len(ordered_entries), "jobs": len(ordered_entries) * 2, "manifest": str(manifest_path)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
