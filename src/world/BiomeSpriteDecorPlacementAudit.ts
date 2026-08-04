import type { DungeonMoodId } from "../systems/DungeonMood";
import type {
  BiomeSpriteDecorCatalog,
  BiomeSpriteDecorDefinition,
} from "./BiomeSpriteDecorContract";

/**
 * Visual audit of every v2 floor prop against its atlas cell.
 *
 * All current cells are authored as orthographic-front silhouettes. None has
 * a top-down projection that can lie flat on a tile without false perspective,
 * so every retained floor prop is constrained to a room edge or corner.
 */
export const BIOME_FLOOR_PROP_PLACEMENT_AUDIT: Readonly<Record<DungeonMoodId, readonly string[]>> =
  Object.freeze({
    ancient: [
      "straw-sleeping-roll",
      "three-leg-stool",
      "split-firewood-stack",
      "hemp-rope-coil",
      "grain-sack-slump",
      "dropped-key-ring",
      "discarded-waterskin",
      "carpenter-trestle",
      "rat-trap-board",
      "broken-handcart-wheel",
    ],
    molten: [
      "cracked-quench-trough",
      "collapsed-bellows",
      "slag-ingot-stack",
      "broken-crucible-cradle",
      "charred-heat-screen",
      "clinker-rake-head",
      "fallen-furnace-door",
      "basalt-wedge-bundle",
      "fused-clinker-mound",
      "burned-leather-apron",
    ],
    frost: [
      "broken-snowshoe-pair",
      "split-ice-saw",
      "collapsed-hand-sled",
      "frozen-wicker-pannier",
      "rime-stalagmite-cluster",
      "frost-sealed-water-jug",
      "ice-block-carrier-tongs",
      "rime-caked-survey-tripod",
      "discarded-fur-hood",
      "blue-ice-calving-block",
    ],
    grim: [
      "collapsed-funeral-bier",
      "split-grave-footstone",
      "shattered-ossuary-urn",
      "gravedigger-boot-pair",
      "extinguished-vigil-candle-colony",
      "snapped-coffin-footboard",
      "eroded-stone-mourner",
      "grave-beetle-nest",
      "broken-tomb-effigy-hand",
      "mortuary-neck-rest",
    ],
    verdant: [
      "burst-moonseed-husk",
      "root-lifted-paving-slab",
      "thorn-bramble-tumble",
      "uprooted-medicinal-root-bundle",
      "amber-sap-nodule-mound",
      "compressed-leaf-compost-brick",
      "split-pollinator-log",
      "water-worn-root-arch",
      "dormant-bulb-cluster",
      "woven-root-stepping-arch",
    ],
    ash: [
      "collapsed-charcoal-chair",
      "ash-buried-work-boots",
      "burned-book-block",
      "heat-fused-bottle-trio",
      "scorched-washboard",
      "fire-shrunken-travel-satchel",
      "fire-warped-cart-rim",
      "collapsed-travel-chest",
      "burned-hand-drum",
      "collapsed-spinning-wheel",
    ],
    iron: [
      "rust-fused-gear-cluster",
      "ruptured-pressure-tank",
      "collapsed-maintenance-jack",
      "broken-spring-pack",
      "crushed-cable-reel",
      "spilled-rivet-hopper",
      "corroded-pump-impeller",
      "fused-rail-clamps",
      "collapsed-pressure-hose",
      "magnetized-iron-filings",
    ],
    obsidian: [
      "snapped-prism-columns",
      "collapsed-lens-stand",
      "broken-glass-hourglass",
      "fractured-balance-scale",
      "split-glass-basin",
      "mirror-splinter-sphere",
      "fallen-shard-wheel",
      "collapsed-glass-harp",
      "prism-counterweights",
      "vitrified-ripple-slab",
    ],
    sunken: [
      "half-buried-anchor",
      "collapsed-diving-helmet",
      "cracked-ship-bell",
      "waterlogged-oar-bundle",
      "strapped-ballast-mound",
      "broken-giant-clam",
      "crushed-navigation-buoy",
      "collapsed-cargo-crate",
      "broken-capstan-body",
      "corroded-sextant",
    ],
    fungal: [
      "collapsed-mushroom-cluster",
      "burst-giant-puffball",
      "tooth-fungus-stool",
      "slime-mold-log",
      "cup-fungus-weight",
      "ruptured-spore-husks",
      "antler-fungus-masonry",
      "mildewed-tile-stack",
      "collapsed-puffball-rind",
      "mycelium-bound-bricks",
    ],
    backrooms: [
      "collapsed-office-chair",
      "gutted-water-cooler",
      "soggy-archive-box",
      "dead-crt-monitor",
      "overturned-wastebasket",
      "mildewed-carpet-roll",
      "shattered-ceiling-tile-pile",
      "unplugged-floor-fan",
      "crushed-filing-drawer",
      "gutted-photocopier",
    ],
  });

const auditedCatalogs = new WeakMap<BiomeSpriteDecorCatalog, BiomeSpriteDecorCatalog>();

/** Apply the visual audit once and fail fast if generated art and semantics drift. */
export function applyBiomeSpriteDecorPlacementAudit(
  catalog: BiomeSpriteDecorCatalog,
): BiomeSpriteDecorCatalog {
  const cached = auditedCatalogs.get(catalog);
  if (cached) return cached;

  const expected = new Set(BIOME_FLOOR_PROP_PLACEMENT_AUDIT[catalog.biome]);
  const actual = catalog.props.filter((prop) => prop.surface === "floor");
  if (actual.length !== expected.size || actual.some((prop) => !expected.has(prop.id))) {
    throw new Error(`${catalog.biome} floor prop placement audit is stale`);
  }

  const props = catalog.props.map((prop): BiomeSpriteDecorDefinition => {
    if (prop.surface !== "floor") return prop;
    return { ...prop, placement: "corner-standing" };
  });
  const audited = { ...catalog, props };
  auditedCatalogs.set(catalog, audited);
  return audited;
}
