- [x] First image load has an `image.width` of 0, breaking (#8):
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
- [x] In the `CityScreen` `Window` the worked `Tile`s cannot be manually selected.
      Fixed in 0523e71 (#9): click a tile on the city map to work it.
- [x] In the main window, pressing `F5` should show the `Trade Report` but it also triggers a page reload.
      Fixed in 754df11 (#10): the reload prompt only claims `F5` before a game starts.
- [x] Hide (or at least my disabled) the `EndTurn` `Action` button once pressed.
      Fixed in 9dc07f9 (#11): the button disables itself once pressed.
- [x] Add map scaling factors to the options, and an option to lock the map so the
      top edge stays >= 0 and the bottom edge <= the map height (#13).
      Fixed in f781358 (scale 1× to 4×, and "Stop the map at the poles") and
      2b6817b. The options are still in memory only: they are not kept between
      page loads.
- [x] Check the image slice for the `Cruiser` `Unit`.
      Fixed in e6a7d7f (#12): the second row of unit sprites is cut at 15×15, and
      `npm run test:asset-slices` (5824f33) checks every unit sprite. Assets
      imported before the fix need importing again with Replace existing ticked.
- [x] Maybe add a draggable map (with inertia) instead of click to centre.
      Done in 276fdc0 (#14); 7edc32f stops a second finger interrupting a drag.
- [x] Add random to `Civilization` selection, and a turns count to the science
      selection window (#15). Done in 42852c2.
- [x] Pressing `W` to make a unit wait, doesn't work properly.
      Fixed in 754df11 (#10): `W` sends the unit to the back of the queue.
- [x] Map re-centering should occur more liberally, currently `Unit`s on the very edge of the viewport, whilst still visible, can be hard to see.
      Done in 276fdc0 (#14): a unit selected near the edge is brought back to
      the middle, and how near counts is a setting under Options.

## Rendering performance (map layers)

Late game the backend flushes patches many times per turn, so the map/actions
redraw repeatedly. Coalescing the whole `handler()` to one run per frame was
tried and reverted (it left `activeUnit` stale for ~1 frame and broke
consecutive moves of multi-move units). See `memory-growth-analysis-2026-07.md`
sections B2/C5.

- [x] Split `Renderer.handler()` into a synchronous `updateState()` (reconstitution +
      input-critical state: `data`, `world` tiles, `activeUnit`/`activeUnits`/`lastUnit`)
      and a `requestAnimationFrame`-coalesced `render()` (both `Actions` panels,
      detail panels, `dataupdated` dispatch, `portal.build`/`render`, `minimap`).
      Verify: multi-move units can move consecutively; reports open current;
      `autoEndOfTurn` still advances; map recenters on active unit.
      Done in cc4a87d, the same commit that added this item: `updateState()`
      runs on every patch and `render()` at most once a frame. Since then,
      while waiting for the other civilizations `updateState()` itself runs at
      most once a frame too (b00c490, #61), a unit move arrives as one patch
      rather than two (1e8fd07, #321), and `updateState()` rebuilds only the
      objects a patch changed, with `IncrementalReconstituter` (e70f65a, #322;
      f5633a0, #327).
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
- [x] Drop the full-world `unitsMap.render()` in `renderActiveUnit` (#47). Note
      the `update([lastUnit.tile, unit.tile])` that followed it could not
      replace it: `applyActiveUnit` has already pointed `lastUnit` at the
      incoming unit, so it passed the same tile twice. The vacated tile is now
      collected in `applyActiveUnit` instead.
- [x] `CityNames.update()` ignores its tiles, clears the whole layer canvas and
      rescans `world().tiles()` on every patch (#48). It tracks where each
      label was drawn now, and clears only the boxes an update invalidated.
      Fixed the labels being clipped at the map edges with it (#49): the
      overhang is drawn again offset by the canvas size, since the portal tiles
      it. No layer performs a full-canvas clear any more.
- [x] Merge the static map layers into a single `Landscape` canvas (B2, #7).
      Done in b13eab8.
      Feature and GoodyHuts went in alongside the four the issue named: they sit
      in the same contiguous block of the stack and nothing toggles any of the
      six independently, so it is six world canvases down to one. Fixed the
      missing `beginPath()` in the isolated-road fill with it, which made every
      `fill()` re-fill every isolated road drawn so far.
- [x] Composite only the wrap offsets that land on the portal canvas, and only
      the part of each that lands on it (#7). `Portal.render()` drew every
      layer at every wrap offset, including offsets entirely off screen, as a
      full-layer blit. Measured on an 80×60 world at scale 2 in a 1712×873
      portal: 60.5 `drawImage` calls and 297 megapixels of source per render
      before, 15.0 calls and 7.5 megapixels after.
- [x] Give the minimap its own `Overview` layer at minimap scale instead of
      downscaling three world canvases (#53). Done in 7e1f687. Each
      `Minimap.update()` threw 14.7 megapixels (3 × 2560×1920) into a 190×142
      target, on every patch and every recentre — 383.4 megapixels over 15s of
      stress play against the portal's 310.9, so the minimap was the larger
      consumer of the two. Now 0.79 megapixels over the same window, and one
      blit an update rather than three. It draws terrain as one flat colour per
      type (land/ocean as the fallback for registry terrains the table does not
      know), cities in the owner's colour, the active unit as a flashing white
      tile, and nothing at all for unexplored. Rendered at a whole number of
      pixels a tile and upscaled by CSS, so it is no longer a fractional
      downscale of sprite art. Note it deliberately ignores the layers'
      `isVisible()`: hiding yields or units is a view mode for the map, not for
      an overview.
- [x] Fix the minimap click landing two tiles up and left of the tile clicked
      (#54): `event.offsetX` is already canvas-relative but the handler also
      subtracted `offsetLeft`, and `Math.ceil` should have been `Math.floor`.
      Fixed alongside #53, whose flashing marker exists to be clicked.
- [x] Viewport-sized main-portal layer buffers with dirty-rect rendering instead
      of full-world canvases (B2, rewrite track, #7). Done in 4880639. A layer's
      canvas is the size of the portal now and `#originX`/`#originY` say which
      world pixel sits at its top left, so a bigger world costs nothing extra.
      Measured on an 80×60 world at scale 2 in a 1712×873 portal: 7 × 2560×1920
      = 137.4 MB of layer canvas before, 7 × 1712×873 = 40.0 MB after.
      A tile no longer has one fixed place on the canvas and the world wraps, so
      it can have several places or none: layers are handed the places to draw
      in (`drawTile(tile, offsetX, offsetY)`) rather than working them out from
      the tile's co-ordinates, and `Portal` no longer composites wrap offsets at
      all. Moving the window blits the overlap across and draws only the strips
      it uncovers.
      Layers record what they changed, and `Portal.render()` composites those
      regions rather than the whole canvas — which is what restricting the blink
      tick to the active unit's region needed, since `ActiveUnit` is the topmost
      layer and un-drawing it means restoring the pixels beneath. A blink
      composite is 0.006 megapixels and 5.5 `drawImage` calls against 10.5 and 7
      for a full one. Regions are unioned until none overlap, because
      compositing a pixel twice doubles up anything drawn with alpha, and past
      half the canvas or eight regions it composites the lot instead.
      Verified in the browser: after panning, city windows, overlay toggles and
      blinks, the incrementally composited portal is pixel-identical to a full
      composite (0 of 1,494,576 pixels differ), and a viewport reached by short
      scrolling hops is pixel-identical to the same viewport drawn from nothing.
      Fixed with it: the resize handler assigned `mapPortal.width`/`height`
      unconditionally, which clears a canvas even when the value has not
      changed, so a resize that resized nothing wiped the map and — now that the
      portal composites only what changed — put nothing back.

Still open (2026-10-08), tracked in GitHub rather than here:

- #320: late-game responsiveness for the human player (the tracking issue for
  #321–#328, most of which are closed).
- #326: show a unit move straight away, and keep keypresses typed during the lag.
- #333: loading a game rebuilds the initial game data twice on the main thread.
- #151: turn handover refinements (batch notifications, coalesce AI moves,
  buffer input typed while waiting).
