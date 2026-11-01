# Frontend UI

## Purpose

The frontend is responsible for rendering, input capture, and player interaction windows while backend remains authoritative for game logic.

Primary files:

- `src/js/frontend.ts`
- `src/js/UI/bootstrap.ts` (page start-up) and `src/js/UI/game/*` (one game)
- `src/js/UI/app/*`, `src/js/UI/debug/*`
- `src/js/UI/components/*`
- `src/js/UI/components/Map/*`
- `src/js/UI/lib/*` (helpers: viewport maths, dragging, saved games, citizens, unit actions, reconstitution)
- `src/css/*` (`app.scss`, with one partial per component under `src/css/components/`)

## UI composition model

- Mixed rendering approach:
  - Canvas for world/map layers and minimap.
  - HTML/dialog-based windows for reports, menus, prompts, and forms.
- `GameSession` (`game/GameSession.ts`) coordinates both modes for a game.

## Lifecycle (high level)

`bootstrap.ts` runs the page-scope steps (1–5, the `chooseFromList`,
notification and `saveGame` receivers, and 9); `game/GameSession.ts` runs the
rest for each game.

1. Read query parameters (`?debug=1` turns on local-player automation and the UI
   stress runner, see [`ui-stress-harness.md`](ui-stress-harness.md); `?cheat=1`
   shows the cheat menu items).
2. Decode the tileset's sprites (`assetStore.load()`, #730), so nothing is drawn
   before they are there, then verify assets via `assetStore.hasAllAssets()` and
   configure cursor.
3. Initialize i18n (`i18next` + browser language detector).
4. Bind global key handlers: Ctrl/Cmd+R asks before reloading, and so does F5
   until a game starts (in a game F5 is the Trade report).
5. Set the default client options (see below), take any save waiting to be
   loaded (`takePendingSave`), and build `MainMenu`.
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
- `newGame.ts`: New Game's questions, each through `openChoice`: the map grid
  (`askMapGrid`), world size (`askWorldSize`), difficulty (`askDifficulty`),
  then the number of civilizations (`askPlayerCount`). `askEarth` asks the same
  of the sizes there is an Earth map for, and never the grid.
- `GameSetupWindow`: the game setup, opened by Customise world. It asks for the
  map, the difficulty, the Advanced world options (exact size and land) and the
  seat table.
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
- Details: `UnitDetails`, `PlayerDetails`, `GameDetails`. `UnitDetails` is the
  active unit's card (#699): its icon, name and state (`lib/unitLabel.ts`, as
  the stack window's rows say it, #694), its moves as pips, attack, defence and
  visibility, its home city (a button that opens it), the square, and the other
  units there as a strip that opens `UnitSelectionWindow`. It is kept for the
  game and redraws only when something it shows changes.
- Sidebar lists: `CitiesList` (#700), the player's cities by build and turns
  left, soonest first, with nothing to build first and disorder (the player's
  `CivilDisorder` actions) and starving flagged, following them through
  `DataChanges`; `PowerList` (#701, #708), every civilization's ranking score
  (gold, citizens, advances and units, not the Civilization Score, whose
  pollution term leaves most rivals at 0) from the worker's
  `civilizationPower` rows, asked for once a turn while its section is open,
  five around your own in a game of more than six.
- Layout (#697): `#game` is a grid. `#top-bar` runs across the full width
  and holds `GameDetails`, `PlayerDetails` (the empire block, #698), the
  secondary actions and the game menu, in its flow. The map fills the rest,
  and the sidebar's `SidebarSection`s (the minimap, the active unit, the
  cities and the power list) float over its top left; the sidebar itself has
  no panel, and is only as tall as its sections so it can take the pointer
  for its scrollbar. `MapView` measures the sections and tells the portal
  (`Portal.setCovered`), so `isVisible` counts a tile under one (or within
  the edge margin of one) as out of view and the active unit is recentred out
  from under them, as from an edge. `#actions` fills the map's height at its
  right and `#unit-actions` sits at its bottom left; like the sidebar they are
  positioned and after the map in the document, so they paint over it without
  a `z-index`. Each section collapses from its heading button, with the
  collapsed keys kept in the `sidebarCollapsed` client option. The cities and
  power start collapsed (`collapsedByDefault`), and the keys of those opened
  are kept in `sidebarExpanded` instead. Below 48em wide,
  the bar, the sections and the map stack instead, and the map keeps the whole
  width. Their colours are the `--panel-*` tokens on `:root`, with a dark set
  under `prefers-color-scheme: dark` (#706 adds a choice in the options).
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
`Map.renderTile()` works those out and calls it once per place. A layer that
draws past a tile's box (the copy behind a stack of units, the city glyph,
yield icons, city names) says how far in `reach()` and is redrawn by region
instead: the changed tile's box and reach are cleared once and every tile that
reaches them is drawn again, back to front (#486), as on a projection whose
tiles overlap (#91).

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
  Unit commands are `keyToActionsMap` in `lib/unitActionKeys.ts`: each key names the
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

- `GameOptionsRegistry`: the client options, with their defaults in `app/options.ts`; the
  values a player changes are kept in `localStorage` (#343): `autoEndOfTurn`, `autoEndOfTurnExceptions`,
  `unitEdgeMargin`, `mapScale`, `lockVerticalEdges`, `autosave`,
  `sidebarCollapsed`, `sidebarExpanded`.
- `lib/DataChanges.ts`: watchers by object id, run once per render when an id
  they watch changed (#344).
- `Store` wrapper around IndexedDB via `idb` (used by `AssetStore` and the
  pending-save hand-over).

## Known frontend pain points

- `Renderer.ts` was one long `init()` closure holding most of the client's
  state. It is split into `bootstrap.ts` and the `game/`, `app/`, `debug/` and
  `lib/` modules (#344); `bootstrap.ts` keeps the TODO asking whether to adopt
  a framework.
- Late-game slowdown documented around reconstitution and cleanup logic.
  Largely addressed: incremental reconstitution (#322), unit actions on demand
  (#323) and the viewport-sized layers.
- Terrain colours on the minimap are hardcoded. Map scale is now an option, and
  the tile size comes from the tileset descriptor (`src/js/UI/tilesets/`, #56).

## Rewrite opportunities (reactive store direction)

- Separate orchestration from rendering via feature modules.
- Move from mutable object map + custom events to a reactive store and selectors.
- Keep map canvas layers, but feed them from derived state snapshots.
- Convert keyboard bindings into a command map with explicit action resolution rules.
