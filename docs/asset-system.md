# Asset System

## Why this matters

Game rendering depends on an imported asset set derived from original Civilization files (`TER257.PIC`, `SP257.PIC`).
Without imported assets, gameplay options are hidden and import is the primary onboarding flow.

## Main components

- `src/js/UI/components/ImportAssetsWindow.ts`
  - UI flow for selecting source files and triggering extraction.
- `src/js/UI/AssetStore.ts`
  - IndexedDB-backed storage and in-memory cache of extracted assets.
- `src/js/UI/lib/getPreloadedImage.ts`
  - The map layers' view of the same assets, as `<img>` elements preloaded into `#preload`.
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
4. Records are persisted via `assetStore.setAll(records)`, in a single transaction, into IndexedDB database
   `civ-clone-assets` (object store `assets`).
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

Not every extracted sprite is required. The women specialists are deliberately left out of `#requiredAssets`, so
assets imported before they existed still pass the readiness check.

Code that draws an optional sprite falls back to an older one. `assetStore.firstImported(paths)` returns the first of
`paths` that has been imported, or the last of them if none has. The city screen's citizens (`renderCitizen` in
`src/js/UI/components/lib/cityYields.ts`) ask for `[people_<type>_f, people_<type>]` for a woman specialist (from
`specialistSprites` in `src/js/UI/lib/citizens.ts`), so they show the man until the player imports again.

## Asset persistence and caching

`AssetStore` extends generic `Store` wrapper and provides:

- Persistent storage (`idb`) keyed by asset `name`.
- In-memory caches:
  - raw asset records
  - `HTMLImageElement` instances (`getImage`), cached only once the image has loaded
  - scaled canvas results (`getScaled`), keyed by path and scale, cached only once the image is drawable
- Required-asset list (`#requiredAssets`, 286 paths) used as runtime readiness check.
- `firstImported(paths)` for optional assets (see above).

The map layers do not read `AssetStore` directly. At startup `Renderer` appends every stored record to `#preload` as
an `<img data-path="...">`, and the layers look sprites up by path with `getPreloadedImage()` (for example
`units/settlers` or `city/food`). It returns the preloaded element itself, not a clone, and a blank canvas (with a
console error) for a path it cannot find. Caches built from those images, such as `replaceColours` and `renderUnit`,
hand out shared entries that callers must treat as immutable, and are cleared through `onPreloadedImagesChanged`
when the preload container changes.

## Runtime usage patterns

- Main menu checks `assetStore.hasAllAssets()` to gate gameplay options (new game, Earth, customise world, load game).
- Renderer sets custom cursor using scaled imported asset (`cursor/torch` at scale 2).
- Windows and reports (city screen, City Status, Happiness, Trade and Science reports, the action buttons) resolve
  images from `AssetStore` by canonical path, mostly through `getScaled(path, 2)`.
- Map layers resolve images from the preload container (see above).

## Edge cases and current behavior

- Missing required files produces explicit translated error in import window.
- Optional "replace existing" allows re-extracting even if assets exist. The checkbox is drawn ticked, but the option
  starts off and only follows the checkbox once it is changed.
- Browser-specific caveat: Brave fingerprinting can distort imported visuals (noted in README, and shown in the import
  window when `navigator.brave` is present).
- Required asset list is static and large, so any mismatch in naming/path conventions fails readiness.
- An image that fails to load is not cached, so a later import can replace it.
- `npm run test:asset-slices` checks that every unit sprite in `extract-data.json` is cut out at 15×15 (#12).

## Rewrite recommendations

- Isolate extraction, validation, and persistence into a dedicated asset service module.
- Version the asset schema (to support future tilesets/asset packs).
- Move required-asset manifest to declarative data file instead of hardcoded class field.
- Preserve IndexedDB caching, but add migration strategy for asset format changes. Partly addressed: optional assets
  with a fallback (`firstImported`) let new sprites arrive without invalidating an existing import, and a re-import
  extracts only the groups with something missing.
