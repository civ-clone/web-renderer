# Architecture Overview

## Runtime topology

The application is split into two JavaScript runtimes:

- **Main thread (frontend)**
  - Runs `dist/frontend.js`.
  - Creates the Worker (`dist/backend.js`).
  - Owns DOM and canvas rendering.
  - Handles user input and turns it into transport messages.
- **Worker thread (backend)**
  - Runs the game engine and clients.
  - Instantiates players (1 human + AI opponents), or restores them from a save.
  - Produces the initial game state, incremental patches, and standalone answers to UI requests.

## Entry points and boot sequence

1. Browser loads `index.html` and starts `dist/frontend.js`.
2. `src/js/frontend.ts` loads the art packs, Civ1's first (`packages/tileset-civ1`, which registers its tileset and its import, #97), then Civ2's (`packages/tileset-civ2`), then the interfaces and the grids, creates `Renderer(new WorkerTransport(new Worker('dist/backend.js')))` (from `packages/game/bootstrap.ts`) and calls `init()`.
3. Worker starts from `src/js/backend.ts` and creates `Game(new ParentTransport())`.
4. For a new game, the setup windows (`askPlayerCount` in `components/newGame.ts`, or `GameSetupWindow`) send `setOptions` as a request, wait for its acknowledgement, then send `start`.
5. Backend binds engine events, starts the engine, and loads the plugin set the game is played with, of those `backend.ts` handed it (civ.one's: the generated `src/js/pluginSets.ts`, #668).

Loading a saved game takes a different path. The player picks a file, `packages/menus/lib/savedGame.ts` hands it over in IndexedDB (with a `sessionStorage` marker) and the page reloads, so the save always goes to a fresh worker. On the next `init()`, `Renderer` takes the pending save, sets up its listeners, and sends `load` instead of `start`. The worker imports the plugins, restores the game into `defaultGame` (`packages/worker-client/loadGame.ts`) and resumes the turn that was in progress. No world is generated.

## Main subsystem responsibilities

- `packages/worker-client/Game.ts`
  - Worker-side bootstrap and option handling (`setOption`, `getOptions`, `setOptions`).
  - Save (`save` → `saveGame`) and load (`load`) via `@civ-clone/core-save-game`.
  - Creates players and chooses the client implementation (`DataTransferClient` for player 0 in a new game, `SimpleAIClient` for others). A loaded game makes a `DataTransferClient` for whichever player the save records as human.
- `packages/worker-client/DataTransferClient.ts`, over `packages/worker-client/Client/*`
  - The composition root of the human player's client (#449): it builds one shared context and registers the modules in `packages/worker-client/Client/` (visibility filter and serialisers, patches and flushes, notifications, patch-producing engine listeners, talks, actions, the turn hand-over, cheats, requests, the game's end, automation), and can `dispose()` them. `docs/backend-worker.md` lists each module.
  - Adapts the core game model into UI-transferable objects, through a visibility filter.
  - Handles player actions, cheats and UI requests from the frontend.
  - Emits `gameData` (initial snapshot) and `gameDataPatch` (incremental updates), and `turnStarted`/`turnEnded` around the player's turn.
  - Can hand the local player's turn to a `SimpleAIClient` when the `automateLocalPlayer` option is set.
- `packages/game/bootstrap.ts` (the `Renderer` class)
  - Page start-up: cursor, i18n, the reload guard, option defaults, the pending save, and the receivers that outlive a game (`saveGame`, `gameOver`, notifications, choice lists). The first `gameData` starts a `GameSession`; a pending save is sent with `load` last.
- `packages/game/*`
  - One game, split out of the old `Renderer.ts` (#344). `GameSession` composes the rest: `GameState` applies patches to the raw object map and rebuilds the rich UI state from it with `IncrementalReconstituter`; `ActiveUnitController` holds the active unit and its keys; `MapView` the map layers and minimap; `Hud` the action panels and details; `InputController` the hotkeys and leader screens.
- `packages/game/app/*`, `packages/game/debug/*`
  - The page's elements, i18n, assets, options, reload guard, notification bar, choice windows and the windows that say what went wrong in the worker (#470); the `?debug=1` flags and panel.
- `packages/menus/components/*`, `packages/hud/components/*`, and the components every window is built from, `packages/component-*/` (`Window`, the
  button, the choice and selection windows, the report table, …)
  - Window and UI primitives for reports, city/unit views, menu flows, and overlays.
- `packages/map/components/Map/*`, `Portal.ts`, `packages/game/GamePortal.ts`, and each grid's `Minimap.ts` (`packages/map-square/`, `packages/map-isometric/`)
  - Canvas layer renderers (terrain, units, cities, fog, improvements, etc.). Each layer's canvas is the size of the portal, not the world, and the portal composites only the regions the layers changed. The minimap draws from a layer of its own, its grid's `Overview.ts`.

## State and rendering model

- Backend is the source of truth for game state.
- Frontend holds a large mutable object map (`objectMap`) and applies patches to it in place.
- `IncrementalReconstituter` rebuilds only the ids the patches since the last update touched, refilling each id's object in place. `reconstituteData` still rebuilds one-off payloads (notifications, choices, request answers) in `WorkerTransport`.
- Open windows watch the ids they show through `lib/DataChanges.ts`, which runs each one, once per render, when any of those ids changed since the last (#344).
- Display work (panels, the windows' watchers, the portal composite) runs at most once per animation frame. State updates stay synchronous during the player's turn, and are coalesced to once a frame while waiting for the other civilizations.

## Transport contract (high level)

Core channels are defined in `packages/protocol/Transport.ts` (`@civ-clone/ui-protocol`):

- Control/config: `start`, `setOption`, `setOptions`, `getOptions`, `notification`
- Save/load: `save`, `saveGame`, `load`
- Gameplay: `action`, `chooseFromList`, `gameNotification`, `turnStarted`, `turnEnded`
- State sync: `gameData`, `gameDataPatch`, `unitActions`
- Requests answered with standalone data: `cityBuildAvailable`, `topCities`, `intelligence`
- Diplomat results: `embassyEstablished`, `investigateCity`
- Debug/cheat: `cheat`, `cheatAdvances`, `cheatPlayers`

Requests go through `Transport.request()` (`AbstractTransport`, from `@civ-clone/core-data-client`), which gives each request an id of its own that its reply echoes, so any number can wait on one channel at once and each gets its own reply, in whatever order they come (#324, #470).

The game's end uses `gameOver`, `retire` and `gameContinue` (#176); there is no `restart` or `quit` channel any more (#340).

## Rewrite implications

- Current architecture already isolates engine logic from UI logic via worker transport.
- The frontend orchestration, once one `Renderer` closure, is split into the `packages/game/` modules (#344).
- A reactive store-based rewrite can preserve worker boundary while replacing in-place patch application + custom event plumbing with derived state/selectors.
