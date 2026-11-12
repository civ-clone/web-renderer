# Asset System

## Why this matters

Game rendering depends on an imported asset set derived from original Civilization files (`TER257.PIC`, `SP257.PIC`).
`SP299.PIC` is optional (#64): the city screen's improvement and Wonder icons (`city-improvements/*`, `wonders/*`), which
the extractor lists under `optional` and the Civ1 tileset under `assets.optional`. Without it the import still goes
ahead, and `components/lib/buildingIcon.ts` draws nothing where an icon is missing.
Without imported assets, gameplay options are hidden and import is the primary onboarding flow.

## Main components

- `packages/menus/components/ImportAssetsWindow.ts`
  - UI flow for selecting source files and triggering extraction. It names no pack: it asks each registered pack's
    import (`packages/assets/lib/packImports.ts`, #97) which files it reads, which the import needs, what to say of
    them, and to read them. The music's `ASOUND.CVL` is the window's own (the `audio` package decodes it): it is no
    pack's art.
- `packages/tileset-civ1` (`@civ-clone/ui-tileset-civ1`, #97)
  - Civ1's art pack: its descriptor (`civ1.json`) and its import (`lib/civ1Import.ts`), which loading the package
    registers (`registerTileset`, as the interface's, and `registerPackImport`). `src/js/frontend.ts` loads it before
    anything else.
- `packages/assets/AssetStore.ts`
  - IndexedDB-backed storage of extracted assets, and the loader that decodes the tileset in use (#730).
- `packages/assets/lib/getPreloadedImage.ts`
  - The decoded sprites the map layers look up, by key, as `AssetStore.load` leaves them.
- `@civ-clone/civ1-asset-extractor`
  - External package that performs sprite extraction from source files, for `tileset-civ1`.
  - A GitHub dependency (`github:civ-clone/civ1-asset-extractor`), listed in `package.json["civ-clone"].excludes` so
    it is not imported as an engine plugin.
  - `extract-data.json` holds the sprite definitions: per source file, per asset path, rows of sprites with their
    rectangles, over `defaults` of 16×16 and a transparent colour of `rgb(0, 170, 170)`.
- `@civ-clone/civ2-asset-extractor` (#97)
  - Cuts the map's sprites from a player's own Civilization II sheets (`TERRAIN1.GIF`, `TERRAIN2.GIF`, `UNITS.GIF`,
    `CITIES.GIF`), with each unit's and city's anchors and the flags' colours. A GitHub dependency excluded from the
    plugins like Civ1's. `packages/menus/lib/civ2Import.ts` drives it for the import window.

## Asset import flow

1. User opens **Import Assets** from main menu, or under the modern interface from Options' Assets row (#749).
2. UI checks that every file the import needs (a pack's `requiredFiles`: Civ1's, those in the extractor definitions,
   `extract-data.json`, but its optional ones) is among the selected files, matching names case-insensitively.
3. Each file goes to the pack whose import `accepts` it, and each pack's import reads its own files, side by side. A
   file no pack reads is left out, with a console warning. For each of Civ1's files (`tileset-civ1/lib/civ1Import.ts`):
   - Picks the definitions for that file. A group of sprites (an asset path such as `city/people`) whose every sprite
     is already stored is skipped, unless "replace existing" is set. So a re-import picks up sprites added to the
     extractor since the last one without re-extracting the rest.
   - Reads binary string via `FileReader`.
   - Runs `extractSprites(...)` with matching definitions.
   - Receives records `{ name, uri }`: `name` is the asset path (`./assets/<path><name>.png`), `uri` a PNG data URL.
4. Each is turned into `{ name, blob }`, the PNG as a `Blob` (`assetFromURI`), and every pack's records, then the
   music's, are persisted via `assetStore.setAll(records)`, in a single transaction, into IndexedDB database `civ-clone-assets` (object store
   `assets`).
5. `assetStore.hasAllAssets()` validates required set. If anything is missing, the window lists
   `assetStore.missingAssets()` and the file input is enabled again.
6. On success, page reloads to reinitialize UI with assets present (`allowLeaving()` first, so the leave guard does
   not ask).

### Civilization II's sheets (#97)

The same window takes Civ2's four sheets, recognised by name whatever its case, alongside Civ1's files or, once Civ1's
sprites are in, on their own (as `ASOUND.CVL` is): its import (`civ2Import` in `packages/menus/lib/civ2Import.ts`,
registered there until Civ2's pack is a package of its own) has no `requiredFiles`. The instructions name them as optional, for the isometric map; once
any are imported, the window says whether Civ2's art is complete or which sheets are still to import
(`civ2FilesToImport`: those holding a sprite `civ2.json` requires that isn't stored, or whose anchors or flag colours the
stored record lacks, flag colours that aren't a flag's being lacking). Options' Assets row says the same (`civ2Status`).
Flag colours are held to one rule wherever they're read (`isFlagRow` in `packages/assets/lib/packs.ts`): the import
cuts the flags again for a record that fails it, the window lists CITIES.GIF for it, and the installer leaves the pack
out.

- Each sheet's bytes go to the Civ2 extractor's `extractSprites`, by its definition in that extractor's
  `extract-data.json`; without "replace existing", a grid whose every sprite is stored is left out, unless it has
  markers and the stored record lacks the anchors of any of its sprites (or can't be read at all), and a sheet with
  nothing left isn't read. The flags' colours are read again only when the record lacks them, after checking that
  the sheet has 256 colours and every flag inside it, and refused unless every flag's colours come out.
- A sheet that can't be read stops the import, naming it, when only Civ2's sheets were chosen. Among Civ1's files it
  is left out with a console warning, Civ1's are imported, and the window names the sheet it left out.
- Each sprite's RGBA is put on a canvas and stored as its PNG (`toBlob`) under Civ2's pack's key, `spriteKey(civ2Pack,
name)`: `./assets/civ2/units/settlers.png`. `civ2Pack` (`packages/assets/lib/packs.ts`) is the pack's id, `civ2`,
  and its storage; the descriptor that says which sprites it requires is bundled separately.
- The anchors and the flags' colours go in one record beside the sprites, `./assets/civ2/metadata.json`
  (`metadataKey`), as a JSON `blob` shaped as the extractor's `metadata.json`: `{ anchors: SpriteAnchors, colours }`.
  An import of some of the sheets is put over what the record held, so the others' anchors are kept; a record that
  can't be read is replaced by what this import cut.
- `RULES.TXT` is taken and left alone: units keep the extractor's default names for now.
- The import still ends on Civ1's check: it is done when Civ1's required sprites are all in. When Civ2's sheets were
  among the files and one was left out or Civ2's art is still incomplete, the page is not reloaded, so the window's
  message can be read, and files can be chosen again; the player reloads.

## Installed packs (#97)

Both tilesets are bundled (`bundledTilesets()` in `packages/assets/lib/tilesets.ts`, the interface's first): Civ1's
`civ1.json` on the square grid, which `tileset-civ1` registers as the interface's, and Civ2's `civ2.json` on the
staggered isometric grid, which `tilesets.ts` registers itself for now (`registerTileset(tileset, { metadata: true })`). A pack is _installed_ once its sprites are imported:

- At start-up `installPacks()` (`packages/assets/lib/installPacks.ts`) adds every bundled pack to the asset store
  (`packFor`: Civ2's with `metadata: true`, as it was registered), loads them, sets each pack's sprite anchors from its import's record
  (`setSpriteAnchors`), and installs (`installTilesets`) Civ1's and each pack that has every required sprite and a
  readable record whose flags' colours pass `isFlagRow`. A pack that fails any of that, or a store that fails, is
  left uninstalled, and the game still starts with Civ1's. The import reloads the page, which runs it again.
- `installedTilesets()` is then synchronous, so `supportedTopologies()` is `['square', 'staggered-iso']` with Civ2's art
  imported and `['square']` without. New Game's grid question and the setup forms' grid select appear only with more
  than one grid.
- An installed Civ2 pack's flag keys are the import's own red flag's colours (`colours.flag[0]`, primary then
  secondary), put over the descriptor's `#f30000` and `#a70000` (Civ2's as shipped) by `withImportedKeys`: the flag is
  recoloured by swapping exactly those colours, and a copy might differ. The unit shield's key is its pure red,
  `#ff0000`.
- The map is drawn with `mapTileset(topologyId)`, the installed pack for the world's grid (or the bundled one, sprites
  missing, if none is installed, which loading refuses before then): `Map.tileset()`, `Portal`'s projection and default
  tile size and scale, `MapView` and the minimap all take the world's `topologyId()`. `setMapGrid` (from `MapView`)
  makes it the default for the windows' units (`hud/Unit`, the unit card), which follow the map's pack, at no more than
  its own default scale (`shownScale`), and for Options' map scale. Each pack keeps its own scale option
  (`mapScaleOption`: Civ1's `mapScale`, Civ2's `mapScale.civ2`).
- The interface's art keeps coming from `interfaceTileset()`, Civ1's, the pack registered with `interface: true`;
  `currentTileset()` is the same Civ1 tileset. Until a package registers one, both throw, naming what to load; the
  asset store made as the page loads (`assetStore`) asks for its tileset only when it is first used.
- A save on a grid whose bundled pack isn't installed is refused naming the pack to import (`SavedGame.needs-import`,
  `tilesetToImport`).

### Civ2's descriptor

`civ2.json` names only sprites the Civ2 extractor cuts, under its names, and requires every one the map can ask it for
(`npm run test:tilesets` checks both). Its choices:

- Terrains by their own name lower-cased, with Arctic as `glacier`; River is drawn on grassland's base with the river
  overlay; Forest, Hills and Mountains on their own `base-0` with their 16-way overlays. No `base-1`, no dither,
  no fog (Civ2 has none). Irrigation is drawn over the terrain.
- Specials: as each terrain's Civ2 resource, with `Swamp:Oil` as `swamp/peat` (Civ2's swamp has no oil).
- Units by the MGE default names (RULES.TXT is ignored): Horseman `horsemen`, Knight `knights`, MechanizedInfantry
  `mech-inf`, Musketman `musketeers`, Nuclear `nuclear-msl`, Rifleman `riflemen`, Sail `caravel`, Spearman `phalanx`,
  Swordman `legion`, Tank `armor`, Warrior `warriors`, the rest their own name.
- Cities by style per civilization, fixed for the game: Civ2's own style for the civilizations it has (`@LEADERS`),
  and one by region for the rest, `ancient-classical` for any other. Sizes 1–3, 4–7, 8–11 and 12 and over; walls
  from `walled-`.
- Coast quarters are named for their three neighbours last-clockwise first: the top quarter `n` for `ne`, `n`, `nw`,
  so `n-001` has land along its NW edge (`tests/ui/tilesetDrawing.ts` pins one case per quarter against `civ2.json`).
- Units and cities are 64 × 48, drawn 16 px above the tile. The map draws its units over its cities for a `styles`
  pack (`MapView`), so a unit in a city stands in front of it; Civ1's box cities stay over their units.
- The active unit's ring is the tile's diamond (`Projection.outline`), drawn on the map under the unit
  (`ActiveUnit.setRing`), in the theme's ring colours over its halo, its line as wide as the map's scale makes it:
  steady with the ring alone, blinking with the unit with both. Over the map it would cut through the tall sprite. The
  square grid keeps its pulsing ring over the map.
- A choice list fits a tall unit's icon in its square (`object-fit: contain`). A stack shows `units/shield-back` 4 px
  up and left of the shield.

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
  tileset descriptor's `assets` (`packages/tileset-civ1/civ1.json`, through `currentTileset()` in
  `packages/assets/lib/tilesets.ts`, #56); `new AssetStore(tileset)` reads another one's. Civ2's pack is loaded beside
  it (see Installed packs).
- More packs beside that one (#97): `new AssetStore(tileset, packs)` or `addPack(pack)`, each an `AssetPack` (a
  descriptor's `id`, `storage` and `assets`, and `metadata: true` for a pack whose import keeps a record of its
  sprites' anchors, as Civ2's does), such as the map's when it isn't the interface's. `hasAllAssets(pack)`,
  `missingAssets(pack)` and `importedCount(pack)` say how far each one is imported; without a pack they mean the store's
  own tileset, which is what start-up waits for.
- `load()`: reads its packs' required and optional sprites, and no other's, into the one lookup (their keys never
  collide), with the import metadata of each pack that has some (`metadata(pack)`; `readMetadata(pack)` rejects for a
  record that can't be read), and decodes each sprite with
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

A tileset pack describes itself in a JSON descriptor (Civ1's is `packages/tileset-civ1/civ1.json`): its grid, tile
size and map scales, the sprites it has, how each kind of thing's sprites are named and put together, and how player
colours go on. `packages/assets/tilesets/tileset.schema.json` is a JSON Schema (draft 2020-12) for it, with a title or
description on each field, so a pack author's editor can complete and explain the fields and flag a wrong one as it is
typed (#869). A descriptor names it with `"$schema"`, as Civ1's does (`"../assets/tilesets/tileset.schema.json"`, from
its package beside `assets`) and Civ2's (`"./tileset.schema.json"`, beside it); another
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
  terrain drawn over another's base: Forest, Hills, Mountains and River over Grassland. A terrain `under` leaves out is
  drawn over its own base (Civ2's forest, hills and mountains each have one). The overlays (forest, hills, mountains,
  river) are the terrain family as a `bitmask` over the grid's edge neighbours, joined with `-`, so Civ1's River is the
  grassland base with the river over it. Only one base variant per terrain is used: Civ2's `base-1` alternatives are
  left out.
- **Roads and railroads over all eight neighbours**, with an `isolated` sprite rather than a dot.
- **A coast of named quarters.** `sprite: "terrain/coast/{corner}-{bits}"` and `corners`, each with its top-left `at`
  in the tile and its `neighbours` in the order `{bits}` writes them, one digit each, `1` for land: Civ2's top quarter
  `n` is named for `ne`, `n` and `nw` in that order (each quarter's last neighbour clockwise first), so `n-011` has
  land to the N and NW, and `n-001` to the NW alone. A coast tile is drawn with all four, those
  with no land beside them (`n-000`) too, as a coast quarter's water is not the open ocean's (Civ1's coast square has its
  open-water quarters the same way); the open ocean is its base alone. Each tile put together is cached by tileset and
  the quarters' bits.
- **River mouths by direction.** `families.riverMouth` is `edges` with `{dir}`: the Civ2 extractor names its four mouths
  `terrain/river-mouth/ne`, `se`, `sw` and `nw` (civ-clone/civ2-asset-extractor#1), the river bitmask's edge order.
- **No fog.** `families.fog` may be left out; the edge of what a player has seen is then drawn without one, a hard edge
  as Civ2 has. Nor do cursor or dither sprites have to be listed: dither is not drawn.
- **Shields.** An `overlay` colouring: `sprite` (the shield) drawn over the unit with its `keys` swapped for the
  player's colours, its top-left corner at `anchor`, and `stack.sprite` (the back-shield) drawn behind it, `stack.offset`
  from it, for a unit in a stack. `units.stackOffset`, Civ1's copy of the whole unit behind a stack, may then be left
  out.
- **Anchors per sprite.** An `anchor` is a point in native px, or the name of an anchor each sprite carries, such as
  `"shield"`. Those come with the pack's sprites, not its descriptor: `SpriteAnchors`, by sprite and then anchor name
  (`{ "units/settlers": { "shield": { "x": 12, "y": 12 } } }`), as the Civ2 extractor's `metadata.json` gives them from
  marker pixels in the player's own copy. At runtime the map reads them through `spriteAnchors(tileset)` and
  `resolveAnchor(tileset, sprite, anchor)` (`packages/assets/lib/spriteAnchors.ts`), a registry by tileset id that
  whatever loads a pack's sprites fills with `setSpriteAnchors(id, anchors)` (the Civ2 import, when it comes). A sprite
  without the anchor named has nothing drawn there: no shield, no flag, and its size written where `labels.x` and
  `labels.sizeBaseline` put it.
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
cannot draw yet: a `box` city with an `overlay` colouring, or with an `anchor` (its sprite goes `inset` in from the
tile's corner). Every tileset the game
uses goes through `validateDescriptor`, so `Cities`, which takes a box city's colouring as `replaceColours`, can rely on
it. Each of those leaves the list as the map learns to draw it.

The map draws the shields, styles cities and tall sprites (#97): `renderUnit` draws a unit's sprite as it is, then the
back-shield for a unit in a stack and the shield over it, both recoloured, cut off at the unit sprite's edges; `Units`
and `ActiveUnit` draw it at `units.anchor`, with no copy behind a stack when there is no `stackOffset`; `Cities` draws
a `styles` city's sprite at `cities.anchor` with no box, and its flag, recoloured, at the sprite's `flag` anchor (a
rival's city is drawn without walls, as the page is not told its improvements, #688); `CityNames` writes the size from
the sprite's `labels.size` anchor, left-aligned; and `Unworkable` fills the projection's `outline()`, a diamond on the
isometric grid, rather than the tile's box. The interface's own art the map draws over its tiles (the yields, a city's
unhappy citizen, the banners' icons, the action buttons' pictures) comes from `interfaceTileset()`, Civ1's, whatever the
map is drawn with, through `Map.getInterfaceImage`. What the format itself refuses (a `corners` or
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
