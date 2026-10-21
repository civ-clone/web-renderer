# Code review, 2026-10-21

A read-only review of the whole of `web-renderer` at `main` `18f28b0`, done in six areas by six independent
reviewers working from one brief: verify every finding end to end (callers, callees, the data the engine sends, the
tests), state a concrete failure scenario, mark it CONFIRMED or PLAUSIBLE, and dedupe against the open issues.
Probe and bench scripts were used where a claim could be executed; they are not kept here, but each report says
what was run.

Line numbers are from `18f28b0`. Each report has the same sections: area health, findings (sorted by severity),
already tracked, engine notes, simplifications, coverage gaps.

| Report | Area | Findings |
| --- | --- | --- |
| [`transport.md`](./transport.md) | `src/js/Engine/*` except `DataTransferClient.ts`; `backend.ts`, `frontend.ts`; save/load | 12 (1 high, 3 med, 8 low) |
| [`dtc.md`](./dtc.md) | `src/js/Engine/DataTransferClient.ts` | 13 (1 high, 3 med, 9 low) |
| [`renderer.md`](./renderer.md) | `src/js/UI/Renderer.ts`, `src/js/UI/lib/*` | 9 (2 med, 7 low) |
| [`map.md`](./map.md) | `src/js/UI/components/Map*`, `Portal`, `GamePortal`, `World`, `Window`, `components/lib/*` | 12 (4 med, 8 low) |
| [`windows.md`](./windows.md) | the other components, `DataObserver`, options, locale | 14 (1 high, 3 med, 10 low) |
| [`tooling.md`](./tooling.md) | build, release, deploy, test runners, generators | 14 (1 high, 2 med, 11 low) |

## Where each finding went

Confirmed bugs became issues, one per cause, with related small fixes grouped. Maintainability notes went into one
chore issue. Plausible findings with no trigger found stay here. Engine notes stay here.

| Report | Finding | Issue |
| --- | --- | --- |
| transport | 1 notification `innerHTML` with text from the save file | #469 |
| transport | 2 request with no reply wedges its channel; 3 worker errors unseen; 4 failed load leaves a blank page; 5 `DataQueue` never recovers | #470 |
| transport | 6 alerts show HTML entities | #472 |
| transport | 7 pending save shared between tabs; 8 `UnknownUnit` keeps its first tile; 9 `start` twice | report only (plausible / no reader) |
| transport | 10 `Retryable`; 11 `Store` methods; 12 `orphanIds` | #478 |
| dtc | 1 a second prompt cancels the first; 2 `EndTurn` during turn-start talks | #491 |
| dtc | 3 a throw in an action or builder; 9 request handlers reply only on success | #470 |
| dtc | 4 gold from talks never sent | #492 |
| dtc | 5 investigated city sends `available` | #493 |
| dtc | 6 hand-over timer and empty patches; 10 notifications before `gameData` | #151 (comment) |
| dtc | 7 `ReassignWorkers` ownership (network play) | report only; relevant to #161/#165 |
| dtc | 8 cheats don't resend actions | #494 |
| dtc | 11 government change resends every tile | #488 |
| dtc | 12 `UnknownUnit` stale tile/player; 13 negotiation loop uncapped | report only (latent) |
| renderer | 1 modifier keys; 5 Caps Lock; 6 Shift+5/6 | #479 |
| renderer | 2 `Object.keys` per patch | #480 |
| renderer | 3 observed windows stale during the AI turns | #481 |
| renderer | 4 JoinCity apostrophe; 7 reload confirmation untranslated | #472 |
| renderer | 8 stack window ignores awake units | #482 |
| renderer | 9 dead persistent `gameData` receiver | #344 plan, Track B step 16 |
| windows | 1 no `fallbackLng` | #471 |
| windows | 2 Game Over window closed natively (root cause of #351) | #351 (comment) |
| windows | 3 City screen stays open after capture | #483 |
| windows | 4 stack window never closes | #482 |
| windows | 5 Enter closes the City screen; 6 specialist id; 10 focus stolen; 11 two pickers | #484 |
| windows | 7 CivilDisorder tooltip; 8 Trade report class names; 14 hard-coded English | #472 |
| windows | 9 `NotificationWindow` dead queue | #478 |
| windows | 12 slider `NaN` → 50 | #485 |
| windows | 13 Import Assets has no error path | report only (plausible) |
| map | 1 stack ghost; 5 city labels; 6 yield icons | #486 |
| map | 2 unit-only changes never redraw | #487 |
| map | 3 `TerrainAbstract` O(n²); 8 `dirtyRegions` merge | #488 |
| map | 4 turns left ignores the sign | #489 |
| map | 7 drag state | #490 |
| map | 9 missing-image placeholder; 10 unguarded layers | report only (plausible) |
| map | 11 `Window` `position`; 12 `Portal.visibleBounds` | #478 |
| tooling | 1 runners can't fail; 7 `plugins.ts` regeneration; 12 temp dirs; 14 identical runners | #473 |
| tooling | 2 plugin import order; 6 generator cwd and swallowed errors | #474 |
| tooling | 3 trailers; 4 `Note:` paragraphs; 5 lone `Closes` | #475 |
| tooling | 8 cache busting; 9 `releases.json` in the bundle | #476 |
| tooling | 10 no CI on pull requests | #477 |
| tooling | 11 `tests/` not type-checked | #339 (comment) |
| tooling | 13 dead tooling | #478 |

Things the review confirmed are sound, so nobody re-checks them: `IncrementalReconstituter`'s edge cases
(fuzzed against `reconstituteData`); `PendingMove` and the key queue on every path traced; the viewport wrap-around
maths on both axes (the engine's world is a torus; "y does not wrap" is only the stop-at-the-poles option); no
caller mutates a shared cached image; every literal i18n key under `src/js/UI` exists (241 `t()` calls checked);
options persistence; the save/load hand-over; the stand-in objects (`unitWithoutActions`, `playerWithoutActions`,
`withoutAvailable`); every hold in `DataTransferClient` released on normal paths.
