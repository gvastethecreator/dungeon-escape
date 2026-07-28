# Carpentry reference generation record

## Shared prompt contract

Every call asked for one object shown as the same design in exactly three separated views:
orthographic front, orthographic right profile, and rear-left three-quarter. The shared chest and
the older prop or clutter concept acted only as style, material, and layout references. All calls
locked a warm neutral gray background, neutral studio light, low-poly game geometry, grim
pixel-PBR surfaces, stable scale and part placement, and a real rear construction. Prompts banned
scenery, labels, extra props, photoreal detail, perspective drift, cropping, and view changes.

## Object deltas and accepted files

| Object          | Required construction                                                | Accepted workspace file                    | Generated source                                | Review                                                                                             |
| --------------- | -------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| table           | Three-board top, splayed legs, aprons, low brace, corner straps      | `carpentry/table-three-view.png`           | `exec-a1540934-ce27-4d49-80f4-1ea3307a931c.png` | Accepted first pass                                                                                |
| bench           | Two-board seat, short legs, end aprons, long stretcher               | `carpentry/bench-three-view.png`           | `exec-4c2b911a-f50a-4d79-ba56-84107da944d6.png` | Accepted first pass                                                                                |
| chair           | Plain seat, four legs, low stretchers, two back posts, three slats   | `carpentry/chair-three-view.png`           | `exec-3b9fe658-45e6-4c10-aa34-9c736b45a7d3.png` | One edit removed the throne form and armrests from `exec-3d18f9ea-a882-4afc-8d28-2eb9e9f13505.png` |
| bookshelf       | Three open shelves, plank back, five simple book blocks, rear braces | `carpentry/bookshelf-three-view.png`       | `exec-4e5887e4-1217-460a-acd4-9b4564d08db6.png` | Accepted first pass                                                                                |
| crate           | Closed board box, X front and rear, side brace, skids                | `carpentry/crate-three-view.png`           | `exec-d543ff0b-f109-4564-97a0-e7c455158079.png` | Accepted first pass                                                                                |
| barrel          | Twelve-sided stave body, inset caps, three hoops, front bung         | `carpentry/barrel-three-view.png`          | `exec-381cb4b0-5977-42b4-bd40-fd710b2bd5ae.png` | One edit removed the fourth hoop from `exec-f33024f2-f962-486a-8bcd-753e1802a6f5.png`              |
| urn             | Faceted ceramic vessel, fitted lid, two handles, shoulder band       | `carpentry/urn-three-view.png`             | `exec-0299c008-ce1d-489a-be7b-91b68fda6163.png` | Accepted first pass                                                                                |
| weapon rack     | Empty A-frame, four upper slots, four lower cups, rear brace         | `carpentry/weapon-rack-three-view.png`     | `exec-4e705121-669d-4f78-884a-3c0ed69f1d31.png` | Accepted first pass                                                                                |
| lectern         | Empty slanted top, lip, closed body, stepped base, rear brace        | `carpentry/lectern-three-view.png`         | `exec-4b921f32-61b3-4e6d-ae1a-c6abfbae53a8.png` | Accepted first pass                                                                                |
| high chair      | Tall arched back, arms, heavy legs, low stretchers, blunt caps       | `carpentry/high-chair-three-view.png`      | `exec-2b3d72f6-a613-4d96-8cac-f4e9357f73ce.png` | One edit removed pointed spikes and crest from `exec-9c935e1a-b8bd-45bc-8ccb-ac6272b8c95a.png`     |
| ritual table    | Four-board top, stone legs, iron frame, brass plate, lower shelf     | `carpentry/ritual-table-three-view.png`    | `exec-d818a101-095e-4279-bc2b-04f205dae0dc.png` | Accepted first pass                                                                                |
| ossuary cabinet | Twin doors, two barred windows, latch, feet, rear braces             | `carpentry/ossuary-cabinet-three-view.png` | `exec-ec661908-a2e1-49d1-96ae-05f02ab02ce7.png` | One edit replaced skulls with long bones from `exec-20e7211b-88d9-4b29-9575-12e0d45a3235.png`      |

## Correction prompts

- Chair: remove arms, towers, pointed parts, arch panel, and large plates; rebuild as a compact
  three-slat chair in all views.
- Barrel: keep all geometry and materials; remove only the bottom fourth hoop in all views.
- High chair: replace sharp finials and crest with two blunt chamfered post caps.
- Ossuary: replace skulls behind both windows with three simple long bones per window.

The first-pass failures remain in the generated-image cache for audit. Only accepted files were
copied into the project source folder.
