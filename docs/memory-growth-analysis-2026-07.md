# Memory Growth Analysis and Proposed Fixes (2026-07-01)

## Context

Symptom: with the application open for a long session (many turns / hours), browser
memory grows until the tab is killed or the machine is exhausted.

Previous remediation (see [`performance-review-2026-06.md`](./performance-review-2026-06.md)
and `TODO.memory-performance.md`) added window cleanup on close, `WeakMap`-based
unknown-entity caches, object-map pruning, interval disposal, and transport
disposers. Those changes are all present and correct, but they do not address the
findings below — several of which are unbounded retention paths that fully explain
continued long-session growth.

Findings are ordered by expected impact. Each includes the mechanism, evidence,
a proposed fix, and rough effort/risk.

## Status update (2026-07-01)

Implemented the same day as the analysis (see per-finding status notes and the
fix-order table below): A1, A2, A4, A5, B1, C1, C3, C4, the adaptive-prune part
of A3, and the in-place sort cleanups from section D. Still open: backend
`remove` patches (rest of A3), coalesced reconstitution (C2), viewport-sized
main-portal layers (B2), the restart-flow wiring (D1), and per-draw clone
reduction (C5).

---

## A. Unbounded retention (true leaks)

### A1. `Actions.#actions` map is never cleared — pins a full game-state snapshot per patch batch

**This is the most likely primary cause of long-session exhaustion.**

- Files: `src/js/UI/components/Actions.ts:27` (declaration), `:208` (insertion),
  `src/js/UI/Renderer.ts:1065-1071` (rebuild trigger).
- Mechanism:
  - `Actions` keeps `#actions = new Map<Node, Action>()`. `build(...)` calls
    `this.empty()` (which only detaches DOM children) and then `set(...)`s a new
    entry per action — **entries are never deleted or cleared**.
  - `Renderer`'s `handler(...)` calls `primaryActions.build(...)` and
    `secondaryActions.build(...)` on *every* `gameData`/`gameDataPatch` delivery.
  - Each retained `Action` holds its `PlayerAction`, whose `value` is a node in the
    freshly reconstituted data graph. Because the reconstituted graph is fully
    interconnected (unit → tile → units → player → cities → world → tiles → …),
    **each retained entry pins essentially an entire snapshot of the game state**.
  - The backend flushes patches multiple times per turn (`sendPatchData()` runs per
    handled action, per `unit:moved`, per cheat — `src/js/Engine/DataTransferClient.ts:482,1246,1261`),
    so this leaks one full-graph snapshot per flush, forever. Late-game graphs are
    large, so growth accelerates over time — matching the observed symptom.
- Fix (small, low risk):
  - Clear the registry at the top of `build(...)`: `this.#actions.clear()`.
  - Alternatively (or additionally) make it a `WeakMap<Node, Action>`; once
    `empty()` detaches the nodes, entries become collectable. A plain `clear()` is
    simpler and deterministic.
- Verification: with the `?debug=1` harness, `objectCount` should stay flat-ish
  while `usedJSHeapSize` stops climbing between prunes; a heap snapshot should no
  longer show N retained `reconstituteData` graphs with retainer chains through
  `Actions`.
- **Status: fixed 2026-07-01** — `build(...)` now clears the registry alongside
  `empty()`.

### A2. `replaceColours` cache uses a `Math.random()` key for canvas sources

- File: `src/js/UI/lib/replaceColours.ts:3,10-12,126`.
- Mechanism:
  - Cache key is `(image instanceof HTMLImageElement ? image.src : Math.random()) + replacement`.
  - Any non-`HTMLImageElement` source (e.g. the shared missing-image placeholder
    *canvas* returned by `getPreloadedImage` — `src/js/UI/lib/getPreloadedImage.ts:40-44`)
    gets a random key, so the lookup **never hits and a new canvas is inserted on
    every call**, permanently. `renderUnit(...)` runs per unit tile per render, so a
    single missing unit sprite turns every render pass into permanent cache growth.
- Fix (small, low risk):
  - Don't cache non-image sources at all (recolour and return), or key canvas
    sources via a `WeakMap<CanvasImageSource, Map<string, HTMLCanvasElement>>`.
  - Consider also bounding the cache (LRU) as belt-and-braces.
- **Status: fixed 2026-07-01** — non-image sources are no longer cached; only
  `HTMLImageElement` sources (stable `src` key) populate the cache.

### A3. Frontend object map only ever grows between prunes; backend never emits `remove`

- Files: `src/js/UI/Renderer.ts:1226-1287` (patch application),
  `src/js/UI/Renderer.ts:981-990` (prune trigger),
  `src/js/Engine/DataTransferClient.ts:518` (the only `remove` usage — commented out).
- Mechanism:
  - Every `add`/`update` patch merges `value.objects` into `objectMap.objects`;
    nothing is ever deleted by the protocol. `pruneObjectMap` compensates, but only
    every 5 turns *and* only above 5,000 objects, and only when a patch happens to
    arrive with `turn % 5 === 0`. Sub-5,000-object games and intra-window growth
    are never reclaimed; the prune walk itself is a main-thread full reachability
    sweep.
- Fixes (medium):
  - Emit `remove` patches from the backend for destroyed units/cities and expired
    entities, so the map self-maintains.
  - Make prune cadence adaptive (e.g. object-count delta since last prune rather
    than turn multiples) and consider chunking the sweep via `requestIdleCallback`
    (already noted in the 2026-06 review as follow-up).
- **Status: partially fixed 2026-07-01** — prune now also triggers when the map
  grows 1.5× beyond its last post-prune size (still gated on >5,000 objects).
  Backend `remove` patches and idle-chunked sweeping remain open.

### A4. Stranded `receiveOnce`/event-emitter listeners on the backend

- Files: `src/js/Engine/DataTransferClient.ts:888` (`chooseFromList` receiveOnce),
  `:1241-1267` (`takeTurn` action listener), `src/js/Engine/AbstractTransport.ts:31-36`
  (`request`).
- Mechanism:
  - `chooseFromList` registers a `receiveOnce('chooseFromList', …)` per prompt. If
    a prompt is abandoned (window force-closed, e.g. via the debug panel's "close
    open dialogs", or a `restart`), the listener stays registered and will consume
    the *next* `chooseFromList` response — a correctness hazard plus retained
    closure (which captures `ChoiceMeta` and its choices/graph slices).
  - `takeTurn()` registers an `action` listener on the internal emitter that is
    only removed when `handleAction` returns `true`. If `handleAction` throws, the
    listener persists into subsequent turns, double-processing actions (and
    double-sending full-player patches) until a later `EndTurn` removes it.
  - `receiveOnce` has no disposer equivalent (unlike `receive`), so none of these
    can currently be cleaned up externally.
- Fixes (small–medium):
  - Give `receiveOnce` a disposer return like `receive`, and dispose superseded
    `chooseFromList` listeners when a new prompt is issued (or route responses by
    prompt id).
  - Remove the `action` listener in a `finally`/catch path in `takeTurn()`.
- **Status: fixed 2026-07-01** — `receiveOnce` returns a disposer on both
  transports; `chooseFromList` disposes a superseded pending listener before
  registering the next; `takeTurn` removes its `action` listener when
  `handleAction` throws. Prompt-id routing remains a future hardening step.

### A5. `PopupMenu.menuMap` module-level `Map` can retain menus

- File: `src/js/UI/components/PopupMenu.ts:5,44,117-121`.
- Mechanism: entries are only deleted inside `remove()`. A menu whose target is
  detached without `remove()` being invoked stays in the module-level map (along
  with its launcher key) for the page lifetime.
- Fix (small): use a `WeakMap<any, PopupMenu>` keyed by launcher — the iteration in
  `remove()` can be replaced by tracking the launcher on the instance.
- **Status: fixed 2026-07-01** — `menuMap` is now a `WeakMap` and instances track
  their launcher.

---

## B. Large repeated allocations (canvas memory spikes)

### B1. City window mini-map allocates ~10 full-world-size canvases per open *and per update*

- File: `src/js/UI/components/City.ts:135-190` (`renderMap`), `:412-420`
  (rebuild on observed patch), `src/js/UI/components/Map.ts:149-152` (canvas sizing).
- Mechanism:
  - `renderMap` builds a `Portal` with 10 layers. Each layer's canvas is sized
    from the **full world dimensions** (the `World` passed in keeps
    `city.player.world`'s width/height; only `tiles` is restricted), even though
    the visible city map is ~5×5 tiles.
  - For an 80×50 world at `tileSize 16 × scale 2` that is `2560×1600` px ≈ 16 MB of
    backing store per layer → **~160 MB per city-window open**.
  - The window's `DataObserver` callback rebuilds the whole body — including
    `renderMap` — on every matching patch, and (see C3) it can fire multiple times
    per patch batch. Browsers reclaim canvas backing stores lazily, so repeated
    opens/updates can exhaust canvas memory well before JS-heap GC pressure shows.
- Fixes (medium, contained to city view):
  - Size the city portal layers to the city radius (5×5 tiles) and translate tile
    coordinates when rendering, or
  - Reuse a single long-lived city portal (resize/clear per open) instead of
    allocating fresh layers each time, and only rebuild the map section when tile
    or worked-tile data actually changed.
- **Status: fixed 2026-07-01** — `renderMap` now remaps the city's tiles into a
  7×7 local coordinate space (5×5 block plus a one-tile unknown border so
  coast/fog neighbour lookups behave as before), so each layer canvas is
  city-radius-sized (~200 KB) instead of world-sized (~16 MB).

### B2. Main portal baseline: 12 full-world canvases

- Files: `src/js/UI/Renderer.ts:446-469`, `src/js/UI/components/Map.ts:149-152`.
- Mechanism: every layer is a full world-size canvas — ~16 MB each for an 80×50
  world at scale 2, ~200 MB baseline; proportionally worse for larger worlds.
  This is a (known) fixed cost rather than growth, but it lowers the headroom the
  leaks above have to work with.
- Fixes (larger, listed in 2026-06 review): viewport-sized buffers with
  dirty-rect rendering, chunked tile caches, or merging static layers (Land/
  Terrain/Irrigation/Improvements) into one canvas.

---

## C. Churn multipliers (GC pressure that presents as growth)

These do not retain memory permanently, but they multiply allocation rate, keep
heap high-water marks elevated, and make the leaks above bite sooner.

### C1. `WorkerTransport` reconstitutes every hierarchy payload once per listener

- File: `src/js/Engine/WorkerTransport.ts:30-40` (`receive`), `:49-67` (`receiveOnce`).
- Mechanism: the message listener runs `reconstituteData(data)` **before** checking
  `channel === receivingChannel`. With ~5 persistent listeners registered by
  `Renderer`, every `gameData` and `gameNotification` message is fully
  reconstituted ~5 times, and all but (at most) one result is discarded.
  Note the Renderer's `gameData` handler ignores the reconstituted argument
  entirely and uses the raw data (`Renderer.ts:1166-1170`), so that work is 100%
  wasted for the largest payloads.
- Fix (small, low risk): move the channel check above the reconstitution; ideally
  reconstitute lazily/once per message rather than per listener.
- **Status: fixed 2026-07-01** — both `receive` and `receiveOnce` now check the
  channel before reconstituting, so only matching listeners pay the cost.

### C2. Full-graph reconstitution per patch batch

- Files: `src/js/UI/Renderer.ts:964-990`, `src/js/UI/lib/reconstituteData.ts`.
- Mechanism: `handler(...)` rebuilds the entire object graph from scratch on every
  patch delivery; the backend flushes several times per turn. Old graphs remain
  reachable until replaced via `lastUnit`/`activeUnit`/open windows, so 2–3 full
  graphs are commonly live at once, plus per-flush garbage.
- Fixes (medium–large):
  - Debounce/coalesce: apply patches immediately but schedule a single
    reconstitution per animation frame (or per turn) instead of per flush.
  - Longer term (rewrite direction already documented): normalized reactive store
    with selectors, avoiding whole-graph rebuilds entirely; or move reconstitution
    into a worker (existing TODO).

### C3. `DataObserver` stacks one-shot handlers — components rebuild N times per batch

- File: `src/js/UI/DataObserver.ts:30-38`; dispatch sites `src/js/UI/Renderer.ts:1252-1258`
  (`patchdatareceived` fires once per patch entry) and `:1017-1023` (`dataupdated`).
- Mechanism: each matching `patchdatareceived` adds another `{ once: true }`
  `dataupdated` listener, so a window observing an entity touched by N patches in
  one batch rebuilds N times when `dataupdated` fires. For the city window each
  rebuild includes B1's ~160 MB of canvas allocation.
- Fix (small): make the pending trigger a boolean (`#pending = true`) instead of
  stacking listeners; reset it in the single `dataupdated` handler.
- **Status: fixed 2026-07-01** — `DataObserver` now uses a pending flag and a
  single persistent `dataupdated` listener (removed in `dispose()`), so the
  handler runs at most once per update.

### C4. Unfiltered deep serialization of `gameNotification` payloads

- Files: `src/js/Engine/DataTransferClient.ts:1189-1191`,
  `src/js/Engine/ParentTransport.ts:60-62`.
- Mechanism: `sendNotification` sends the `Notification` DataObject, which is
  serialized via `toPlainObject()` with **no reference filter**, so notification
  data like `{ city }` drags a deep object graph across the transport (then gets
  reconstituted per listener — C1).
- Fix (small): serialize notifications with the same `#dataFilter`/
  `filterToReference` machinery used for patches.
- **Status: fixed 2026-07-01** — `sendNotification` now serializes with
  `#dataFilter()` (visibility filter, no reference indirection), so other
  players/cities/units are bounded to their `Unknown*` wrappers, which keep the
  fields notification templates use (`civilization`, city `name`/`tile`,
  unit `_`). Reference-style filtering (`filterToReference`) was deliberately
  **not** used here: notification payloads are reconstituted standalone on the
  frontend, so `#ref` entries would not resolve.

### C5. Per-draw image/canvas cloning in the render hot path

- Files: `src/js/UI/lib/getPreloadedImage.ts:48` (clone per call),
  `src/js/UI/lib/replaceColours.ts:14-25` (canvas clone per cache hit),
  `src/js/UI/lib/renderUnit.ts` (recolour per unit per render),
  `src/js/UI/components/Map/Land.ts:54-57` (new 16×16 canvas per coast tile per render),
  `src/js/UI/Renderer.ts:514-522` (full `portal.render()` every 500 ms blink tick).
- Mechanism: tens of thousands of short-lived nodes/canvases per full render pass,
  re-run twice a second by the active-unit blink interval.
- Fixes (small–medium):
  - Return the cached image directly from `getPreloadedImage` and only clone in
    call sites that actually mutate (most call sites just `drawImage` it).
  - Return the cached recoloured canvas directly (callers that draw text on it —
    `renderUnit` — can composite onto a scratch canvas instead).
  - Restrict the blink-tick render to the active-unit layer/viewport rather than
    a full portal composite.

---

## D. Smaller correctness/lifecycle notes (worth fixing while in the area)

1. **Restart flow is unwired and would leak the old game.** The backend sends
   `restart` on defeat (`DataTransferClient.ts:748`) but no frontend receiver
   exists; `quit` (`MainMenu.ts:86`) likewise has no backend receiver. If a second
   `gameData` were ever delivered, the `gameDataPatch` handler still mutates the
   *first* game's `objectMap` closure (`Renderer.ts:401-405,1226`), retaining the
   old map and misapplying patches. Recommendation: implement `restart` as a page
   reload (matching current one-game-per-page assumptions) or thread the current
   `objectMap` through a mutable reference.
2. **`Units.renderTile` sorts `tile.units` in place** (`Map/Units.ts:20-22`),
   mutating shared state from the render path — copy before sorting.
   *(Fixed 2026-07-01, along with the same pattern in `Map/Yields.ts`.)*
3. **`chooseFromList` concurrency**: two pending prompts race on the same channel;
   responses carry no prompt id (see A4). *(Mitigated 2026-07-01 by disposing a
   superseded pending listener; proper prompt-id routing still open.)*

---

## Suggested fix order

| Order | Item | Effort | Risk | Expected effect | Status |
| ----- | ---- | ------ | ---- | --------------- | ------ |
| 1 | A1 `Actions.#actions.clear()` | Trivial | Low | Removes the dominant unbounded leak | ✅ 2026-07-01 |
| 2 | C1 channel-check before reconstitution | Small | Low | Cuts several full-graph allocations per message | ✅ 2026-07-01 |
| 3 | C3 `DataObserver` pending flag | Small | Low | Removes N× window rebuilds per batch | ✅ 2026-07-01 |
| 4 | A2 `replaceColours` cache keying | Small | Low | Removes unbounded cache growth path | ✅ 2026-07-01 |
| 5 | B1 city mini-map canvas sizing/reuse | Medium | Medium | Removes ~160 MB/open canvas spikes | ✅ 2026-07-01 |
| 6 | C4 filtered notification payloads | Small | Low | Shrinks transport payload churn | ✅ 2026-07-01 |
| 7 | A4 `receiveOnce` disposers + `takeTurn` cleanup | Medium | Medium | Prevents listener stranding/double-processing | ✅ 2026-07-01 |
| 8 | A3 backend `remove` patches + adaptive prune | Medium | Medium | Keeps object map bounded without cliff-edge prunes | ◐ prune part done |
| 9 | C2 coalesced reconstitution | Medium–large | Medium | Cuts steady-state allocation rate substantially | Open |
| 10 | B2 viewport-sized layers | Large | High | Lowers baseline; part of rewrite track | Open |

Items 1–4 are each a few lines and independently verifiable; they were landed
first and can be measured individually against the larger items.

## Verification methodology

1. Baseline: run `?debug=1` to ~100 turns; export debug JSON + memory CSV
   (Alt+Shift+J / Alt+Shift+X). Record `usedJSHeapSize` trend, `objectCount`
   trend, `canvasCount`, and `domNodeCount`.
2. After each fix, repeat with similar world settings and compare curves. A1
   should visibly flatten the heap slope; B1 should flatten `canvasCount` spikes
   during stress-window churn (`Stress Windows` toggle ON).
3. Heap-snapshot check for A1: in DevTools, take three snapshots across ~10 turns
   and confirm no growing set of retained objects with retainer chains through
   `Actions` / `Map.entries`.
4. Long-soak: overnight `?debug=1` run; success criterion is a sawtooth (GC
   reclaiming to a stable floor) rather than a monotonic climb.
