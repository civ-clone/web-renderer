# UI Stress Harness

The repository now includes an opt-in UI stress harness designed to exercise the frontend repeatedly during long sessions.

## Goals

The harness is intended to repeatedly drive:

- player actions and backend serialization
- patch application and frontend reconstitution
- map viewport changes and canvas re-renders
- creation/destruction of report and city windows
- choice-dialog handling during automated play

## Enable it

Open the app with:

`?debug=1`

`debug=1` enables the debug control panel and starts with:

- stress runner ON
- local player automation ON
- stress window churn OFF (engine-generated windows still appear)
- memory sampling ON

## Debug control panel (`debug=1`)

When `debug=1` is enabled, a top-right debug panel appears with runtime toggles for:

- stress runner on/off
- automate local player on/off
- stress window churn on/off
- close currently open dialogs
- stop all automation
- export debug snapshot as JSON
- export memory samples as CSV

JSON export includes:

- toggle state (`stress`, `automatePlayer`, `stressWindows`)
- stress runner internals (`tick`, pending timeouts, tracked windows/choices)
- runtime snapshots (turn, object count, pending tile renders)
- DOM snapshots (dialog list/titles/open state, node/canvas/image counts)
- heap metrics (`usedJSHeapSize`, `totalJSHeapSize`, `jsHeapSizeLimit`)
- full sampled memory timeline plus min/max/first/last summary

Keyboard shortcuts (work even when modal dialogs are open):

- `Alt+Shift+S` - toggle stress runner
- `Alt+Shift+A` - toggle automate local player
- `Alt+Shift+W` - toggle stress windows
- `Alt+Shift+C` - close open dialogs
- `Alt+Shift+J` - export debug JSON
- `Alt+Shift+X` - export memory CSV

The harness becomes active once a game has been started and initial `gameData` has been received.

## What it does

When enabled, the harness:

- cycles viewport focus between active units and cities
- toggles map overlay visibility modes
- repeatedly opens/closes:
  - `ScienceReport`
  - `CityStatus`
  - `HappinessReport`
  - `TradeReport`
  - `City`
  - this can be disabled with the `Stress Windows` toggle
- auto-selects choices in selection/action windows so the game keeps progressing
- automatically performs deterministic player actions where available:
  - choose research
  - choose government
  - choose/change city production
  - complete production
  - launch spaceship
  - activate/move/order units
  - end turn

Implementation:

- `src/js/UI/lib/UIStressRunner.ts`
- integrated in `src/js/UI/Renderer.ts`

## Notes on determinism

When debug automation is enabled, the backend local client delegates decision-making to `SimpleAIClient`.
This usually progresses turns more reliably than UI key/window automation alone, but full run determinism still depends on engine/plugin state.

The harness is deterministic relative to the current visible game state, but the broader game is not guaranteed to be fully deterministic because AI and plugin behavior may vary unless the whole engine stack is seeded and controlled.

That said, it is still useful for regression tracking because it removes most manual interaction and repeatedly exercises the same categories of UI work.

## Recommended workflow

1. Start a normal game with assets available.
2. Enable `debug=1`.
3. Let the session run to ~100 turns.
4. Export JSON/CSV from the debug panel.
5. Compare heap/object-count curves across commits.
