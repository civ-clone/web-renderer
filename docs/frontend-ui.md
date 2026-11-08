# Frontend UI

## Purpose

The frontend is responsible for rendering, input capture, and player interaction windows while backend remains authoritative for game logic.

Primary files:

- `src/js/frontend.ts`
- `src/js/interfaces.ts` (the interfaces civ.one offers)
- `packages/*`, one workspace package per part of the frontend (see Packages below)
- `packages/game/bootstrap.ts` (page start-up), and the rest of `packages/game/` (one game)
- `packages/windows/components/*` (the windows) and `packages/map/components/Map/*` (the map's layers)
- `src/css/app.scss`, civ.one's stylesheet: the themes, and each package's own partials (`packages/<name>/styles/`)
  in cascade order

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
   loaded (`takePendingSave`), and build `TitleMenu`, or `MainMenu` under the
   classic interface (#749).
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

## Interfaces and themes

Each interface is a package of its own (#825): `packages/interface-modern/` and `packages/interface-classic/`. Each holds its
manifest (#824) and an `index.ts` that provides the pieces it uses to the slots and registers the manifest. A theme
(#167) carries no layout. An interface carries the layout and names the theme it comes with, which the player's own
choice of theme outranks.

- **Slots** are parts of the interface with more than one implementation. Shared code calls `defineSlot` where the part
  is put together, such as `reports.ts`, and uses whatever the interface in use provided. A manifest's `slots` says
  which implementation to use.
- **Features** are behaviours inside a shared component that an interface has or doesn't, read with `hasFeature`.
- **What's its own:** a window or map piece that only one interface uses lives in that interface's package
  (`components/`): the modern report tables, title menu, setup form, city layout and choice windows, and the classic
  reports, main menu, setup window and build list. The `packages` test holds it. The building blocks (`client`,
  `assets`, `widgets`) stay shared, as any interface can build on them, and a piece a second interface wants moves to
  a shared package. Each slot is typed by what its callers need (`Window`, `CityLayout`, `TitleScreen`), so shared
  code names no interface's pieces.
- **Boundaries:** nothing depends on an interface, an interface doesn't depend on `game`, and only
  `src/js/interfaces.ts`, which `frontend.ts` loads and which lists what civ.one offers, imports one.
  `DEFAULT_INTERFACE` must be one of them.
- Only Options asks which interface is in use. `interfaceManifests` holds that, and `packages` the boundaries.
- An interface that's renamed keeps its old id in `RENAMED` (`lib/interfaceMode.ts`), so stored choices and old links
  still find it: `new` is now `modern`.

A new interface is a package beside these two, with its manifest and an `index.ts` providing what it fills its slots
with, a line in `src/js/interfaces.ts` and one in the root `package.json`. Test suites import `tests/ui/lib/interfaces.ts` straight after `./lib/dom`
to register them as the page does.

## Packages

The frontend is a set of pnpm workspace packages (#825), each in `packages/<name>/` and named `@civ-clone/ui-<name>`.
They are built and released together with civ.one, and none is published on its own yet. Inside a package, files use
relative paths. A file reaches another package only by its name (`@civ-clone/ui-client/lib/UnitQueue`), and only one
its own `package.json` depends on (`"workspace:*"`). The `packages` test holds all of this: every dependency a package
declares is one it uses, no two depend on each other however far round, and nothing depends on an interface.

They share the engine's `@civ-clone` scope, and the `ui-` prefix keeps them apart: the plugin list and the `civ` tools
that list what is installed in the scope (`scan`, `collisions`, `duplicates`) skip every `@civ-clone/ui-*`
(`isUiPackage` in `tools/lib/paths.js`). An engine package must never be named `ui-…`.

A package's npm dependencies (i18next, the engine's `@civ-clone/*` packages) stay in the root `package.json` for now,
so they resolve from the root, where `civ sync` links engine checkouts. A few things the packages still reach for by
path aren't packages yet: `src/js/Audio`, the generated `src/js/translations.ts` and `build.json`. The generated
`src/js/plugins.ts` is civ.one's choice of rules, which `backend.ts` hands the worker client. The test lists them, and the list only shrinks.

The worker (`worker-client`, which `backend.ts` starts) shares only `protocol` with the page: it imports no other
package, and no package imports from it. Under them are two packages in repositories of their own, with nothing of
civ.one's in them: `@civ-clone/core-data-client` (the transport contract, requests and their replies, and data
patches and rebuilding them) and `@civ-clone/worker-transport` (both ends of a transport over a web worker's
messages, which `frontend.ts` and `backend.ts` start, telling the page's end that `gameData` arrives raw).

| Package             | Holds                                                                                                                                                                                       | Depends on                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `protocol`          | What the page and the worker say to each other: requests, messages, the game's data                                                                                                         | nothing else                                    |
| `worker-client`     | The game as the worker runs it for the page, which `backend.ts` starts                                                                                                                      | protocol                                        |
| `client`            | The game as the page holds it, drawing nothing: transport, state, options, saves                                                                                                            | protocol                                        |
| `assets`            | Sprites, tilesets and sounds, and drawing a sprite                                                                                                                                          | protocol, client                                |
| `component-*`       | One token-driven component each, with its styles: `button`, `controls`, `window`, `choice-window`, `selection-window`, `report-table`, `tooltip`, `popup-menu`, `progress-bar`, `stat-pill` | each other, `widgets`, client, assets, protocol |
| `widgets`           | The small helpers the components share (markup, filtering, contrast, dragging), the sliders and the sidebar section                                                                         | client, assets                                  |
| `map`               | Drawing the world on any grid, through a `Projection`                                                                                                                                       | protocol, client, assets, widgets               |
| `map-square`        | The square grid: its projection and minimap                                                                                                                                                 | protocol, assets, map                           |
| `windows`           | The game's windows, shared by every interface that wants them                                                                                                                               | protocol, client, assets, widgets, map          |
| `game`              | The page itself: starting up, a game in play, the keys, the debug tools                                                                                                                     | everything above it but the worker's            |
| `interface-modern`  | The modern interface, with Slate and brass, see above                                                                                                                                       | the page's packages but `game`                  |
| `interface-classic` | The classic interface, with Civ1 classic, see above                                                                                                                                         | the page's packages but `game`                  |

The components (#825) are packages of their own so any interface can build on any of them, each bringing its styles:
`@civ-clone/ui-component-window` is the window every interface builds on, `ui-component-button` the button system, and
so on. `src/css/app.scss` still imports their partials in the order the cascade has always had. Ordering them by
dependency instead, so the list could be generated, would change which of two equally specific rules wins in a few
places (a base `.window .body` and a window's own `.city .body`, say), so each of those has to be settled first.

Inside each package the folders are as they were under `src/js/UI/` (`components/`, `lib/`), but for the folder a
package is named after (`game/`, `map-square/`), whose files are at the package's root. So `client` still has a
`game/GameState.ts` and `windows` a `components/` folder. Tidying those is for later.

**The map and its grids.** In the code and the game's own text, a _square_ on its own is a map square, Civ1's word
for a tile, on whatever grid. The grid is always named in full: the square grid. `map` draws every grid through a
`Projection`, and anything true of the square grid alone lives in `map-square`. Hexagonal and isometric grids get
packages of their own beside it (`map-hex`, `map-isometric`, #94, #97). `map` names no grid: each grid registers its
projection with `registerGrid` (`@civ-clone/ui-map/lib/projectionFor`), and the page loads the grids it draws, as `frontend.ts` loads
`map-square`. The minimap, which draws every world as squares in storage order, is the square grid's too. Suites that
draw the map, or ask which grids it can, import `tests/ui/lib/grids.ts`.

## Major UI modules

### Menu and setup

- `MainMenu`: entry to new game, Earth world, custom world, load game, asset
  import, and the release notes (`ReleaseWindow`, from the version link). The
  game options are hidden until assets are imported.
- `TitleMenu` (#749), the modern interface's main menu: a list with each item's
  key (C, N, E, L, H, O, I). Continue loads the newest save in the browser,
  named from the `details` a save has kept since (`SaveDetails`: civilization,
  turn, year), or its name for an older one. New Game passes `askNewGame` a
  `customise` callback, which puts Customize… (the game setup) first among the
  sizes; Options opens with no portal and shows the Assets row; Import assets is
  listed only while the required sprites are missing.
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
(`packages/windows/lib/savedGame.ts`). `leaveGuard` makes Back, and closing the tab,
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
  `b` buys. `CityBuildSelectionWindow` chooses production. Every way in goes
  through `openCity` (`components/openCity.ts`), which gives `City` its layout:
  the window of `CityLayout.ts` (#746), or under `?interface=classic` the
  classic page (`classicCityLayout`). The behaviour is `City`'s whichever layout draws
  it; the parts both draw, the yield bars and the map, are in
  `components/lib/cityParts.ts`. The new layout's production card lists the
  city's build queue (core-city-build's `CityBuild#queue`, #774), each with
  Up, Down and Remove; the build list's Add to queue lines up the chosen item.
  Both send a `queue` edit on the city's `CityBuild`/`ChangeProduction` action
  (`editQueue` in `components/lib/cityBuild.ts`, handled by `editQueue` in
  `packages/worker-client/Client/actions/city.ts`).
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

`GamePortal` composes layer renderers from `packages/map/components/Map/*`, in
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

Under the modern interface, `MapView` mounts `CityBanners` in
place of `CityNames` (#747). It extends `CityNames`, and the theme's
`--ui-city-banner` token picks what it draws: `label` gives the classic size
and name, and `full` gives a banner below the city's square (size badge, name,
production turns, food bar, disorder and celebration flags). The banner's
colours and font come from tokens read off the page's root, and `MapView`
redraws the layer when the theme or light/dark changes. A layer can claim a
click past a city's square through `Map.cityAt()`, which `GamePortal` asks
through `Portal.cityAt()` before it looks up the tile under the pointer.
`Map.bannerAt()` gives the banner's box as well: a mouse resting on one of
your cities' banners opens the shared tooltip over that box
(`showTooltipOver`), with what the city is building and how it grows
(`Map/cityBannerTooltip`). Elsewhere under the modern interface, a mouse resting
on a square opens it over the square's box (`Portal.squareAt()`), with what the
square is, yields and has on it (`Map/squareTooltip`, #748), unless the
`squareTooltips` option is off. A rival's banner is about its city's square.
The terrain's defence multiplier and move cost come with it from the engine
(`AdditionalData/terrainRules`). Leaving the banner or square, a press, a key,
the map moving or the other players' turn starting (`GamePortal.setWaiting()`)
closes it.

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
`packages/map/lib/viewport.ts`.

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
  the tile size comes from the tileset descriptor (`packages/assets/tilesets/`, #56).

## Rewrite opportunities (reactive store direction)

- Separate orchestration from rendering via feature modules.
- Move from mutable object map + custom events to a reactive store and selectors.
- Keep map canvas layers, but feed them from derived state snapshots.
- Convert keyboard bindings into a command map with explicit action resolution rules.
