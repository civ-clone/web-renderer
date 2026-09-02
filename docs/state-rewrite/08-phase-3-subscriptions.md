# 08 — Phase 3: Subscriptions and the `Renderer` Split

**Goal.** Remove the DOM `CustomEvent` plumbing, make each panel update only when
its own data changes, and break `Renderer.ts` into testable modules.

**Depends on.** Phase 2.

**Risk.** Medium. Large diff, small conceptual change. Land it as a sequence of
small commits, each of which leaves a playable game — the order below is chosen
so that is always possible.

## Part A — replace `DataObserver`

Six call sites. Do them one per commit.

| File | Observes | Becomes |
| ---- | -------- | ------- |
| `components/City.ts:406` | city, build, growth, units, treasury | `watch(selectCityDetail, cityId)` |
| `components/CityStatus.ts:102` | player cities | `watch(selectCityStatusRows)` |
| `components/HappinessReport.ts:126` | player cities | `watch(selectHappinessRows)` |
| `components/ScienceReport.ts:52` | player research | `watch(selectResearch)` |
| `components/TradeReport.ts:33` | player, treasuries, trade rates | `watch(selectTradeRows)` |
| `components/UnitSelectionWindow.ts:51` | a unit id list | `watch(selectUnits, ids)` |

The pattern, using `City` as the example. Today:

```ts
this.#dataObserver = new DataObserver(
  [city.id, city.build.id, city.growth.id, ...city.units.map((u) => u.id), treasuryId],
  (data) => {
    const [updatedCity] = (data.player?.cities ?? []).filter((c) => city.id === c.id);

    if (!updatedCity) { this.close(); return; }

    this.#city = updatedCity;
    this.#dataObserver.setIds([...]);          // manual re-subscription
    this.update(cityDetails(updatedCity, ...)); // full body rebuild
  }
);
```

After:

```ts
this.#dispose = watch(
  store,
  subscriptions,
  () => selectCityDetail(store, this.#cityId),
  (detail) => {
    if (detail === null) {
      this.close();   // captured or destroyed

      return;
    }

    this.update(cityDetails(detail, this.#portal, this.#transport, ...));
  }
);
```

Three things disappear:

- **Manual `setIds`.** `watch` re-runs the selector, takes its new dependency
  set, and re-subscribes. When the city builds a unit, the new unit id joins the
  set automatically.
- **Re-finding the entity.** `this.#city` was re-fetched from the new graph
  because the old reference was stale. A view never goes stale; hold the id and
  read through it.
- **The `data.player.cities.filter(...)` scan** per update, replaced by a direct
  store lookup inside the selector.

Once all six are converted:

- delete `src/js/UI/DataObserver.ts`
- delete the `patchdatareceived` scaffolding added in Phase 2 step 5
- delete the `dataupdated` dispatch from `render()`
- delete the `GlobalEventHandlersEventMap` augmentation for both events

**Check:** `grep -rn "dataupdated\|patchdatareceived\|DataObserver" src/` returns
nothing.

## Part B — split `Renderer.ts`

`Renderer.init()` is one closure holding roughly a dozen unrelated concerns.
Extract them in the order below; each extraction is a pure move plus explicit
parameter passing.

### Target layout

```
src/js/UI/
  bootstrap.ts                       replaces Renderer.ts (~80 lines)
  app/
    AppContext.ts                    the object threaded through everything
    elements.ts                      typed DOM lookups
    i18n.ts                          i18next + translations import
    assets.ts                        cursor + preload container fill
    options.ts                       GameOptionsRegistry defaults
  controllers/
    GameController.ts                owns everything from `gameData` onward
    MapController.ts                 portal, layers, minimap, blink tick
    ActiveUnitController.ts          active-unit selection and cycling
    InputController.ts               keyboard and pointer to transport actions
    ChoiceController.ts              chooseFromList to windows
    NotificationController.ts        notification + gameNotification
    HudController.ts                 GameDetails, PlayerDetails, UnitDetails, Actions
  debug/
    DebugPanel.ts                    the debug UI, moved verbatim
    debugExport.ts                   JSON and CSV export
```

### `AppContext`

One object, constructed in `bootstrap.ts`, passed to every controller. No
globals, no singletons — this is what makes controllers testable and what makes
`restart` possible in Phase 6.

```ts
export type AppContext = {
  store: EntityStore;
  views: ViewFactory;
  subscriptions: Subscriptions;
  transport: Transport;
  elements: AppElements;
  options: GameOptionsRegistry;
  debug: DebugFlags;
  /** Every controller pushes its teardown here. */
  disposers: Array<() => void>;
};
```

### Extraction order

Each of these is a commit. The game must play after every one.

1. **`debug/DebugPanel.ts` and `debug/debugExport.ts`.** Roughly 300 lines of
   inline DOM construction and styling (`Renderer.ts:588` to `:1000`). It has
   almost no coupling to game state, so it is the safest first cut and it makes
   the remaining file readable. Move the inline styles into
   `src/css/components/_debug-panel.scss` while you are there.
2. **`app/elements.ts`, `app/i18n.ts`, `app/assets.ts`, `app/options.ts`.** The
   `init()` preamble. Mechanical.
3. **`controllers/NotificationController.ts`.** The `notification` handler with
   its timer, plus `gameNotification` to `Notifications`. Self-contained.
4. **`controllers/ChoiceController.ts`.** The `chooseFromList` handler with
   `interactionLabel` and `negotiationLabel`. About 130 lines, no game-state
   coupling beyond the payload. Take the opportunity to route responses by prompt
   id — `memory-growth-analysis-2026-07.md` §A4 flagged the concurrency hazard
   and only mitigated it; two overlapping prompts still race on one channel.
5. **`controllers/MapController.ts`.** Portal construction, layer wiring,
   minimap, resize, blink interval, `tilesToRender`. Subscribes to
   `selectTileSnapshots` and updates only changed tiles. This is the file Phase 5
   then rewrites internally.
6. **`controllers/ActiveUnitController.ts`.** `applyActiveUnit`,
   `renderActiveUnit`, `setActiveUnit`, `lastUnit`, the scoring reduce. Now that
   view identity works (Phase 2 step 2), this is straightforward state and it
   deserves unit tests: given a set of active-unit actions and a last unit,
   assert which is chosen.
7. **`controllers/HudController.ts`.** `GameDetails`, `PlayerDetails`,
   `UnitDetails`, both `Actions` panels. Each gets its own `watch`, so the
   `render()` function's habit of rebuilding all of them together goes away.
8. **`controllers/InputController.ts`.** `keyToActionsMap`, `directionKeyMap`,
   `leaderScreensMap`, and the ~200-line `keydown` handler. Restructure as a
   command table:

   ```ts
   type Command = {
     key: string;
     when?: (context: InputState) => boolean;
     run: (context: InputState, event: KeyboardEvent) => void;
   };
   ```

   Resolution becomes: find the first command whose key matches and whose `when`
   passes. That kills the chain of early returns, makes conflicts visible — `F5`
   is currently bound both to the trade report and to reload, which is on the
   TODO list — and makes each command testable without a keyboard.
9. **`controllers/GameController.ts`.** What remains of the `gameData` handler:
   construct the controllers, wire the delta path, own the lifecycle.
10. **`bootstrap.ts`.** What remains of `init()`. Delete `Renderer.ts` and point
    `frontend.ts` at `bootstrap`.

### The render loop after the split

`render()` and `scheduleRender()` disappear. Nothing coalesces "the render"
because there is no longer one render — each subscriber updates itself when its
own data changes.

Two things still want frame coalescing, and they say so locally:

- **The map composite.** `MapController` marks itself dirty on a tile change and
  composites once per frame.
- **The blink tick.** Phase 5 restricts it to the active-unit layer.

With `updateState` no longer doing graph work, the reason it had to stay
synchronous is gone (see [`07-phase-2-cutover.md`](./07-phase-2-cutover.md)
step 2). Applying a delta and calling `notify` is O(changed) and can run inline
on message receipt; only the DOM and canvas work that subscribers do needs
coalescing, and each subscriber owns that decision.

## Part C — components take `AppContext`

Components currently reach for globals: `document.getElementById`, the
`i18next` `t` import, module-level `PopupMenu` state. Where a component needs
store access, pass it in rather than importing a singleton.

Do this opportunistically as each component is touched, not as a sweep. The
constructor signature changes from
`new City(cityData, portal, transport)` to
`new City(context, cityId, portal)` — note it takes an **id**, not an entity.
Holding an id and reading through a selector is the pattern; holding an entity
is the anti-pattern that made stale references possible.

## Testing

The point of the split is that these become testable at all.

```ts
// controllers/ActiveUnitController.test.ts
it('keeps the current unit active when it still has moves', () => {
  const store = storeFromFixture('turns-050'),
    controller = new ActiveUnitController(contextFor(store));

  controller.setActive(unitId);
  applyDelta(store, moveOf(unitId));

  expect(controller.active()?.id).toBe(unitId);  // the bug fixed in Phase 2
});
```

```ts
// controllers/InputController.test.ts
it('sends an ActiveUnit action for a direction key', () => { ... });
it('does not send unit commands while a modal dialog is open', () => { ... });
it('prefers the trade report over reload for F5', () => { ... });
```

```ts
// State/selectors/city.test.ts
it('returns null once the city is removed', () => { ... });
it('memoises until one of the city entities changes', () => { ... });
```

Aim for controllers and selectors covered; DOM-heavy components can stay
manual-only for now.

## Definition of done

- [ ] `DataObserver.ts` deleted; the grep for both event names is clean.
- [ ] `Renderer.ts` deleted; `frontend.ts` imports `bootstrap`.
- [ ] No file in `src/js/UI/` exceeds 400 lines.
- [ ] Every controller takes `AppContext`; no new module-level singletons.
- [ ] Unit tests exist for `ActiveUnitController`, `InputController` command
      resolution, and at least four selectors.
- [ ] The Phase 2 manual checklist passes in full.
- [ ] `render` mean ms is materially below the Phase 2 number — this is the
      phase where panels stop rebuilding on every flush.

## Notes for the executor

- **One extraction per commit.** The order above is chosen so each is safe on
  its own. If an extraction turns out to need another one first, do that one
  first rather than merging them.
- Resist redesigning components while moving them. Move first, redesign later,
  in a separate commit with its own reasoning.
- `PopupMenu`'s module-level `WeakMap` and `AssetStore`'s singleton are fine to
  leave. The rule is about *state that a restart must reset*, not about every
  module-level value.
