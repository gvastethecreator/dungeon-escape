# Magic reference generation record

## Shared contract

Each identity used its own built-in `imagegen` call. The accepted chest supplied low-poly finish,
surface restraint, lighting, background, and three-view layout. Existing stone sheets supplied only
color and broad identity. Every sheet shows one object in orthographic front, orthographic right
profile, and rear-left three-quarter with fixed scale and part placement. Prompts banned scenery,
text, frames, hands, bloom, particles, floating parts unless gameplay needs them, bright neon,
perspective drift, and view changes.

## Accepted files

| Object            | Key construction                                                     | Accepted workspace file                  | Generated source                                | Review                                                                                        |
| ----------------- | -------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| resolve flask     | Smoky faceted bottle, dark-red liquid, cork, iron cage, brass shield | `magic/resolve-flask-three-view.png`     | `exec-b8d72a59-c6f1-42f9-a177-6cc8f826aa24.png` | Accepted first pass                                                                           |
| time freeze relic | Octagonal caps, four rails, protective ring, pale ice octahedron     | `magic/time-freeze-relic-three-view.png` | `exec-22a6fa85-cea0-4c5b-b70e-962aa9bb97b7.png` | Accepted first pass                                                                           |
| luminous ward     | Octagonal base, iron guard ring, ivory faceted core and rune tabs    | `magic/luminous-ward-three-view.png`     | `exec-d86e1f03-9d37-4c8c-ac0e-a2e6697819e3.png` | Accepted first pass                                                                           |
| ember stone       | Charred pedestal, cage, asymmetric red crystal, fixed fragments      | `magic/ember-stone-three-view.png`       | `exec-ad17e78f-d764-4c77-8075-fb9ecdbecbae.png` | Accepted first pass                                                                           |
| ash stone         | Soot-gray pedestal, cage, pale split crystal, fixed fragments        | `magic/ash-stone-three-view.png`         | `exec-aa5312f0-26bc-45ae-bd8e-1e4c0d596658.png` | Accepted first pass                                                                           |
| crypt stone       | Funerary pedestal, cage, blue chisel crystal, three fixed shards     | `magic/crypt-stone-three-view.png`       | `exec-d6351024-0697-4d61-a898-dc4423de1cd6.png` | One edit reduced excess shards from `exec-6d40eb45-2260-4196-9bdd-472d41adf045.png`           |
| verdant stone     | Moss-dark pedestal, cage, forked green core, three fixed fragments   | `magic/verdant-stone-three-view.png`     | `exec-c493524b-0b6a-470d-b2b0-c496a8631d3f.png` | One edit attached all floating fragments from `exec-c1b72f49-4e44-493e-8f37-03828c9134d9.png` |
| boss crystal      | Broad red nine-facet crystal, four claws, band, cracked plinth       | `magic/boss-crystal-three-view.png`      | `exec-5dd84ee0-7762-4d32-88bc-8cfc158ccb6d.png` | Accepted first pass                                                                           |
| shrine crystal    | Slender split amber crystal, three prongs, ring, stepped plinth      | `magic/shrine-crystal-three-view.png`    | `exec-c54792b1-5d70-487c-9cd0-d98256b641de.png` | Accepted first pass                                                                           |

## Corrections

- Crypt: keep exactly three small shards fixed inside the cage; remove every other shard.
- Verdant: remove every floating diamond and keep exactly three small fragments attached inside
  the cage.

The generated-image cache keeps rejected passes. Only accepted sources were copied here.
