- [ ] First image load has an `image.width` of 0, breaking (#8):
```
Uncaught IndexSizeError: Failed to execute 'getImageData' on 'CanvasRenderingContext2D': The source width is 0.
    at replaceColours (replaceColours.ts:39:29)
    at renderUnit (renderUnit.ts:16:18)
    at jr.build (Unit.ts:21:24)
    at new Unit (Unit.ts:17:10)
    at renderBuild (City.ts:226:13)
    at cityDetails (City.ts:368:9)
    at City.ts:438:11
    at HTMLDocument.<anonymous> (DataObserver.ts:47:7)
    at handler (Renderer.ts:1024:24)
    at Renderer.ts:1292:17
```

- [x] When a `City` is captured from the `HumanPlayer` the `PopupWindow` has translation labels visible.
- [x] There's a `Wonder` that has no label when displayed in the `CityBuild` `Window`. (`JsBachsCathedral`, probably a quoting problem)
- [x] When a `City` is destroyed, its `WorkedTile`s aren't cleared.
- [ ] In the `CityScreen` `Window` the worked `Tile`s cannot be manually selected.
- [ ] In the main window, pressing `F5` should show the `Trade Report` but it also triggers a page reload.
- [ ] Hide (or at least my disabled) the `EndTurn` `Action` button once pressed.
- [ ] Add map scaling factors to the options, and an option to lock the map so the
      top edge stays >= 0 and the bottom edge <= the map height (#13).
- [ ] Check the image slice for the `Cruiser` `Unit`.
- [ ] Maybe add a draggable map (with inertia) instead of click to centre.
- [ ] Add random to `Civilization` selection, and a turns count to the science
      selection window (#15).
- [ ] Pressing `W` to make a unit wait, doesn't work properly.
- [ ] Map re-centering should occur more liberally, currently `Unit`s on the very edge of the viewport, whilst still visible, can be hard to see.

## Rendering performance (map layers)

Late game the backend flushes patches many times per turn, so the map/actions
redraw repeatedly. Coalescing the whole `handler()` to one run per frame was
tried and reverted (it left `activeUnit` stale for ~1 frame and broke
consecutive moves of multi-move units). See `memory-growth-analysis-2026-07.md`
sections B2/C5.

- [ ] Split `Renderer.handler()` into a synchronous `updateState()` (reconstitution +
      input-critical state: `data`, `world` tiles, `activeUnit`/`activeUnits`/`lastUnit`)
      and a `requestAnimationFrame`-coalesced `render()` (both `Actions` panels,
      detail panels, `dataupdated` dispatch, `portal.build`/`render`, `minimap`).
      Verify: multi-move units can move consecutively; reports open current;
      `autoEndOfTurn` still advances; map recenters on active unit.
- [x] Return cached images/canvases directly in the render hot path instead of
      cloning per call (`getPreloadedImage`, `replaceColours`, `renderUnit`,
      `Map/Land` per-coast-tile canvas; C5, #6). Fixed the zero-width
      `getImageData` crash (#8) with it, and the same root cause in
      `AssetStore.getImage`/`scaleImage`, which cached a 0x0 canvas for any
      scaled asset measured before it loaded — the torch cursor had never
      worked. The caches now hand out shared entries, so callers must treat
      them as immutable and composite onto their own canvas to draw on top.
- [x] Skip the 500 ms blink tick's `portal.render()` when there is no active unit,
      and stop `ActiveUnit.render()` clearing the whole world canvas to draw one
      tile (#45). Note the tick never re-rendered that layer, it only flipped
      `isVisible()`, so the full-canvas clear was per activate/move rather than
      twice a second.
- [ ] Drop the full-world `unitsMap.render()` in `renderActiveUnit` in favour of
      the two-tile `update` that follows it (#47) — 1,207 per-tile clears plus a
      full-canvas clear on every unit selection and move, and a bigger win than
      the blink tick was.
- [ ] Merge the static map layers (Land / Terrain / Irrigation / Improvements)
      into a single canvas (B2, #7).
- [ ] Viewport-sized main-portal layer buffers with dirty-rect rendering instead
      of full-world canvases (~16 MB each at 80×50 scale 2; B2, rewrite track,
      #7). Restricting the blink tick to the active unit's region needs this:
      `ActiveUnit` is the topmost layer, so un-drawing it means restoring the
      pixels beneath, i.e. a partial portal composite — it is not the cheap
      standalone win it was previously filed as.
