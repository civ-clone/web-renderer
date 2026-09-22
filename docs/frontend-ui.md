# Frontend UI

## Purpose

The frontend is responsible for rendering, input capture, and player interaction windows while backend remains authoritative for game logic.

Primary files:

- `src/js/frontend.ts`
- `src/js/UI/Renderer.ts`
- `src/js/UI/components/*`
- `src/js/UI/components/Map/*`
- `src/css/*`

## UI composition model

- Mixed rendering approach:
  - Canvas for world/map layers and minimap.
  - HTML/dialog-based windows for reports, menus, prompts, and forms.
- `Renderer` acts as central coordinator for both modes.

## `Renderer` lifecycle (high level)

1. Verify assets via `assetStore.hasAllAssets()` and configure cursor.
2. Initialize i18n (`i18next` + browser language detector).
3. Bind global key handlers (including reload confirmation).
4. Build key UI modules:
   - `MainMenu`, `GamePortal`, map layers, minimap, action panels, details panels.
5. Receive initial `gameData`, build state, and render initial map/UI.
6. Handle patch stream (`gameDataPatch`) and notifications.
7. Convert keyboard/mouse interactions into backend `action`/`cheat` messages.

## Major UI modules

### Menu and setup

- `MainMenu`: entry to new game, Earth world, custom world, asset import, releases.
- `NewGameWindow`: player count flow.
- `EarthWindow`: presets Earth-specific options.
- `CustomiseWorldWindow`: editable world generation options.

### Gameplay overlays/windows

- Action panels: `Actions`, `ActionWindow`, `UnitActionMenu`.
- Reports: `CityStatus`, `HappinessReport`, `TradeReport`, `ScienceReport`.
- Details: `UnitDetails`, `PlayerDetails`, `GameDetails`.
- Generic window primitives: `Window`, `SelectionWindow`, `ConfirmationWindow`, `NotificationWindow`.

### Map rendering

`GamePortal` composes layer renderers from `src/js/UI/components/Map/*`, in
compositing order:

- Scenery: `Landscape` (land and coast, irrigation, terrain, improvements,
  terrain features and goody huts on one canvas), `Fog`
- Overlays: `Yields`
- Entities: `Units`, `Cities`, `CityNames`, `ActiveUnit`
- `Overview` rides in the same list but is never composited onto the map: it is
  the whole world at a few pixels a tile, for `Minimap`.

Each layer's canvas is a window on the world the size of the portal, not the
whole world, and the layer knows which world pixel sits at its top left. So a
tile has no fixed place on a canvas, and because the world wraps it can have
several places or none. Layers therefore implement
`drawTile(tile, offsetX, offsetY)` and are handed the places to draw in;
`Map.renderTile()` works those out and calls it once per place.

Moving the view blits the overlap across and draws only the strips it uncovers.
Layers record which parts of themselves changed, and `Portal.render()`
composites those regions rather than the whole canvas, so a blinking unit or a
moved one costs a tile rather than a viewport.

## Input model

- Keyboard shortcuts drive many actions (unit commands, map toggles, end turn, screens).
- `mappedKeyFromEvent` normalizes key handling.
- Some UX paths depend on modal dialog focus forwarding.

## Local client state helpers

- `GameOptionsRegistry`: in-memory options (for example auto-end-turn behavior).
- `DataObserver`: event-based subscription by object IDs.
- `Store` wrapper around IndexedDB via `idb`.

## Known frontend pain points

- `Renderer.ts` has explicit TODO to break down and likely adopt framework-style architecture.
- Late-game slowdown documented around reconstitution and cleanup logic.
- Scale/tile-size and some theme behavior are hardcoded.
- Minimap wrapping/highlight behavior called out in TODO/README notes.

## Rewrite opportunities (reactive store direction)

- Separate orchestration from rendering via feature modules.
- Move from mutable object map + custom events to a reactive store and selectors.
- Keep map canvas layers, but feed them from derived state snapshots.
- Convert keyboard bindings into a command map with explicit action resolution rules.
