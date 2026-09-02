# 10 — Phase 5: The Map Renderer

**Goal.** Replace twelve world-sized canvases with one static viewport buffer
plus direct dynamic drawing. Cut the canvas baseline from roughly 200 MB to
under 30 MB and stop the 500 ms blink tick compositing the whole world.

**Depends on.** Phase 2 (`TileSnapshot`). Independent of Phases 3 and 4.

**Risk.** Medium. Contained to `components/Map*` and `MapController`, but the
per-tile drawing logic is subtle — the coast bitmask in `Map/Land.ts`, the
neighbour redraw in `TerrainAbstract`, city-name placement at the map edge — and
regressions are visual, so they need eyes rather than assertions.

**Keep every `renderTile` body.** They are correct. Only what they draw *into*,
and what they read *from*, changes.

## The problem

`Map.setCanvasSize` sizes every layer to the whole world:

```ts
this.#canvas.height = this.#world.height() * this.tileSize();
this.#canvas.width = this.#world.width() * this.tileSize();
```

An 80×50 world at `tileSize 16 × scale 2` is 2560×1600 per layer — about 16 MB
of backing store. `GamePortal` builds twelve. `Portal.render` then blits all
twelve, tiled for wrap-around, into the viewport canvas, and `IntervalHandler`
triggers exactly that every 500 ms just to blink the active-unit marker.

Larger worlds scale linearly. This is the largest fixed cost in the app.

## Target

Two canvases, both viewport-sized.

```
┌─ static buffer ────────────────────┐   rebuilt on scroll or tile change
│  Land, Irrigation, Terrain,        │   viewport + 1 tile margin
│  Improvements, Feature,            │
│  GoodyHuts, Fog                    │
└────────────────────────────────────┘
                 │  drawImage
                 ▼
┌─ visible canvas (already exists) ──┐   composited per frame
│  static buffer, then in order:     │
│  Yields, Units, Cities,            │   drawn directly, no intermediate canvas
│  CityNames, ActiveUnit             │
└────────────────────────────────────┘
```

The static layers change only when tile data changes. The dynamic layers are
sparse — only tiles carrying a unit, a city or a yield overlay draw anything —
so an intermediate canvas per layer buys nothing over drawing them straight into
the composite each frame.

At 1600×900 that is roughly 5.8 MB each, about 12 MB total, independent of world
size.

## Step 1 — `TileSnapshot`

Specified here; **built in Phase 1** and consumed by Phase 2's `World` change.

```ts
// src/js/UI/State/selectors/world.ts
export type TileSnapshot = {
  id: string;
  x: number;
  y: number;
  isLand: boolean;
  isWater: boolean;
  isCoast: boolean;
  /** Terrain class name, e.g. 'Grassland'. 'Unknown' for unexplored. */
  terrain: string;
  /** Terrain feature class names, e.g. ['River']. */
  features: string[];
  /** Tile improvement class names, e.g. ['Road', 'Irrigation']. */
  improvements: string[];
  cityId: string | null;
  cityPlayerId: string | null;
  goodyHut: string | null;
  workedByCityId: string | null;
  unitIds: string[];
  yields: Array<{ type: string; value: number }>;
};

export const selectTileSnapshots = createSelector(
  (store): readonly (TileSnapshot | undefined)[] => {
    const world = selectPlayer(store)?.world;

    if (!world) {
      return [];
    }

    const snapshots = new Array<TileSnapshot | undefined>(
      world.width * world.height
    );

    world.tiles.forEach((tile) => {
      snapshots[tile.y * world.width + tile.x] = toSnapshot(tile);
    });

    return snapshots;
  },
  () => 'tileSnapshots'
);
```

Three properties matter:

- **Flat and integer-indexed.** `Map/Land.ts` alone does eight neighbour lookups
  per tile; `snapshots[y * width + x]` beats both the string-keyed `Map` used
  today and any proxy access.
- **Plain objects.** No traps on the hottest path in the renderer.
- **Memoised on tile versions.** It rebuilds only when tiles actually change,
  not on every flush like `World.rebuildLookup` does today.

Also expose a per-tile selector so a single tile change does not rebuild the
whole array:

```ts
export const selectTileSnapshot = createSelector(
  (store, tileId: string) => toSnapshot(views(store).view(tileId)),
  (tileId) => tileId
);
```

and have `selectTileSnapshots` compose it. Then a one-tile change costs one
`toSnapshot` plus an array copy, not 4,000 conversions.

## Step 2 — layers become painters

`Map` currently owns a canvas. Split that: a `TilePainter` knows how to draw one
tile into a supplied context at a supplied offset; the buffer owns the canvas.

```ts
// src/js/UI/components/Map/TilePainter.ts
export abstract class TilePainter {
  #world: World;
  #scale: number;
  #tileSize: number;
  #visible = true;

  abstract renderTile(
    context: CanvasRenderingContext2D,
    tile: TileSnapshot,
    offsetX: number,
    offsetY: number
  ): void;

  // drawImage, putImage, filterNeighbours, replaceColours,
  // getPreloadedImage, isVisible, setVisible: moved from Map, taking an
  // explicit context and offsets instead of reading this.#context.
}
```

The migration of each layer is mechanical. `Map/Units.ts` today:

```ts
renderTile(tile: Tile): void {
  const { x, y } = tile,
    size = this.tileSize(),
    offsetX = x * size,
    offsetY = y * size;
  // ...
  this.putImage(image, offsetX, offsetY);
}
```

becomes:

```ts
renderTile(context, tile, offsetX, offsetY): void {
  // body unchanged; offsets are supplied rather than derived from x/y
  this.putImage(context, image, offsetX, offsetY);
}
```

`TerrainAbstract.update`'s neighbour expansion moves up into the buffer's
invalidation logic: when tile *t* changes, mark *t* and its eight neighbours
dirty. That is where it belongs — it is an invalidation rule, not a drawing rule.

## Step 3 — the static buffer

```ts
// src/js/UI/components/Map/StaticBuffer.ts
export class StaticBuffer {
  #canvas: HTMLCanvasElement;
  #context: CanvasRenderingContext2D;
  #painters: TilePainter[];
  /** Top-left tile currently covered by the buffer. */
  #origin = { x: 0, y: 0 };
  #dirty = new Set<number>();   // flat tile indices
  #full = true;

  /** Viewport size in pixels; the buffer adds a one-tile margin. */
  resize(width: number, height: number): void;

  /** Called when the portal centre moves. */
  setOrigin(x: number, y: number): void;

  /** Called when tiles change. Expands to neighbours for terrain painters. */
  invalidate(indices: Iterable<number>): void;

  /** Redraws whatever is dirty. Cheap when nothing is. */
  update(snapshots: readonly (TileSnapshot | undefined)[]): void;

  canvas(): HTMLCanvasElement;
}
```

Scroll handling: on a small origin change, `drawImage` the buffer onto itself to
shift it and mark only the newly exposed edge strip dirty. On a large jump —
click-to-centre, which is the common case — mark everything dirty. A full rebuild
is roughly 1,800 visible tiles, which is well under a frame; do the simple thing
first and only add the blit-shift if a profile asks for it.

Wrap-around: the world wraps, so a tile's buffer position is

```ts
const bufferX = ((tile.x - origin.x + width) % width) * tileSize;
```

with the same for `y`. The current `Portal.render` handles wrapping by tiling the
whole world canvas at multiple offsets; that loop disappears.

## Step 4 — the composite

```ts
// MapController
render(): void {
  const context = this.#canvas.getContext('2d')!;

  this.#static.update(this.#snapshots);

  context.fillStyle = '#000';
  context.fillRect(0, 0, this.#canvas.width, this.#canvas.height);
  context.drawImage(this.#static.canvas(), -this.#marginX, -this.#marginY);

  // Sparse: only tiles that actually carry something.
  this.#dynamicPainters.forEach((painter) => {
    if (!painter.isVisible()) {
      return;
    }

    this.#visibleTilesWith(painter.predicate).forEach((tile) =>
      painter.renderTile(context, tile, ...this.#offsetOf(tile))
    );
  });
}
```

`predicate` lets each dynamic painter declare what it needs — `Units` wants
`tile.unitIds.length > 0`, `Cities` wants `tile.cityId !== null` — so the
composite iterates a handful of tiles rather than all of them.

`Portal`'s public surface (`setCenter`, `isVisible`, `visibleRange`,
`tileFromOffsets`, the `focus-changed` and `activate-unit` events) stays
unchanged. `GamePortal`'s pointer handling is untouched.

## Step 5 — the blink tick

`IntervalHandler` fires every 500 ms and runs a full `portal.render()` just to
toggle the active-unit marker.

After step 4 a full composite is one `drawImage` plus a few dozen sprite draws,
so re-compositing on the tick is already cheap. **Measure that first.** Only if
it still shows up, restrict the tick to the active unit's tile rectangle:

```ts
const { x, y } = activeUnit.tile,
  [bufferX, bufferY] = this.#offsetOf(activeUnit.tile);

context.drawImage(
  this.#static.canvas(),
  bufferX, bufferY, tileSize, tileSize,
  bufferX - marginX, bufferY - marginY, tileSize, tileSize
);
// then redraw the dynamic painters for that one tile
```

Prefer the measurement to the optimisation; a partial redraw is a source of
tearing bugs and is only worth it if the numbers say so.

## Step 6 — the city window map

`components/City.ts` `renderMap` already builds a local 7×7 coordinate space so
its layers are city-sized rather than world-sized (fixed 2026-07-01, ~160 MB per
open down to ~200 KB). Port it to `StaticBuffer` with a 7×7 viewport so it stops
carrying a second copy of the layer machinery, but **do not change its coordinate
remapping** — that logic is correct and load-bearing for the coast and fog
neighbour lookups at the city edge.

## Step 7 — clean up the hot path

`memory-growth-analysis-2026-07.md` §C5 lists per-draw allocations that are now
worth fixing, because after step 4 they are a larger share of what is left:

- `getPreloadedImage` clones the image on every call
  (`src/js/UI/lib/getPreloadedImage.ts:48`). Most callers only `drawImage` it.
  Return the cached image; add `getPreloadedImageClone` for the callers that
  actually mutate.
- `replaceColours` clones the cached canvas on every hit. `renderUnit` draws
  text onto it — have `renderUnit` composite onto a reusable scratch canvas
  instead, and return the cache entry directly.
- `Map/Land.ts` allocates a new 16×16 canvas per coast tile per render. Hoist one
  module-level scratch canvas and clear it per use; coast rendering is
  single-threaded and synchronous, so one is enough.

## Measurements

| Metric | Phase 0 baseline | After Phase 5 | Target |
| ------ | ---------------- | ------------- | ------ |
| `canvasCount` | | | under 6 |
| Canvas backing store (80×50, scale 2) | ~200 MB | | under 30 MB |
| Canvas backing store (160×100, scale 2) | ~800 MB | | under 30 MB, flat |
| `portal.render` mean ms | | | lower |
| Blink tick cost per fire | | | under 2 ms |
| `usedJSHeapSize` at turn 150 | | | materially lower |

The second row is the point: canvas memory becomes independent of world size,
which is what makes large maps viable at all.

## Visual regression checklist

No assertion catches these. Check each by eye, at both `scale 1` and `scale 2`,
against a build from before the phase.

- [ ] Coast tiles: the sprite bitmask is correct on all eight neighbour
      configurations, including at the map edge where wrapping applies.
- [ ] River mouths render on coast tiles adjacent to rivers.
- [ ] Terrain transitions look right after a tile changes (the neighbour
      redraw).
- [ ] Irrigation, mines, roads and railroads render, including road connections
      across the wrap seam.
- [ ] Fog: explored-but-not-visible versus unexplored are distinguishable.
- [ ] Unit stacks: the offset "more than one unit" sprite is present.
- [ ] The active unit blinks and the rest of the map does not flicker.
- [ ] City sprites and city names, including names at the bottom edge (there was
      a specific fix for this — see the `4607766` commit message).
- [ ] Goody huts render.
- [ ] The yields overlay toggles with `y` and is correctly positioned.
- [ ] `t` toggles units, cities and city names together.
- [ ] Scrolling the wrap seam shows no gap or duplicate column.
- [ ] The minimap matches the main map and its viewport rectangle is right.
- [ ] The city window's local map is unchanged.
- [ ] Window resize re-sizes the buffer without artefacts.

## Definition of done

- [ ] `StaticBuffer` and `TilePainter` exist; every layer is a painter.
- [ ] `Map.ts`'s world-sized `setCanvasSize` is deleted.
- [ ] `canvasCount` is under 6 in the debug export.
- [ ] Canvas memory is flat across world sizes — verify on a 160×100 world.
- [ ] Step 7's three allocation fixes are in.
- [ ] The whole visual checklist passes at both scales.
- [ ] The measurement table is filled in.

## Notes for the executor

- **Do not rewrite the `renderTile` bodies.** Change their signature, move them,
  and leave the drawing logic alone. The coast bitmask especially: it comes from
  a specific CivFanatics derivation, it is cited in a comment, and it is correct.
- Build `StaticBuffer` against a fixture in a test page before wiring it into the
  game. Rendering bugs are much easier to see with a fixed world than with a live
  one.
- The `scale` and `tileSize` values are hardcoded in `Renderer.ts` with TODOs
  saying they should be user-controllable and theme-supplied. This phase is the
  natural place to thread them through as parameters, but **do not add the
  options UI here** — thread the values, leave the UI for later.
