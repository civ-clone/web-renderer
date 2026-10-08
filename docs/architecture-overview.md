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
2. `src/js/frontend.ts` creates `Renderer(new WorkerTransport(new Worker('dist/backend.js')))` and calls `init()`.
3. Worker starts from `src/js/backend.ts` and creates `Game(new ParentTransport())`.
4. For a new game, the setup windows (`PlayerCountWindow` or `CustomiseWorldWindow`) send `setOptions` as a request, wait for its acknowledgement, then send `start`.
5. Backend binds engine events, starts the engine, and dynamically imports the generated plugin imports (`src/js/plugins.ts`).

Loading a saved game takes a different path. The player picks a file, `src/js/UI/lib/savedGame.ts` hands it over in IndexedDB (with a `sessionStorage` marker) and the page reloads, so the save always goes to a fresh worker. On the next `init()`, `Renderer` takes the pending save, sets up its listeners, and sends `load` instead of `start`. The worker imports the plugins, restores the game into `defaultGame` (`src/js/Engine/loadGame.ts`) and resumes the turn that was in progress. No world is generated.

## Main subsystem responsibilities

- `src/js/Engine/Game.ts`
  - Worker-side bootstrap and option handling (`setOption`, `getOptions`, `setOptions`).
  - Save (`save` → `saveGame`) and load (`load`) via `@civ-clone/core-save-game`.
  - Creates players and chooses the client implementation (`DataTransferClient` for player 0 in a new game, `SimpleAIClient` for others). A loaded game makes a `DataTransferClient` for whichever player the save records as human.
- `src/js/Engine/DataTransferClient.ts`
  - Adapts the core game model into UI-transferable objects, through a visibility filter.
  - Handles player actions, cheats and UI requests from the frontend.
  - Emits `gameData` (initial snapshot) and `gameDataPatch` (incremental updates), and `turnStarted`/`turnEnded` around the player's turn.
  - Can hand the local player's turn to a `SimpleAIClient` when the `automateLocalPlayer` option is set.
- `src/js/UI/Renderer.ts`
  - Frontend orchestrator; still monolithic (~1,900 LOC).
  - Applies patches to the raw object map and rebuilds the rich UI state from it with `IncrementalReconstituter`.
  - Coordinates map layers, action panels, menu windows, notifications, hotkeys.
- `src/js/UI/components/*`
  - Window and UI primitives for reports, city/unit views, menu flows, and overlays.
- `src/js/UI/components/Map/*`, `Portal.ts`, `GamePortal.ts`, `Minimap.ts`
  - Canvas layer renderers (terrain, units, cities, fog, improvements, etc.). Each layer's canvas is the size of the portal, not the world, and the portal composites only the regions the layers changed. The minimap draws from a layer of its own (`Map/Overview.ts`).

## State and rendering model

- Backend is the source of truth for game state.
- Frontend holds a large mutable object map (`objectMap`) and applies patches to it in place.
- `IncrementalReconstituter` rebuilds only the ids the patches since the last update touched, refilling each id's object in place. `reconstituteData` still rebuilds one-off payloads (notifications, choices, request answers) in `WorkerTransport`.
- UI emits custom events (`patchdatareceived`, `dataupdated`) for dependent components.
- Display work (panels, `dataupdated`, the portal composite) runs at most once per animation frame. State updates stay synchronous during the player's turn, and are coalesced to once a frame while waiting for the other civilizations.

## Transport contract (high level)

Core channels are defined in `src/js/Engine/Transport.ts`:

- Control/config: `start`, `setOption`, `setOptions`, `getOptions`, `notification`
- Save/load: `save`, `saveGame`, `load`
- Gameplay: `action`, `chooseFromList`, `gameNotification`, `turnStarted`, `turnEnded`
- State sync: `gameData`, `gameDataPatch`, `unitActions`
- Requests answered with standalone data: `cityBuildAvailable`, `topCities`, `intelligence`
- Diplomat results: `embassyEstablished`, `investigateCity`
- Debug/cheat: `cheat`, `cheatAdvances`, `cheatPlayers`

Requests go through `Transport.request()` (`AbstractTransport`), which matches a reply to its request by channel and so sends one request per channel at a time.

`quit` and `restart` are declared in `TransportDataMap`, but each is one-directional: the backend sends `restart` on local-player defeat with no frontend receiver, and the main menu sends `quit` with no backend receiver.

## Rewrite implications

- Current architecture already isolates engine logic from UI logic via worker transport.
- The largest complexity concentration is the frontend orchestration in `Renderer`.
- A reactive store-based rewrite can preserve worker boundary while replacing in-place patch application + custom event plumbing with derived state/selectors.
