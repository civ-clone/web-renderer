# Asset System

## Why this matters

Game rendering depends on an imported asset set derived from original Civilization files (`TER257.PIC`, `SP257.PIC`).
Without imported assets, gameplay options are hidden and import is the primary onboarding flow.

## Main components

- `src/js/UI/components/ImportAssetsWindow.ts`
  - UI flow for selecting source files and triggering extraction.
- `src/js/UI/AssetStore.ts`
  - IndexedDB-backed storage and in-memory cache of extracted assets.
- `@civ-clone/civ1-asset-extractor`
  - External package that performs sprite extraction from source files.

## Asset import flow

1. User opens **Import Assets** from main menu.
2. UI validates selected filenames against extractor definitions (`extract-data.json`).
3. For each file:
   - Reads binary string via `FileReader`.
   - Runs `extractSprites(...)` with matching definitions.
   - Receives records `{ name, uri }`.
4. Records are persisted via `assetStore.set(record)` into IndexedDB store `civ-clone-assets`.
5. `assetStore.hasAllAssets()` validates required set.
6. On success, page reloads to reinitialize UI with assets present.

## Asset persistence and caching

`AssetStore` extends generic `Store` wrapper and provides:

- Persistent storage (`idb`) keyed by asset `name`.
- In-memory caches:
  - raw asset records
  - `HTMLImageElement` instances
  - scaled canvas results (`getScaled`)
- Required-asset list (`#requiredAssets`) used as runtime readiness check.

## Runtime usage patterns

- Main menu checks `assetStore.hasAllAssets()` to gate gameplay options.
- Renderer sets custom cursor using scaled imported asset.
- Map and window components resolve image assets from `AssetStore` by canonical path.

## Edge cases and current behavior

- Missing required files produces explicit translated error in import window.
- Optional "replace existing" allows re-extracting even if assets exist.
- Browser-specific caveat: Brave fingerprinting can distort imported visuals (noted in README).
- Required asset list is static and large, so any mismatch in naming/path conventions fails readiness.

## Rewrite recommendations

- Isolate extraction, validation, and persistence into a dedicated asset service module.
- Version the asset schema (to support future tilesets/asset packs).
- Move required-asset manifest to declarative data file instead of hardcoded class field.
- Preserve IndexedDB caching, but add migration strategy for asset format changes.
