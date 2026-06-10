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
  - Instantiates players (1 human + AI opponents).
  - Produces full game state and incremental patches.

## Entry points and boot sequence

1. Browser loads `index.html` and starts `dist/frontend.js`.
2. `src/js/frontend.ts` creates `Renderer(new WorkerTransport(new Worker('dist/backend.js')))` and calls `init()`.
3. Worker starts from `src/js/backend.ts` and creates `Game(new ParentTransport())`.
4. Frontend menu sends `start` once setup is complete.
5. Backend binds engine events, starts engine, and dynamically imports generated plugin imports (`src/js/plugins.ts`).

## Main subsystem responsibilities

- `src/js/Engine/Game.ts`
  - Worker-side bootstrap + option handling (`setOption`, `getOptions`, `setOptions`).
  - Creates players and chooses client implementation (`DataTransferClient` for player 0, `SimpleAIClient` for others).
- `src/js/Engine/DataTransferClient.ts`
  - Adapts core game model into UI-transferable objects.
  - Handles player actions and cheats from frontend.
  - Emits `gameData` (initial full snapshot) and `gameDataPatch` (incremental updates).
- `src/js/UI/Renderer.ts`
  - Frontend orchestrator; currently monolithic (~980 LOC).
  - Reconstitutes plain-object graph into rich UI state.
  - Coordinates map layers, action panels, menu windows, notifications, hotkeys.
- `src/js/UI/components/*`
  - Window and UI primitives for reports, city/unit views, menu flows, and overlays.
- `src/js/UI/components/Map/*`
  - Canvas layer renderers (terrain, units, cities, fog, improvements, etc.).

## State and rendering model

- Backend is effectively source-of-truth for game state.
- Frontend holds a large mutable object map (`objectMap`) and applies patches in place.
- UI emits custom events (`patchdatareceived`, `dataupdated`) for dependent components.
- Reconstitution (`reconstituteData`) rebuilds object references from transport payloads.

## Transport contract (high level)

Core channels are defined in `src/js/Engine/Transport.ts`:

- Control/config: `start`, `setOption`, `setOptions`, `getOptions`, `notification`
- Gameplay: `action`, `chooseFromList`, `gameNotification`
- State sync: `gameData`, `gameDataPatch`
- Debug/cheat: `cheat`

Additional ad-hoc channels are used (`quit`, `restart`) from UI/backend paths but are not part of the strongly typed transport map.

## Rewrite implications

- Current architecture already isolates engine logic from UI logic via worker transport.
- The largest complexity concentration is the frontend orchestration in `Renderer`.
- A reactive store-based rewrite can preserve worker boundary while replacing in-place patch application + custom event plumbing with derived state/selectors.

