# Asset System

## Why this matters

Game rendering depends on an imported asset set derived from original Civilization files (`TER257.PIC`, `SP257.PIC`).
`SP299.PIC` is optional (#64): the city screen's improvement and Wonder icons (`city-improvements/*`, `wonders/*`), which
the extractor lists under `optional` and the Civ1 tileset under `assets.optional`. Without it the import still goes
ahead, and `components/lib/buildingIcon.ts` draws nothing where an icon is missing.
Without imported assets, gameplay options are hidden and import is the primary onboarding flow.

## Main components

- `packages/menus/components/ImportAssetsWindow.ts`
  - UI flow for selecting source files and triggering extraction.
- `packages/assets/AssetStore.ts`
  - IndexedDB-backed storage of extracted assets, and the loader that decodes the tileset in use (#730).
- `packages/assets/lib/getPreloadedImage.ts`
  - The decoded sprites the map layers look up, by key, as `AssetStore.load` leaves them.
- `@civ-clone/civ1-asset-extractor`
  - External package that performs sprite extraction from source files.
  - A GitHub dependency (`github:civ-clone/civ1-asset-extractor`), listed in `package.json["civ-clone"].excludes` so
    it is not imported as an engine plugin.
  - `extract-data.json` holds the sprite definitions: per source file, per asset path, rows of sprites with their
    rectangles, over `defaults` of 16×16 and a transparent colour of `rgb(0, 170, 170)`.

## Asset import flow

1. User opens **Import Assets** from main menu, or under the modern interface from Options' Assets row (#749).
2. UI checks that every file named in the extractor definitions (`extract-data.json`) is among the selected files,
   matching names case-insensitively.
3. For each file:
   - Picks the definitions for that file. A group of sprites (an asset path such as `city/people`) whose every sprite
     is already stored is skipped, unless "replace existing" is set. So a re-import picks up sprites added to the
     extractor since the last one without re-extracting the rest.
   - Reads binary string via `FileReader`.
   - Runs `extractSprites(...)` with matching definitions.
   - Receives records `{ name, uri }`: `name` is the asset path (`./assets/<path><name>.png`), `uri` a PNG data URL.
4. Each is turned into `{ name, blob }`, the PNG as a `Blob` (`assetFromURI`), and they are persisted via
   `assetStore.setAll(records)`, in a single transaction, into IndexedDB database `civ-clone-assets` (object store
   `assets`).
5. `assetStore.hasAllAssets()` validates required set. If anything is missing, the window lists
   `assetStore.missingAssets()` and the file input is enabled again.
6. On success, page reloads to reinitialize UI with assets present (`allowLeaving()` first, so the leave guard does
   not ask).

## Sprite overlays

A sprite in `extract-data.json` can have an `overlay`: rows of palette indices, two hex digits per pixel, with `..`
keeping the original pixel. `extractSprites` writes it over the sprite once it is cut out, using the colours of the
player's own file's palette, and then knocks out the transparent colour. New sprites can be made from the originals
this way while the extractor holds only the changed pixels.

The women specialists are made like this: `city/people_tax_f`, `city/people_science_f` and `city/people_luxury_f` are
the Tax Collector, Scientist and Entertainer drawn over the men's sprites (#334).

## Optional assets

Not every extracted sprite is required. The women specialists are deliberately listed under the tileset's
`assets.optional` rather than `assets.required`, so assets imported before they existed still pass the readiness check.

Code that draws an optional sprite falls back to an older one. `assetStore.firstImported(paths)` returns the first of
`paths` that has been imported, or the last of them if none has. The city screen's citizens (`renderCitizen` in
`packages/city/components/lib/cityYields.ts`) ask for `[people_<type>_f, people_<type>]` for a woman specialist (from
`specialistSprites` in `packages/client/lib/citizens.ts`), so they show the man until the player imports again.

## Asset persistence and loading

`AssetStore` extends generic `Store` wrapper and provides:

- Persistent storage (`idb`) keyed by asset `name`. A record holds the sprite's PNG as `blob`. Imports from before #730
  hold a data URI in `uri` instead; `load` turns each into a `blob` the first time it reads it, and writes it back.
- The required sprites (286 for Civ1) as the runtime readiness check, and the optional ones. Both lists come from the
  tileset descriptor's `assets` (`packages/assets/tilesets/civ1.json`, through `currentTileset()` in
  `packages/assets/lib/tilesets.ts`, #56); `new AssetStore(tileset)` reads another one's.
- `load()`: reads the tileset's own required and optional sprites, and no other pack's, decodes each with
  `createImageBitmap` (or, if a bitmap hasn't come within 5 seconds, loads it as an `<img>`, whose `load` event comes
  in a background tab too: `decodeSprite`), and hands them to the map's lookup (`setSprites`). A sprite that will not decode, or an old record
  that cannot be read, is reported and left out, so it is drawn as missing rather than holding the game up. `load`
  never rejects: if the store cannot be read at all, the game goes on without the sprites, so the main menu and the
  import are still there. Of two loads at once, the later one's sprites are kept. `Renderer.init` awaits it before anything is
  drawn, so drawing code finds a sprite or its absence, never one still on its way. `ready` is the last load.
- `firstImported(paths)` for optional assets (see above).
- For the interface: `getScaled(path, scale)` and `getShownAt(path, width)` canvases from the decoded sprites, and
  `shownAtURL(path, width)`, the URL an `<img>` shows, made once per sprite and width. None of them keep a result for a
  sprite that isn't loaded.

The map layers look sprites up by name with `getPreloadedImage()` (for example `units/settlers` or `city/food`),
synchronously, from what `load` decoded.

A sprite's key, its record's `name`, is the tileset's `storage.prefix + name + storage.ext` (`spriteKey` in
`packages/assets/tilesets/TilesetDescriptor.ts`): `./assets/units/settlers.png` for Civ1, as the import has always stored
it. Another pack keeps its sprites under `./assets/<id>/`. `getPreloadedImage()` matches the whole key and nothing
else, so a second pack's sprite of the same name is never taken for Civ1's (#56).

It returns the decoded sprite itself, not a copy, and a blank canvas for a sprite that isn't loaded, with one console
error per missing sprite rather than one per draw. Caches built from the sprites, such as `replaceColours`,
`renderUnit` and the coast tiles, hand out shared entries that callers must treat as immutable, and are cleared
through `onPreloadedImagesChanged` on each load.

## Tileset descriptor and its schema

A tileset pack describes itself in a JSON descriptor (Civ1's is `packages/assets/tilesets/civ1.json`): its grid, tile
size and map scales, the sprites it has, how each kind of thing's sprites are named and put together, and how player
colours go on. `packages/assets/tilesets/tileset.schema.json` is a JSON Schema (draft 2020-12) for it, with a title or
description on each field, so a pack author's editor can complete and explain the fields and flag a wrong one as it is
typed (#869). A descriptor names it with `"$schema"`, as Civ1's does (`"./tileset.schema.json"`, beside it); another
pack points it at `https://civ.one/dist/tileset.schema.json`, where the build puts a copy (the schema's `$id`), or the
editor is told which schema the pack's descriptor has (VS Code's `json.schemas` setting). The game ignores `$schema`,
and the build leaves the schema's titles and descriptions out of the game's bundle (`esbuild.js`).

`readDescriptor` (`packages/assets/tilesets/TilesetDescriptor.ts`) checks a descriptor against the same schema first,
with the small checker in `packages/assets/lib/jsonSchema.ts`, which knows only the keywords the schema uses and refuses
a schema with any other. Its `x-message` annotations (ignored by other validators) are the sentences a refused pack is
told, such as `Tileset "civ1": families.road.method "dither" cannot be drawn yet (#92).`. Then it checks what a schema
cannot say:

- the grid is one the engine knows (the engine's list, so a new grid needs no change to the schema);
- `defaultScale` is one of `scales`, no sprite is listed twice across `assets.required` and `assets.optional`, and
  `fallback` is not the tileset's own id;
- the coast is a strip or named quarters, not both. A strip's `cell` is two `quarter`s, and its `order` names each of a
  square tile's eight neighbours once. Named quarters have `{corner}` and `{bits}` in their `sprite`, and each corner's
  `neighbours` are directions on the descriptor's own grid (`createTopology(grid)`), each once, with its `at` within the
  tile;
- each sprite name has only the placeholders the map fills there (`{terrain}` in `families.base.land` and the terrain
  family, `{dirs}` for a `bitmask` family, `{dir}` for `edges`, `{unit}`, `{corner}` and `{bits}` for the coast, `{style}`,
  `{size}` and `{walls}` for a `styles` city, …), and `families.base.under` only comes with a base per terrain, each
  terrain in it over one with a base of its own (not itself, and not one that is over another in turn);
- a colouring's `colours` has one entry per key, an `overlay` has a `sprite` and an `anchor` (and `replaceColours` has
  neither), only a unit's overlay has a `stack`, units show a stack somehow (a `stackOffset`, or an overlay's `stack`),
  and a city's `disorderIcon` is within the tile;
- a `box` city has an `inset` and an `occupied` colour, and no `styles`; a `styles` city has `styles` and an `overlay`
  colouring (its flag), and neither of a box's. Its style names are each listed once, the default and each civilization's
  are among them, its size buckets go up, and its `sprite` has each of `{style}`, `{size}` and `{walls}` that tells two
  sprites apart;
- a units or cities `anchor` above or left of the tile is within `geometry.overhang`.

So a descriptor the schema accepts can still be refused; one it refuses always is. Neither checks whether the map can
draw the descriptor's grid at its tile size: that is for the map as it takes the tileset (`nativeTileSize` in
`packages/assets/lib/tilesets.ts`, and the grid's projection, registered with `registerGrid`).

### What the format says, and what the map draws

The format can say what a pack shaped like Civ2's needs (#152), so its descriptor can be written and checked before the
map draws it (`tests/ui/fixtures/iso-tileset.json` is one, its sprite names in the Civ2 extractor's style, with no sprites):

- **A base per terrain.** `families.base.land` with `{terrain}` (`terrain/{terrain}/base-0`), and `under` for a
  terrain drawn over another's base: Forest, Hills, Mountains and River over Grassland. The overlays (forest, hills,
  mountains, river) are the terrain family as a `bitmask` over the grid's edge neighbours, joined with `-`. Only one base
  variant per terrain is used: Civ2's `base-1` alternatives are left out.
- **Roads and railroads over all eight neighbours**, with an `isolated` sprite rather than a dot.
- **A coast of named quarters.** `sprite: "terrain/coast/{corner}-{bits}"` and `corners`, each with its top-left `at`
  in the tile and its `neighbours` in the order `{bits}` writes them, one digit each, `1` for land: Civ2's top quarter
  `n` is picked by `nw`, `n` and `ne`, so `n-011` has land to the N and NE.
- **River mouths by direction.** `families.riverMouth` is `edges` with `{dir}`: the Civ2 extractor names its four mouths
  `terrain/river-mouth/ne`, `se`, `sw` and `nw` (civ-clone/civ2-asset-extractor#1), the river bitmask's edge order.
- **No fog.** `families.fog` may be left out; the edge of what a player has seen is then drawn without one. Nor do
  cursor or dither sprites have to be listed.
- **Shields.** An `overlay` colouring: `sprite` (the shield) drawn over the unit with its `keys` swapped for the
  player's colours, its top-left corner at `anchor`, and `stack.sprite` (the back-shield) drawn behind it, `stack.offset`
  from it, for a unit in a stack. `units.stackOffset`, Civ1's copy of the whole unit behind a stack, may then be left
  out.
- **Anchors per sprite.** An `anchor` is a point in native px, or the name of an anchor each sprite carries, such as
  `"shield"`. Those come with the pack's sprites, not its descriptor: `SpriteAnchors`, by sprite and then anchor name
  (`{ "units/settlers": { "shield": { "x": 12, "y": 12 } } }`), as the Civ2 extractor's `metadata.json` gives them from
  marker pixels in the player's own copy.
- **City styles.** `cities.mode: "styles"` with `sprite: "city/{style}/{walls}{size}"`, `styles` (the style names, a
  default, a style by civilization as the engine names it, the city size each `{size}` bucket starts at, and the
  `{walls}` words), and `labels.size`, where the size is written. The player's flag is the cities' `overlay` colouring:
  `{ "mode": "overlay", "sprite": "city/flag", "keys": [...], "anchor": "flag" }`, the flag sprite (which the Civ2
  extractor cuts from the first, red, flag) with its two colours as the keys, swapped for the player's, at each city
  sprite's own `flag` anchor.
- **Not yet: a city style by era.** Civ2 changes a civilization's city style as it reaches later ages. The format has one
  style per civilization (M1's decision D4); a style by era needs the engine to send something the renderer can key it
  on, as the renderer knows no rules, so it is not in the format.
- **Tall sprites.** `units.anchor` and `cities.anchor` put a sprite's top-left corner above the tile (`{ x: 0, y: -16 }`
  for a 64 × 48 sprite on a 64 × 32 tile), with `geometry.overhang.top` leaving room for it.
- **Fallback.** `fallback` names the tileset the sprites this one leaves out come from: interface art under `assets.ui`
  prefixes it does not have, and missing optional sprites. Nothing looks sprites up there yet.

`validateDescriptor` is `readDescriptor` and then `notDrawnYet`, which names the first thing in a descriptor that the map
cannot draw yet: a base per terrain, named quarters, a units descriptor without `stackOffset`, an `overlay` colouring,
`styles` cities, `labels.size`, and a units or cities `anchor` off the tile's corner. Every tileset the game uses goes
through `validateDescriptor`, so the layers that take a colouring as `replaceColours`, or read a box city's `inset`, can
rely on it. Each of those leaves the list as the map learns to draw it. What the format itself refuses (a `corners` or
`dither` family other than the coast) is refused by the schema.

## Runtime usage patterns

- Main menu checks `assetStore.hasAllAssets()` to gate gameplay options (new game, Earth, customise world, load game).
- Renderer sets custom cursor using scaled imported asset (`cursor/torch`, enlarged to the tileset's `ui.cursor`).
- Windows and reports (city screen, City Status, Happiness, Trade and Science reports) resolve images from
  `AssetStore` by canonical path, through `shownAtURL(path, width)`. The width is the tileset's
  `ui` size (#729): `ui.icon` for a yield's icon, `ui.citizen.width` for a citizen. `getShownAt` enlarges the sprite a
  whole number of times to at least that width, and the stylesheets show it at that size through `--tileset-icon`,
  `--tileset-citizen-width` and `--tileset-citizen-step`, which `setTilesetSizes` sets on `:root` at start-up.
- Map layers look up the decoded sprites (see above).

## Edge cases and current behavior

- Missing required files produces explicit translated error in import window.
- Optional "replace existing" allows re-extracting even if assets exist. The checkbox is drawn ticked, but the option
  starts off and only follows the checkbox once it is changed.
- Browser-specific caveat: Brave fingerprinting can distort imported visuals (noted in README, and shown in the import
  window when `navigator.brave` is present).
- The required list is large, so any mismatch in naming/path conventions fails readiness. `npm run test:tilesets`
  checks that the extractor cuts out every sprite the tileset lists, and no other.
- `npm run test:tilesets` also reads the Civ2-shaped fixture, and checks each way a descriptor in that format is
  refused and each thing `notDrawnYet` names.
- `npm run test:json-schema` checks the schema checker keyword by keyword, and that it refuses a schema with a keyword
  it doesn't know.
- An image that fails to load is not cached, so a later import can replace it.
- `npm run test:asset-slices` checks that every unit sprite in `extract-data.json` is cut out at 15×15 (#12).
- `npm run test:sprite-keys` checks that every sprite the map asks for is found as it was before lookups took the whole
  key, and that a second pack's sprites are not taken for Civ1's.

## Rewrite recommendations

- Isolate extraction, validation, and persistence into a dedicated asset service module.
- Version the asset schema (to support future tilesets/asset packs). Done for the tileset descriptor (`schema: 1`,
  #56); the store's records themselves are still unversioned.
- Move required-asset manifest to declarative data file instead of hardcoded class field. Done: the tileset
  descriptor's `assets` lists (#56).
- Preserve IndexedDB caching, but add migration strategy for asset format changes. Partly addressed: optional assets
  with a fallback (`firstImported`) let new sprites arrive without invalidating an existing import, and a re-import
  extracts only the groups with something missing.
