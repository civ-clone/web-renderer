# Frontend UI

## Purpose

The frontend is responsible for rendering, input capture, and player interaction windows while backend remains authoritative for game logic.

Primary files:

- `src/js/frontend.ts`
- `src/js/UI/Renderer.ts`
- `src/js/UI/components/*`
- `src/js/UI/components/Map/*`
- `src/js/UI/lib/*` (helpers: viewport maths, dragging, saved games, citizens, unit actions, reconstitution)
- `src/css/*` (`app.scss`, with one partial per component under `src/css/components/`)

## UI composition model

- Mixed rendering approach:
  - Canvas for world/map layers and minimap.
  - HTML/dialog-based windows for reports, menus, prompts, and forms.
- `Renderer` acts as central coordinator for both modes.

## `Renderer` lifecycle (high level)

1. Read query parameters (`?debug=1` turns on local-player automation and the UI
   stress runner, see [`ui-stress-harness.md`](ui-stress-harness.md); `?cheat=1`
   shows the cheat menu items).
2. Verify assets via `assetStore.hasAllAssets()` and configure cursor.
3. Initialize i18n (`i18next` + browser language detector).
4. Bind global key handlers: Ctrl/Cmd+R asks before reloading, and so does F5
   until a game starts (in a game F5 is the Trade report).
5. Set the default client options (see below), take any save waiting to be
   loaded (`takePendingSave`), build `MainMenu`, and preload every stored asset
   into `#preload`.
6. Receive initial `gameData`: show the welcome window (new games only), turn on
   the leave guard, and build `World`, `GamePortal` with its layers, `Minimap`,
   the action panels, `GameMenu` and the details panels.
7. Handle the patch stream (`gameDataPatch`), turn hand-over (`turnEnded` shows
   a "waiting" banner until `turnStarted`), `chooseFromList`, notifications and
   `saveGame`.
8. Convert keyboard/mouse interactions into backend `action`/`cheat` messages.
   A unit's actions are only requested (`unitActions`) when it becomes active
   (#323).
9. Last, if a save was waiting, send it to the worker with `load`. Every
   handler has to be listening first, because `gameData` follows at once.

Patches are applied to the object map and rebuilt by `IncrementalReconstituter`,
which refills only the objects whose ids a patch changed rather than the whole
game (#322). Input-critical state is updated on every patch; rendering is
coalesced to one run per animation frame.

## Major UI modules

### Menu and setup

- `MainMenu`: entry to new game, Earth world, custom world, load game, asset
  import, and the release notes (`ReleaseWindow`, from the version link). The
  game options are hidden until assets are imported.
- `NewGameWindow`: world size, then `PlayerCountWindow` for the number of
  civilizations.
- `EarthWindow`: Earth is a fixed map, so it asks only for the player count.
- `CustomiseWorldWindow`: editable world generation options.
- `ImportAssetsWindow`: see [`asset-system.md`](asset-system.md).

### Saving and loading

`GameMenu` has Save Game and Load Game. A save is downloaded as a file, gzipped
where the browser has `CompressionStream`. Loading reloads the page: the save is
handed over in IndexedDB (`civ-clone-saved-game`) with a marker in
`sessionStorage`, so a fresh worker loads it with nothing else in it
(`src/js/UI/lib/savedGame.ts`). `leaveGuard` makes Back, and closing the tab,
ask before leaving a game in progress.

### Gameplay overlays/windows

- Action panels: `Actions` (buttons from `components/Actions/*`: `EndTurn`,
  `CityBuild`, `ChooseResearch`, `ChooseGovernment`, `Revolution`,
  `CivilDisorder`, `AdjustTradeRates`, `Spaceship`, and `Notice` for held
  notices), `ActionWindow`, `UnitActionMenu` (a long press on the map).
- `Notices`: `bubble` notifications (such as an obsolete Wonder) wait as buttons
  beside End Turn until opened or the turn ends.
- `GameMenu`: save, load, `GameOptions`, the reports, and the cheat items
  (shown with `?cheat=1`, or Shift+5 then Shift+6).
- City screen: `City`, with its own small `Portal` (`Landscape`, `Fog`,
  `Cities`, `Units`, `Yields`, `Unworkable`). Clicking a tile changes which
  tiles the city works; keys 1–8 change specialists, `c` changes production and
  `b` buys. `CityBuildSelectionWindow` chooses production.
- Reports, by key: `CityStatus` (F1), `IntelligenceReport` (F3),
  `HappinessReport` (F4), `TradeReport` (F5), `ScienceReport` (F6),
  `TopCitiesReport` (F8).
- Details: `UnitDetails`, `PlayerDetails`, `GameDetails`.
- Generic window primitives: `Window`, `SelectionWindow`, `MandatorySelection`,
  `ConfirmationWindow`, `NotificationWindow`, `PopupMenu`. A list with one
  option is chosen for the player rather than shown (`lib/singleChoice.ts`).

### Map rendering

`GamePortal` composes layer renderers from `src/js/UI/components/Map/*`, in
compositing order:

- Scenery: `Landscape` (land and coast, irrigation, terrain, improvements,
  terrain features and goody huts on one canvas), `Fog`
- Overlays: `Yields`
- Entities: `Units`, `Cities`, `CityNames`, `ActiveUnit`
- `Overview` rides in the same list but is never composited onto the map: it is
  the whole world at a few pixels a tile, one flat colour per terrain, for
  `Minimap`. It is the only layer that is the size of the world, and it draws
  the whole world as soon as it is built, so a loaded game's minimap is not
  blank (#270).

`Unworkable` is a further layer used only by the city screen.

Each layer's canvas is a window on the world the size of the portal, not the
whole world, and the layer knows which world pixel sits at its top left. So a
tile has no fixed place on a canvas, and because the world wraps it can have
several places or none. Layers therefore implement
`drawTile(tile, offsetX, offsetY)` and are handed the places to draw in;
`Map.renderTile()` works those out and calls it once per place.

Moving the view blits the overlap across and draws only the strips it uncovers.
Layers record which parts of themselves changed, and `Portal.render()`
composites those regions rather than the whole canvas, so a blinking unit or a
moved one costs a tile rather than a viewport. Past half the canvas, or more
than eight regions, it composites the lot. The wrapping and rectangle maths is in
`src/js/UI/lib/viewport.ts`.

Moving around the map:

- Dragging the map scrolls it (`GamePortal`), and a flick glides on with
  inertia. Only the primary pointer drives it, so a second finger does not
  interrupt a drag.
- A click on one of your cities opens it, on your units opens
  `UnitSelectionWindow`, and anywhere else centres the map there.
- Clicking the minimap centres the map on that tile. The minimap marks the
  active unit and its viewport box wraps.
- The view recentres on the active unit once it comes within `unitEdgeMargin`
  tiles of the edge.
- The map scale (1× to 4×) and whether the view stops at the poles
  (`lockVerticalEdges`) are set in `GameOptions` and take effect at once
  (`Portal.setScale`, `Portal.setLockVerticalEdges`). With the poles locked,
  nothing past them is drawn or clickable.

## Input model

- Keyboard shortcuts drive many actions (unit commands, map toggles, end turn, screens).
  Unit commands are `keyToActionsMap` in `Renderer.ts`: each key names the
  actions it tries in turn, and the first the active unit has is sent. `e` is
  Explore and `a` Automate (#198, #200): standing orders the engine carries on
  at the start of each turn until it hands the unit back.
- `mappedKeyFromEvent` normalizes key handling.
- Some UX paths depend on modal dialog focus forwarding.
- Pointer events drive the map, so mouse and touch share one path; a press held
  for 350ms opens `UnitActionMenu` for the active unit.

## Accessibility

- Citizens are drawn as faces with `alt=""`, and each group has a text summary
  for screen readers ("3 happy, 2 content, …"), on the city screen and in the
  reports (#272).
- Clickable specialists have an `aria-label`, and can be changed from the
  keyboard.
- The "waiting for other civilizations" banner is a `role="status"` live
  region, so a screen reader announces why the controls stopped responding.

## Local client state helpers

- `GameOptionsRegistry`: in-memory options, set to defaults in `Renderer.init()`
  and not persisted: `autoEndOfTurn`, `autoEndOfTurnExceptions`,
  `unitEdgeMargin`, `mapScale`, `lockVerticalEdges`.
- `DataObserver`: event-based subscription by object IDs.
- `Store` wrapper around IndexedDB via `idb` (used by `AssetStore` and the
  pending-save hand-over).

## Known frontend pain points

- `Renderer.ts` has explicit TODO to break down and likely adopt framework-style architecture.
  `Renderer.init()` is still one long function holding most of the client's
  state in closures.
- Late-game slowdown documented around reconstitution and cleanup logic.
  Largely addressed: incremental reconstitution (#322), unit actions on demand
  (#323) and the viewport-sized layers.
- Tile size (16, with a TODO to take it from the theme) and terrain colours on
  the minimap are hardcoded. Map scale is now an option.

## Rewrite opportunities (reactive store direction)

- Separate orchestration from rendering via feature modules.
- Move from mutable object map + custom events to a reactive store and selectors.
- Keep map canvas layers, but feed them from derived state snapshots.
- Convert keyboard bindings into a command map with explicit action resolution rules.
