# Asset System

## Why this matters

Game rendering depends on an imported asset set derived from original Civilization files (`TER257.PIC`, `SP257.PIC`).
Without imported assets, gameplay options are hidden and import is the primary onboarding flow.

## Main components

- `src/js/UI/components/ImportAssetsWindow.ts`
  - UI flow for selecting source files and triggering extraction.
- `src/js/UI/AssetStore.ts`
  - IndexedDB-backed storage of extracted assets, and the loader that decodes the tileset in use (#730).
- `src/js/UI/lib/getPreloadedImage.ts`
  - The decoded sprites the map layers look up, by key, as `AssetStore.load` leaves them.
- `@civ-clone/civ1-asset-extractor`
  - External package that performs sprite extraction from source files.
  - A GitHub dependency (`github:civ-clone/civ1-asset-extractor`), listed in `package.json["civ-clone"].excludes` so
    it is not imported as an engine plugin.
  - `extract-data.json` holds the sprite definitions: per source file, per asset path, rows of sprites with their
    rectangles, over `defaults` of 16×16 and a transparent colour of `rgb(0, 170, 170)`.

## Asset import flow

1. User opens **Import Assets** from main menu.
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
`src/js/UI/components/lib/cityYields.ts`) ask for `[people_<type>_f, people_<type>]` for a woman specialist (from
`specialistSprites` in `src/js/UI/lib/citizens.ts`), so they show the man until the player imports again.

## Asset persistence and loading

`AssetStore` extends generic `Store` wrapper and provides:

- Persistent storage (`idb`) keyed by asset `name`. A record holds the sprite's PNG as `blob`. Imports from before #730
  hold a data URI in `uri` instead; `load` turns each into a `blob` the first time it reads it, and writes it back.
- The required sprites (286 for Civ1) as the runtime readiness check, and the optional ones. Both lists come from the
  tileset descriptor's `assets` (`src/js/UI/tilesets/civ1.json`, through `currentTileset()` in
  `src/js/UI/lib/tilesets.ts`, #56); `new AssetStore(tileset)` reads another one's.
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
`src/js/UI/tilesets/TilesetDescriptor.ts`): `./assets/units/settlers.png` for Civ1, as the import has always stored
it. Another pack keeps its sprites under `./assets/<id>/`. `getPreloadedImage()` matches the whole key and nothing
else, so a second pack's sprite of the same name is never taken for Civ1's (#56).

It returns the decoded sprite itself, not a copy, and a blank canvas for a sprite that isn't loaded, with one console
error per missing sprite rather than one per draw. Caches built from the sprites, such as `replaceColours`,
`renderUnit` and the coast tiles, hand out shared entries that callers must treat as immutable, and are cleared
through `onPreloadedImagesChanged` on each load.

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
