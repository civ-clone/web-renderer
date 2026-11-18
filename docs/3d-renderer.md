# A 3D map (WebGL): specification

Agreed 2026-11-18: each decision in §1 says what was decided. The plan of work is
[3d-renderer-plan.md](3d-renderer-plan.md).

This is a second way to draw the map: a lit, rotatable 3D world in WebGL. It sits beside the 2D map, which stays as
it is. It draws the same game from the same data. The windows, the sidebar, the city screen and the minimap stay
HTML and 2D.

Each claim about the code is marked:

- **[verified]:** checked against `origin/main` at ca27c7bc on 2026-11-18, and again at 9fe998bb (after #1170) for
  §2.1 and D9.
- **[recall]:** from memory, not yet checked. Anything about a third-party library or art licence is [recall] until the
  plan's survey slice checks it.

---

## 1. Decisions

Each decision gives the options, a recommendation, and what was decided. The rest of this document and the plan follow
what was decided.

### D1. Which library

- **(a) three.js** (MIT, 0.187.0 on npm today [verified]). It has a WebGL2 renderer, instanced meshes, a glTF loader,
  skeletal animation (`AnimationMixer`), shadow maps, physically based materials and a post-processing stack [recall].
  It is the most widely used of the three options, so most examples and tools target it.
- **(b) Babylon.js** (Apache-2.0, 9.37.1 [verified]). It does the same as three.js and more out of the box, such as an
  inspector and a physics plugin. It is heavier, and more of an engine than a library.
- **(c) Raw WebGL2.** Nothing to depend on, but months of work before the first lit, animated model.

**Recommendation: (a).** Its scope fits what this needs: a scene graph and materials, with the game's own logic
around them. The renderer's own code stays testable without a GPU (§12), because three.js's maths and geometry run in
Node.

**Decided (2026-11-18): (a) three.js, on its impact.**

- **The question:** either library would do; the deciding factor is whichever has the lower impact, and Babylon's
  bundle size matters only if most of it would go unused.
- **The measurement** [verified, 2026-11-18]: the same minimal scene, bundled by the project's esbuild and minified.
  It has PBR materials, cascaded shadows, a custom terrain shader with a texture array, instancing, glTF with KTX2
  and skeletal animation, picking, and post-processing with ambient occlusion.
- **Results:**
  - three.js 0.187.0: 759 KB, 199 KB gzipped.
  - Babylon.js 9.37.1: 4.18 MB, 969 KB gzipped.
- **Where Babylon's size goes:** its WebGPU shaders, its glTF loader and FlowGraph, which deep imports don't shed.
- **For scale:** today's whole `frontend.js` is 1.0 MB minified, 296 KB gzipped [verified, 2026-11-18].

### D2. What "realistic" means

Realistic here means **lit like the real world**, not photographs. The aim is a modern strategy game's map, as in
Civ5 or Civ6, with the land and the water carrying most of the effect:

- **Light:** physically based materials, a sun with soft shadows, sky light and tone mapping.
- **Relief:** mountains, hills and valleys, with an exaggerated vertical scale so they read from above.
- **Depth:** woods, jungle and swamp built from many instanced plants. They are 3D cover, not textures.
- **Water:** depth tint, shorelines, waves and sky reflections.
- **Atmosphere:** aerial perspective and haze into the distance.

Models are life-like in proportion and material. They are scaled up against the land so that a unit reads at a
glance, as every strategy game does.

The target is 60 frames a second on a 2020 integrated GPU (for example, an M1 MacBook Air) at the Medium preset, with
an 80 × 50 Civ1 map. There is a Low preset for weaker machines (§9).

**Recommendation:** agree this definition. It decides the art budget (D3).

**Decided (2026-11-18):** realistic means **not cartoon-like**: realistic units, cities and land, natural rather
than bright and fun. So:

- the palette is natural and muted;
- materials are physically based;
- proportions are real.

Stylised low-poly packs, however well made, don't fit, and the licence survey (D3) leaves them out.

### D3. Where the models come from

The land, water, vegetation and buildings can be built by code, as the pixel art's sprites are. Units and Wonders are
the hard part.

- **(a) Built by code (procedural):** parametric buildings, plants, rocks, ships and vehicles, with simple rigged
  figures for people. Ships with the game, needs no downloads and has no licence questions. People and animals made by
  code look plain.
- **(b) Royalty-free model packs (CC0 or CC BY), as glTF.** Kenney and Quaternius publish CC0 packs of rigged,
  animated low-poly people, buildings and vehicles [recall]. Poly Haven and ambientCG publish CC0 textures and plants
  [recall]. Low-poly packs look stylised, not realistic, under realistic light. The licence of every file has to be
  checked, as it was for the hex art.
- **(c) Commissioned or self-made models,** for example from Blender scripts kept in a repository of their own, like
  `civ1-tileset-pixelart`. This is the most realistic option, but also the slowest.

**Recommendation:**

- Ship (a) first, as the built-in set, so every name always has a model.
- Run a licence survey for (b) before the units slice. Any pack that passes becomes a hosted set in the library (§10).
- (c) can replace models one at a time later, because every model is looked up by name.

**Decided (2026-11-18):**

- **Made by code:** cities and their sprawl (§7), and probably the land (§4).
- **Units and Wonders:** from CC0 or CC BY models, which supporting artists favours, because code-made figures would
  look artificial.
- **Credits:** every third-party asset in use is credited where everyone can see it: on its set's library entry, and
  in an art credits list in the game naming each model, its author, its licence and a link.
- **CivFanatics:** some of its community's modellers offer models free to use. That's another place to look. Each
  model needs a licence or permission in writing that allows hosting it on civ.one. "Free for mods" isn't enough
  alone.
- **Commissioned models** remain an option for later.

### D4. What "isometric" means in 3D

- **The grid is the topology.** A square world has a square lattice, an isometric world has a diamond lattice (the
  staggered-iso topology's), and a hexagonal world has a hex lattice.
- **The view is the camera.** Any grid can be seen from any angle.
- **The "isometric look"** is a camera preset: pitched at about 30°, and turned 45° on the square lattice so its
  squares show as diamonds.

**Recommendation:** agree. So "tile-agnostic" means one ground layout for each topology (§3), and the camera knows
nothing of grids.

**Decided (2026-11-18):** agreed. The point is that the land isn't built with hexes in mind: any topology has a
layout, and the 3D world lies seamlessly over each. That's how §3 and §4 are written: the mesh, the relief and the
surface never follow squares' edges, and only the layout knows the grid.

### D5. Stacks

Civ1 and Civ2 allow any number of units on a square.

- **(a)** Draw the top unit, the one the 2D map draws, with a count on its flag.
- **(b)** Draw every unit in the stack, spread over the square, up to a limit, then (a).

**Recommendation:** (b), with a limit of four. Units are placed from their position on the square (§6.2). (a)
remains for crowded squares, and for a Low preset.

**Decided (2026-11-18): (a).** A stack shows its defender on top: the unit with the best defence, as the 2D map
picks it [verified: `packages/map/components/Map/Units.ts`]. A flag carries the count. Spreading the stack over the
square stays possible later, because units are placed anywhere (§6.2).

### D6. A unit as one figure or a group

Civ5 draws a unit as a group of figures (a squad) and Civ1 as one figure. A unit can be one 3D object or a collection of
them.

**Recommendation:** a set chooses for each unit type: a `formation` with a count and a spacing (§6.1). The built-in
set uses three figures for foot units and one for vehicles, ships and aircraft.

**Decided (2026-11-18):** agreed.

### D7. Rotation

- **(a)** Free rotation.
- **(b)** Snap to the grid's directions: 90° on square, 60° on hex, 45° to show diamonds.

**Recommendation:** free rotation by default, with a "snap rotation" option. A key returns the view to north-up.

**Decided (2026-11-18): free rotation,** with no snapping option. A key still returns the view to north-up.

### D8. Cities beyond the classic area

In classic Civ-style games a city fits around its own square and the squares around it and that it works. In games with
borders, as in Civ5 and Civ6, it sprawls over its own territory as it grows.

**Recommendation:** the sprawl area (§7.2) comes from a list of squares the city may build on.

- Under classic rules, that list is the city's square, its neighbours and the squares it works.
- Under rules with territory, it's the squares the city owns, which the engine will send when such rules exist.

**Decided (2026-11-18):** agreed.

### D9. Era and Wonders for every city

The renderer knows no rules: it draws what the engine sends. To pick huts, houses or towers, it needs each city's era.
To place Wonders, it needs each city's Wonders. What it gets today:

- **Your own cities** are sent in full: size, squares, worked squares and buildings [verified: `City` in
  `packages/protocol/types.d.ts`].
- **A rival's city** is sent as a stand-in: name, square, owner, founder, size, disorder and, since #1170, `walled`.
  Under Civ2's rules it also has `style`, which holds the era [verified: `packages/worker-client/UnknownObjects/City.ts`].
- **The Wonders report** names each Wonder's city by name and civilization, with no id or square
  [verified: `WondersRow` in `packages/protocol/reports.ts`]. So it can't be matched to a city on the map reliably.
- **A player's age** (`base-science-age`) is sent for your own player, and a rival's only in the Intelligence report
  when you hold an embassy with it [verified: `packages/worker-client/Client/cheats.ts` notes rivals'
  `PlayerResearch` is never sent; `intelligence.ts` sends the age].

**Recommendation:** add an `appearance` to every city the page is sent, your own and stand-ins, built in the worker by
the rules:

```ts
appearance?: {
  // Which era's buildings it's drawn with, as a string the model set maps: 'ancient' … 'modern'.
  era: string;
  // Wonders standing in the city, by type name: Civ1 and Civ2 make these public.
  wonders: string[];
  // Buildings that show on the map, by type name (City Walls, a Harbour, a Factory's chimneys…), as far as the
  //  player can know them.
  landmarks: string[];
};
```

- Under Civ2, `era` is the style's era.
- Under Civ1, `era` comes from the owner's advances, by the same tiers the ages and research-cost sets use.

This is a rules question, so it's decided in the worker and the engine, not the renderer. A rival's `landmarks` are
what the rules make public: its walls, today (#1170). More can follow with rivals' Wonders (below).

**City walls came first,** because the 2D map had the same gap: Civ1's map drew no walls at all (#688), and Civ2's
drew them only on your own cities, and not where the Great Wall acts as walls (#1069). #1170 closed it (the plan's
prerequisite P1) with a `walled` flag on every city, the first piece of `appearance`.

**Decided (2026-11-18):**

- **A player's age** is sent as AdditionalData, for rivals as well as your own player. Each rule set decides it:
  - Civ1 by its advance tiers;
  - Civ2 by the eras its city styles already use.

  Complete Civ2 support probably needs this anyway. A city's `era` is its owner's age.
- **Rivals' Wonders** are a follow-up. At first, Wonders stand beside your own cities only. Your own Wonders are
  already known to the page, through the Wonders report's `own` rows and your cities' data.

---

## 2. Where it sits

### 2.1 A second map view

Before slice 0.1, the game made one `MapView` (`packages/game/MapView.ts`), which owns a `GamePortal` and its 2D
layers [verified]. The game used a small part of it:

- **`GameSession`:**
  - `queueTile`, `releaseTiles`, `world.setTiles`, `flush`, `centre`, `redrawArt`, `dispose`, `measureCovered`;
  - `portal.setWaiting`;
  - the layers and the minimap it passes to `ActiveUnitController` and to the debug panel (`#buildDebugPanel`).
- **`InputController`:** `centre`, `toggleUnits`, `toggleYields`, and the portal's `picking`, `endPicking` and
  `zoomBy`. It passes the portal on to the reports (F1–F8).
- **`ActiveUnitController`:**
  - the portal's `setActiveUnit`, `isVisible`, `setCenter` and `render`;
  - the units and active-unit layers' `setActiveUnit`, `update`, `setVisible` and `render`.
- **The portal, passed on:** the HUD (`Hud` takes `portal` and `world`), the unit panel, the city list, the game menu,
  the cheats and the city openers all hold the game's portal. Between them they call `openCity` and `setCenter`
  (`showCityOnMap.ts`, `CityStatus`, `UnitCard` and the reports, for example).
- **The city screen:** it stays 2D, but sizes its own map from the game portal's `zoom()` and `nativeTileSize()`
  (`cityParts.ts`).

That use is now two interfaces, which both views implement (slice 0.1). Both are in `packages/map`, so the 3D view's
package can implement them without depending on the game's:

- **`MapRenderer`** (`packages/map/MapRenderer.ts`): what `GameSession`, `InputController` and `ActiveUnitController`
  use. The layers' own calls are methods on it, so the game no longer reaches into layers the 3D view doesn't have:
  - **The portal:** `portal`, the view's `MapPortal`, which the game hands on to the rest.
  - **The tiles:** `queueTile`, `releaseTiles`, `tilesPending`, `flush` and `world` (its `setTiles`).
  - **The view:** `centre`, `redrawArt`, `measureCovered`, `dispose` and `mapEvent`.
  - **What's shown:** `toggleUnits` and `toggleYields`.
  - **The active unit:** `setActiveUnit(unit, pendingTile)` tells the map which unit is active, and `showActiveUnit`
    draws it.
  - **Orders:** `pickTile`, `picking` and `endPicking` choose a square for a long-range order, and `setWaiting` says
    the game is waiting for the next turn (the 2D map's tooltips stay shut meanwhile; the game, not the map, refuses
    orders).
  - **Zoom:** `zoomBy`, for the zoom keys.
  - **Debugging:** `debugViewModes`, what the `?debug=1` stress runner flips between.

  `pickTile` and the rest of `GamePortal`'s own are here rather than on `MapPortal`. That's because the 2D portal hands
  itself, a plain `Portal`, to the city openers, which have only `MapPortal`'s members.
- **`MapPortal`** (`packages/map/MapPortal.ts`): what everything else holds the portal for. `Portal` implements it.
  It's the part of `IPortal` others call, plus the two events they use, and its event methods take only those two:
  - **The HUD, reports and menus:** `openCity` and `setCenter`; `center` (the cheats); `playerId` and `transport`
    (the city openers).
  - **The active unit's controller:** `isVisible`, `setCenter` and `render`.
  - **The city screen:** `zoom`, `scale` and `nativeTileSize` to size its map, and the `activate-unit` event.
  - **Options:** `zoom`, `setZoom`, `lockVerticalEdges` and `setLockVerticalEdges`.
  - **The cheats:** the `tile-clicked` event.

  The 3D view implements all of it:
  - `setCenter` and `center` move and read the camera's focus.
  - For the city screen, `zoom`, `scale` and `nativeTileSize` answer as the 2D map art would, because the city screen
    still draws with that art.
  - `lockVerticalEdges` keeps the camera's focus off the poles.

  The rest of `IPortal` stays with `MapView2D` and its portal, and isn't part of `MapPortal`: the layers (`getLayer`,
  `getLayers`, `build`), the canvas and its geometry (`canvas`, `tileSize`, `setScale`, `scrollBy`, `setCovered`,
  `visibleBounds`, `visibleRange`) and `world`. The minimaps hold the 2D portal itself.

And:

- **`MapView2D`** (`packages/game/MapView2D.ts`) is the old class under a new name, with no change in what it does.
- **`MapView3D`** is the new view.
- **Choosing:** the game picks one when the game starts. To switch mid-game, the game is handed over to a new page
  that starts with the other view, as an art change that can't be made in place is (#1118, #1144). `redrawArt` itself
  retiles the portal in place, so there is no in-page rebuild to reuse.

### 2.2 What stays 2D

- **The city screen's map:** it builds a `Portal` of its own [verified: `packages/city/components/lib/cityParts.ts`].
- **The minimap and the overview:** these draw the world, not the view. Today the overview gets its tiles by riding
  in `GamePortal`'s layer list, which `portal.build()` feeds (`MapView2D.ts`), and the square grid's minimap reads the
  portal's `rawVisibleRange()` for its box [verified: `packages/map-square/Minimap.ts`]. The 3D view keeps a 2D
  overview of its own and feeds it the same tile updates. For the box, it gives the minimap the part of the ground the
  camera sees, which is a four-sided shape that turns with the camera, not a rectangle.
- **Windows, the HUD, tooltips:** all HTML, positioned from points the view projects to the screen.

### 2.3 Data in

The 3D view reads the same things the 2D view reads:

- the client's `World` of `PlayerTile`s (`packages/map/components/World.ts`);
- tile patches, through `queueTile` and `releaseTiles`;
- the player's id, the options and the transport.

It needs one new thing: **map events** (§8). Today a move reaches the page only as two tile patches, and a battle only
as a sound [verified: `unit:moved` in `packages/worker-client/Client/events/patchEvents.ts`; `battle` in
`packages/worker-client/Client/battleEvents.ts`]. Animating either needs to know which unit went where, and who fought
whom. The plan adds these first, as a prerequisite (P2).

### 2.4 Packages and loading

- **`packages/map-3d`:** the view, scene, camera, input, terrain, units, cities and Wonders. It depends on three.js.
- **`packages/map-3d/layouts`:** the ground layouts (§3). They are pure maths with no three.js import, so the city
  screen and tests can use them.
- **`packages/models-builtin`:** the built-in model set (D3a), made by code.

The build is one `dist/frontend.js`, loaded by a classic `<script>`, with no code splitting [verified: `esbuild.js`,
`index.html`]. Players who keep the 2D map shouldn't download three.js.

- So the 3D view is a **second entry**, `dist/map3d.js`, fetched the first time a game starts in 3D.
- It exports one factory, `createMapView3D(deps)`.
- Anything with state, such as the world, the transport, the options and the interface art, comes in through `deps`.
  Nothing with state is imported, so no registry or singleton is bundled twice.

As built in slice 0.2:

- **The factory's types** (`MapView3DDeps`, `CreateMapView3D`) are in `packages/map/MapView3DFactory.ts`. The game
  depends on them, not on `packages/map-3d`, so the main bundle has no reason to import three.js.
- **The script** is loaded by a `<script>` tag, versioned by the build as `releases.json` is. It puts its factory on
  `window.civMap3D` (`packages/game/lib/map3d.ts`).
- **When it's fetched:** a new game and a load both wait for the map's art before the worker is told to start
  (`provideStartPreparation`, `prepareSavedMapArt`). The script is fetched there too, so the game itself still starts
  all at once, on whichever map is ready.
- **The gate:** `?3d=1`, and WebGL2. The map is 2D, and a window says why, once, if any of these happen:
  - the browser has no WebGL2;
  - the script won't load within 30 seconds;
  - three.js can't make its renderer on the map's own canvas. Then the 2D map gets a fresh canvas.
- **Tests** (`tests/ui/map3d.ts`):
  - one bundles `map3d.js` and fails if it takes in anything from the other packages but the factory's name;
  - another fails if anything outside `packages/map-3d` imports three.js or that package.
- **Until later slices:** the minimap stays empty (1.5), and a long-range order's square can't be picked (1.3).
- **Sizes**, minified: `map3d.js` is 556 KB (140 KB gzipped), and `frontend.js` grew by 1.7 KB (0.8 KB gzipped).

---

## 3. Grids in 3D: ground layouts

The 2D `Projection` is pixel maths for a fixed view: sprite boxes, draw order, how far a sprite reaches past its box
[verified: `packages/map/lib/projection.ts`]. Under a camera that turns and tilts, none of that holds. The 3D view has
its own seam, one layout for each topology:

```ts
interface GroundLayout {
  // The topology this lays out ('square' | 'staggered-iso' | 'hex-odd-r').
  readonly topologyId: TopologyId;
  // The middle of a square on the ground, in world units, not wrapped.
  centre(x: number, y: number): [u: number, v: number];
  // Its corners, in order, around its middle.
  outline(x: number, y: number): readonly [number, number][];
  // The square a point on the ground is in, not wrapped: the caller wraps it, as World.get does.
  tileAt(u: number, v: number): [x: number, y: number];
  // How far apart the world's copies are: across always, down only on a world that wraps over the poles.
  period(): { u: number; v: number | null };
}
```

- **Units:** world units, with one unit about a square's width:
  - **Square:** squares of side 1.
  - **Isometric:** the staggered-iso lattice laid flat, diamonds of side 1, so each square has the same area as on the
    square grid.
  - **Hexagonal (pointy-top, odd rows shifted):** hexes 1 across their flats.
- **Neighbours** come from the topology the client already builds (`topologyFor`) [verified], not from the layout.
- **Height is not part of the layout.** The terrain (§4) gives it, for any point.
- **Proof:**
  - every square's middle gives back that square;
  - its outline matches the 2D projection's outline once foreshortened;
  - neighbours share edges, as the topology says;
  - one period along, the copy of a square lands on the same point.
- **As built (slice 0.3):** `packages/map-3d/layouts`, picked by `groundLayoutFor(world)`. A world's `wrapsY` comes from
  its topology, so a layout's period down is `null` only where the topology doesn't wrap over the poles (the engine
  wraps every grid today). The isometric grid's diamonds are squares of side 1 turned through 45°, √2 apart across
  and √2/2 down; the hexes are regular, `1/√3` from middle to corner, their rows `√3/2` apart.

### 3.1 Wrapping under a turning camera

- The world repeats every `period().u` across, and every `period().v` down when it wraps over the poles.
- The terrain is built in chunks of 16 × 16 squares. Each frame, every chunk is drawn at whichever copies of it meet
  the part of the ground the camera sees. On a small world, seen at a low angle, that can be more than one copy.
- Units, cities, effects and labels are drawn at every visible copy too, so a view across the seam that shows a
  square twice shows what's on it twice. Picking (§9.2) and tooltips answer for whichever copy is under the pointer.
- **Edges:** an edge that doesn't wrap ends in deep ocean, faded into haze. The camera's focus point can't leave the
  world.
- **How far the camera sees:** capped by a far distance with haze, so a low view doesn't draw the whole world over and
  over.

---

## 4. Terrain

### 4.1 Relief

Height is one continuous function over the ground, `height(u, v)`. It is built from each square's terrain and then
blended across squares.

- **Each terrain has a relief profile** in the model set's terrain table:
  - a base height;
  - a roughness (how much noise rides on it);
  - a shape (`flat`, `rolling`, `ridged` or `peaked`).

  Typical values, in world units: ocean −0.15, rising to −0.03 at the shore; plains 0.02; hills 0.12, ridged;
  mountains 0.35, ridged and peaked.
- **Blending:**
  - A point takes its square and that square's neighbours (from the topology), each weighted by a smooth kernel of its
    distance from the square's middle (Wendland C2, radius 1.2 squares).
  - Mountains' peaks are weighted by the square of their weight, so a peak stays inside its own square and doesn't
    spill into the plain beside it.
  - So the land has no seams along square edges, on any grid.
- **Noise** is periodic over the world's period (lattice-periodic, as the hex art's is [verified: the hex pack's
  `src/hex.js`, `civ1-tileset-pixelart`]), so the seam where the world wraps has no seam either.
- **Sea depth** follows how far a square is from land, found by walking the squares (a breadth-first search).
- **Squares never seen** (terrain `Unknown`, as the client gets them [verified: `packages/map/components/Map/Fog.ts`])
  are flat, at sea level, under cloud (§4.5). The client is never sent an unseen square's terrain, so the relief can't
  give it away.
- **Deterministic:** the same squares always give the same land. Every random choice is seeded from the square's
  co-ordinates.

- **As built (slice 1.1):** `packages/map-3d/terrain/relief.ts`, with the table in `packages/models-builtin/terrain.ts`.
  - A point takes every square whose middle is within the kernel's radius, chosen by distance rather than from the
    topology's neighbours: on the hex grid a hex from the next ring out reaches a corner, and a neighbour list would
    leave a step there.
  - A peak keeps 65% of its height out of the blend, weighted by the square of its weight. The rest is blended.
  - The sea's floor is −0.03 beside land, falling to −0.15 three squares out. The walk goes no further.
  - The noise is gradient noise (Perlin's): value noise showed its lattice as lines across the sea.

### 4.2 The mesh

- **Chunks:** each chunk is a regular grid of points on the ground, about 8 per square across, with a height and a
  normal at each.
- **Level of detail:** distant chunks use 4 or 2 points per square, with skirts to hide the cracks between levels.
- **Grids:** the mesh doesn't follow squares' edges, so one builder serves every grid.
- **Updates:** a tile patch rebuilds only the chunks within one square of it. A change that leaves the relief alone
  (a road, say) touches only the chunk's colours.
- **As built (slice 1.1):** `packages/map-3d/terrain/chunks.ts` and `packages/map-3d/Land.ts`.
  - Chunks are about 16 squares across, as many as divide the world's period exactly, so each point is placed by its
    index on the whole ground and chunks meet without a seam.
  - Normals come from the height function either side of a point, not from a chunk's triangles, so the light has no
    seam along chunks' borders either.
  - A tile patch rebuilds only round the squares whose terrain it changed: every chunk within the kernel's reach of
    them, and of the sea within two squares, whose floor moves with them. Most patches (a unit moving, a city growing)
    change no terrain and rebuild nothing. The chunks waiting are built nearest the map's centre first, and put in
    order again when it moves. Water is the engine's (`tile.isWater`), not a terrain's name. There's no colour-only
    update yet, and no level of detail.
  - Each chunk is drawn once for each copy of the world (§3.1): nine copies when the world wraps both ways.

### 4.3 Surface

- **Blending:** the terrain shader blends materials by weights set at each point, from the squares around it. The
  weights use the same kernel as the relief, broken up by noise so the boundaries look natural and not square.
- **Materials:** each material is a texture set (colour, normal, roughness), kept in a texture array. Slope and height
  add their own:
  - bare rock on steep slopes, mapped from three sides (triplanar) so it doesn't stretch;
  - snow above a height;
  - wet sand at the waterline.
- **The built-in set** uses textures made by code. A hosted set can bring CC0 photographic textures (D3).

### 4.4 Water

- **One sea surface** at height 0, coloured by the depth below it: clear at the shore, deep blue in the ocean.
- **Effects:**
  - foam where the water meets the land;
  - waves, from moving normal maps;
  - sky reflections that grow stronger at a low angle (Fresnel).
- **Lakes and swamp pools** use the same surface, at the height of their own dip.
- **Rivers** are covered in §5.3.

### 4.5 What the player hasn't seen

- **Unseen squares** are covered by a cloud layer (a soft volume drawn in the shader) that thins over a short edge. A
  square becoming seen clears its cloud over half a second, or at once under reduced motion.
- **Squares seen before but not in sight now** are drawn as last seen, with the colour and light dimmed. This is only
  under rules that tell the two apart, the same as the 2D map.

### 4.6 The grid

- **Grid lines,** an option (off by default): lines along each square's outline, laid on the land, drawn from the
  layout.
- **The square under the pointer** gets a soft highlight in its outline. The squares a city works get one too, while
  the city's map is shown.

---

## 5. On the land: vegetation, rivers, improvements

### 5.1 Vegetation and ground cover

The model set's scatter table says what grows on each terrain:

- **forest:** a canopy of trees, conifer or broadleaf by latitude;
- **jungle:** a dense canopy, with undergrowth;
- **swamp:** pools, reeds and dead trees;
- **grassland:** tufts and the odd bush;
- **plains:** sparse shrubs;
- **tundra:** low scrub and snow patches;
- **desert:** dunes in the relief, and rocks;
- **arctic and glacier:** ice;
- **hills:** rock and shrub;
- **mountains:** bare rock and snow, mostly from the relief and the surface.

For each kind it gives the models, a density, a size range and the slopes it allows.

How plants are placed:

- **Spacing:** points spread inside the square's outline (Poisson-disc) from the square's seed.
- **What they avoid:** roads, city lots, Wonders and improvements, so those clear their ground.
- **Drawing:** one instanced draw per model per chunk.
- **Level of detail:** full models nearby, flat cards (impostors) further out, then nothing.
- **Wind:** a gentle sway, which reduced motion turns off.

### 5.2 Specials and huts

- **Specials:** a special (Fish, Coal, Wheat…) gets a small model on its square. It's looked up as `Terrain:Special`,
  the same key the tilesets use [verified: `names.special` in `packages/tileset-civ2/civ2.json`].
- **Huts:** a hut is a small village.

### 5.3 Rivers

- **Where they come from:** a river terrain (Civ1's `River`) or a river on the square (Civ2's).
- **Course:** a spline runs from each river square to each edge-neighbour with a river, and to the sea. Edge-neighbours
  come from the topology, so a river follows square edges on the square grid and hex sides on the hex grid.
- **On the land:** the spline cuts a channel into the relief, and carries a water ribbon that flows downhill.

### 5.4 Tile improvements

Each is looked up by its type name in the model set.

- **Road:** a strip laid on the land, from the square's middle toward each neighbour that has a road. Only the
  connected directions are drawn, as the 2D map does.
- **Railroad:** the same, with sleepers and rails. Where a square has both, the railroad replaces the road.
- **Irrigation and Farmland:** fields laid over the square, with ditches running from water. Farmland is denser.
- **Mine:** a shaft head and spoil heaps on hills; a cut on mountains.
- **Fortress and Airbase:** a model on the square.
- **Pollution and fallout:** a dark smear laid over the land, and a slow haze rising from it.

---

## 6. Units

### 6.1 The model set's entry for a unit type

```json
"Phalanx": {
  "model": "infantry/hoplite",
  "formation": { "count": 3, "spacing": 0.12 },
  "scale": 1,
  "domain": "land",
  "clips": { "idle": "Idle", "move": "Walk", "attack": "Stab", "defend": "Block", "die": "Death", "fortify": "Brace", "work": "Dig" },
  "colourMask": true
}
```

- **`domain`:**
  - `land` stands on the ground;
  - `sea` floats at the sea's height and rocks with the waves;
  - `air` flies at a height and sways.
- **`colourMask`:** the owner's colours are painted into the model's masked parts (a tunic, a sail, a flag).
- **Missing clips** fall back to `idle`.
- **Missing models:** a unit type with no model uses the built-in set's model for its domain. If the built-in set has
  no model for the type either, a plain marker with its symbol stands in, so a unit is never missing from the map.

### 6.2 Where a unit stands

- **Anywhere:** a unit has a position anywhere on the ground, not a slot on a square. It's placed on the square's
  middle when standing still, and anywhere along its path when moving.
- **Stacks:** a stack shows its defender, the unit with the best defence, as the 2D map does (D5). The flag over it
  carries the count.
- **In a city:** a unit stands at the city's edge, on its own side (the side it came in from), not inside the
  buildings.
- **Facing:** a unit faces the way it last moved.
- **Height:** it stands on the land's height at its feet.
- **Squads:** a squad's figures spread around its position, each with a small fixed offset, so they don't line up like
  a parade.

### 6.3 What a unit shows

- **Owner:** a flag in the owner's colours on a short pole above the unit. It carries:
  - a veteran mark;
  - the number of units in its stack, when it has more than one;
  - hit points, under Civ2.
- **Fortified:** the `fortify` clip, standing behind a low wall.
- **Sentry, and orders:** a small symbol on the flag, from the interface art, as the 2D map does today.
- **Working (Settlers):** the `work` clip.
- **The active unit:** a ring laid on the land under it. It follows the unit marker option (ring, blink or both) and the
  theme's colours [verified: `UnitMarker` and the `--ui-unit-ring` tokens, `packages/game/MapView2D.ts`].
- **Hidden units:** `t` hides units and cities, as it does on the 2D map.

### 6.4 Animation

All of these are driven by map events (§8):

- **Move:**
  - the unit walks along its path to the next square;
  - the path is a curve over the land between the squares' middles, along the road where both squares have one;
  - ships sail, with a wake behind them;
  - aircraft fly an arc.
- **Attack:**
  - the attacker advances to the edge between the two squares and plays `attack`;
  - a ranged unit fires instead, with a shot or shell flying to the target;
  - the defender plays `defend`.
- **Rounds:** under rules with rounds (Civ2's hit points), the exchange plays out in beats. It doesn't play every round.
- **Defeat:** the loser plays `die` and then fades away. The winner returns to its square, or stays where the rules
  moved it.
- **Arriving or leaving with no move:** a unit that's built, bought, unloaded, disbanded or lost fades in or out.

---

## 7. Cities

### 7.1 What a city is drawn from

- **Your own:**
  - its square and size;
  - its squares and worked squares;
  - its buildings;
  - the owner's colours.
- **A rival's:** its square, size and owner. With D9, also its `appearance` (era and landmarks). Its Wonders are a
  follow-up (D9).
- **Both:** the land around the city: terrain, rivers, roads and improvements.

### 7.2 Sprawl

- **The area** is the squares the city may build on (D8):
  - under classic rules, its own square and its neighbours, and then the squares it works;
  - under rules with territory, its own squares.
- **Never built on:**
  - water, except a Harbour's docks;
  - steep slopes;
  - Wonder sites;
  - squares where an improvement's fields or mine take the ground.
- **Streets:**
  - the city's square holds a square or plaza;
  - main streets run from it toward each neighbouring square with a road, and toward the sea;
  - side streets fill in between, following the land.
- **Lots** line the streets. A lot holds one building.
- **How many lots are built** grows with the city's size:
  - dense at the middle, thinning outward;
  - reaching neighbouring squares at about size 4;
  - reaching worked squares further out at about size 10.
- **Deterministic:** everything is seeded from the city's id and square. The same city, at the same size and era, is
  always laid out the same.
- **Growing:**
  - A city that grows keeps its buildings and adds lots.
  - A city that shrinks loses the outermost.
  - A new era rebuilds lots a few at a time, each on a seeded turn, so a city modernises gradually rather than all at
    once.

### 7.3 Buildings

The building kit is an era's set of building models: `ancient`, `classical`, `medieval`, `renaissance`, `industrial`,
`modern`.

- **Ancient:** huts.
- **Medieval:** timber houses.
- **Industrial:** brick terraces and works.
- **Modern:** apartment blocks, with towers near the middle that grow taller with the city's size.

How the kit is made:

- **The built-in kit** makes buildings by code, from a footprint, a number of floors, a roof type and materials.
- **A model set** can replace any building, or the whole kit, for each era. It can also give a civilization a style of
  its own, as Civ2's art does [verified: `cities.styles` in `packages/tileset-civ2/civ2.json`].

Landmark buildings replace ordinary lots near the middle:

- **Your own cities:** each building the set has a model for takes a lot (a Temple, a Marketplace, a Library, a
  Factory with chimneys).
- **Rivals' cities:** only the landmarks the rules make public (D9): their walls, for now.
- **The palace:** a capital's palace takes the middle.
- **City Walls:** walls in a ring around the city's square, with gates where the roads leave.
- **A Harbour:** docks.

### 7.4 States

- **Civil disorder:** smoke and fires.
- **We Love the King Day:** banners.
- **Captured:** the city keeps its buildings and changes colours.
- **Destroyed:** the city is left as rubble for a few turns, as long as the client's tile still shows it, then it's
  gone.

### 7.5 Names

City banners are drawn by the 2D code that draws them today (`cityLabels`), on a transparent 2D canvas over the 3D
canvas.

- **Position:** each frame, a banner is placed at the city's projected point.
- **Overlap:** banners are sorted by depth, and overlapping ones stack, as they do now: the one on top answers the
  pointer (`CityBanners.ts`).
- **Hidden cities:** a banner whose city is hidden behind a mountain still shows, faded.

### 7.6 Wonders

A Wonder stands on one of its city's squares, near the city, as Civ5 places them.

- **Which Wonders:** your own cities' Wonders first. Rivals' Wonders follow (D9).
- **Its site:** the model set says what each Wonder needs:
  - `land`: any land square;
  - `coast`: a land square beside the sea (the Lighthouse);
  - `harbour`: across the water's edge (the Colossus, Magellan's);
  - `hill` or `river`: preferred, not required;
  - `line`: a run of squares (the Great Wall, below).
- **Choosing the square:**
  - from the city's area (§7.2): its own square excluded, then its neighbours, then further out;
  - never a square another Wonder holds, or one with a mine or fields;
  - suitable squares ranked by how well they fit, ties broken by a seed from the city and the Wonder.
- **Staying put:** a Wonder's square is chosen once and kept while the city stands. The city growing, its lots and its
  worked squares never move it. Only the square itself becoming unsuitable, such as the land turning to sea, chooses
  again.
- **The Great Wall:** a wall along the outer edge of the city's area, along hills where it can, a few squares long. Its
  gate faces the city.
- **Lost Wonders:** a Wonder lost with its city leaves ruins for as long as the square is seen.
- **Clearing the ground:** the Wonder's square has no lots and no scatter (§5.1).
- **Models:** from the model set (D3: CC0 or CC BY), with a plain made-by-code placeholder for each until one is
  found.

---

## 8. Map events and pacing

### 8.1 New events from the worker

Built in P2 (`packages/protocol/mapEvents.ts`, `packages/worker-client/Client/mapEvents.ts`):

```ts
// On the transport, beside `battle` (which stays, for the sound).
type MapEventUnit = { id: string; type: string; player: string; tile: { x: number; y: number } };

mapEvent:
  | { kind: 'moved'; unit: MapEventUnit; from: { x: number; y: number }; to: { x: number; y: number } }
  | { kind: 'battle'; attacker: MapEventUnit; defender: MapEventUnit; winner: 'attacker' | 'defender' };
```

- **Ids:** a unit and its player go as the page holds them, through the client's data filter. A rival's unit goes by
  the id of the stand-in the page has for it, and its player by its stand-in's, never by the engine's own ids.
- **Steps:** a `moved` is one step: a `Move` (capturing a city, embarking, disembarking and landing are `Move`s too) or
  a `SneakMove`, to another square, by a unit that's there at its end. The engine raises `unit:moved` after nearly
  every action, and the others took the unit nowhere. A step raised twice is sent once.
- **When:** as the engine raises `unit:moved` and `unit:defeated`, before that move's tile patches are flushed.
- **Who's told:** stricter than the patches, which go out when either square is known:
  - the player's own units' steps and battles, always;
  - anyone else's between two squares the player knows, one of them in sight of the player's units;
  - everything, to a watcher of the whole map.
- **Rounds:** a battle's rounds (Civ2's hit points) aren't sent yet. §6.4's beats can come when they are.
- **The 2D view:** it ignores them, and can use them later to slide units.

### 8.2 The two states: game and shown

- **Shown state:** the 3D view draws what's shown. The game's own state can be a little ahead of it.
- **Holding patches:** while an animation is queued for a unit, the patches for the squares it involves are held. This
  is the same idea as `#incomingTiles` in `MapView2D` [verified]. They apply when the animation ends.
- **Squares no animation involves** apply at once.
- **One queue:** events play in the order they came. Moves by different units that don't touch the same squares can
  play at the same time.
- **GoTo:** moves of the same unit, one after another, join into one walk.
- **Rivals' turns:**
  - only moves on screen play, at a faster speed;
  - moves off screen apply at once;
  - if the queue falls more than two seconds behind, it skips to the end.
- **Options:**
  - animation speed: off, fast or normal;
  - whether to show rivals' moves.
- **Reduced motion:** every move is instant; battles show as a flash and the result
  [verified: `packages/map/lib/reducedMotion.ts` exists].
- **The game waits** for the queue to empty before it asks you for the next unit, so the next unit isn't picked while
  the last one is still walking.

---

## 9. Seeing it: camera, light, quality

### 9.1 Camera

- **What it's made of:** an orbit camera around a focus point on the ground. Its yaw is free, its pitch runs from 25°
  to 80°, and it has a distance (zoom).
- **Presets:**
  - **Above:** pitch 80°, north up.
  - **Classic strategy:** pitch 55°. This is the default.
  - **Isometric:** pitch 30°, turned 45° on the square grid (D4).
- **Mouse:**
  - drag to pan, with the glide the 2D map has [verified: `INERTIA_*` in `packages/game/GamePortal.ts`];
  - middle-drag, or drag with Alt held, to turn and tilt: the right button stays the modern interface's unit menu
    (#808);
  - the wheel zooms, by the same steps and pauses the 2D map uses (#1101, #1139).
- **Touch:**
  - pinch to zoom;
  - twist with two fingers to turn;
  - drag with two fingers to tilt.
- **Keys:**
  - two keys turn the view, and one returns it to north-up;
  - the 2D map's keys keep working;
  - the keys aren't chosen yet: they must not clash with unit orders. The plan checks the key table.
- **Following:** centring on a unit glides the focus to it. It's instant under reduced motion.
- **The sidebar:** squares under the sidebar (`setCovered`) count as off screen, so the active unit is kept clear of it,
  as on the 2D map.

- **As built (slice 1.2):** `packages/map-3d/camera/orbit.ts`, and `CameraInput.ts` for the mouse, the wheel and touch. The distance runs from 5 to 90 world units,
  24 by default, and a step of zoom brings the camera 1.12 times nearer. The haze starts at 1.3 times the distance and
  hides everything by 5 times it. The keys are `[` and `]` to turn an eighth of a turn and `\` to face north: none is a
  unit's order or one the numeric keypad sends (`mappedKey`). Two fingers on a touch screen also tilt the view by
  moving up or down together. The distance is kept in the `map3dDistance` option.

### 9.2 Picking

- **A square:** a ray from the pointer meets what's shown there: the land, or the water's surface where the land is
  below it (the sea at height 0, a lake or swamp pool at its own). It's stepped against the height function, taken as
  no lower than the water, and refined. The point where it lands goes through `layout.tileAt`, then wraps.
- **A unit:** a ray that passes through a unit's bounding sphere picks the unit before the square.
- **A city:** a banner, or a city's lots, picks the city.
- **Uses:** clicks, long presses, hover tooltips and target picking (Paradrop, Airlift) all go through these, with the
  tooltip content the 2D map gives [verified: `HoverSubject` in `GamePortal.ts`].

### 9.3 Light and atmosphere

- **Sun:** one sun, high in the south-west of the default view, with cascaded shadow maps fitted to what the camera
  sees.
- **Sky:** a sky made by code, which lights the scene and gives reflections (an environment map).
- **Haze:** height fog and aerial perspective toward the horizon.
- **Tone:** ACES or AgX tone mapping, in sRGB. Antialiasing by MSAA, or by FXAA on Low.
- **Ambient occlusion:** screen-space, on High only.

### 9.4 Quality presets

| | Low | Medium | High |
|---|---|---|---|
| Render scale | 0.75 | 1 | 1 (device pixels up to 2) |
| Shadows | none | 2 cascades, 1024 | 3 cascades, 2048 |
| Vegetation | 25%, no wind | 60% | 100% |
| Terrain points per square | 4 | 8 | 8, finer up close |
| Post | FXAA | MSAA 4× | MSAA 4× + SSAO |

- **The first game** picks a preset from a short benchmark.
- **The option** stays the player's after that.

**Budget at Medium:** 300 draw calls, 2 million triangles and 512 MB of GPU memory, measured by a stats overlay in
debug mode.

---

## 10. Model sets in the library

A model set is a set in the #1063 library, like a tileset [verified: `docs/asset-library.md`], with its own `kind`:

```json
{
  "schema": 1,
  "kind": "models",
  "id": "example-cc0",
  "name": "An example hosted set",
  "source": "hosted",
  "licence": { "name": "CC0", "url": "…" },
  "grids": ["square", "staggered-iso", "hex-odd-r"],
  "terrain": { "Grassland": { "relief": { "base": 0.02, "roughness": 0.01, "shape": "rolling" }, "material": "grass", "scatter": [ … ] } },
  "names": { "unit": { … }, "improvement": { … }, "special": { … }, "wonder": { … }, "building": { … } },
  "models": { "infantry/hoplite": { "file": "models/hoplite.glb" } }
}
```

- **A model** is a file (`{ "file": … }`), or, in the built-in set alone, one made by code: `{ "generate": "foot-figure",
  "params": { … } }`, naming one of the built-in set's generators (a figure, a ship, a vehicle, an aircraft, a
  building, a Wonder's placeholder). The validator refuses `generate` in any other set.

- **Files:** glTF binary (`.glb`). Textures compressed with KTX2 (Basis), with mesh compression where it's worth it.
- **Hosted sets:** built into `dist/sets/<id>/`, hashed by content, fetched when a 3D game starts.
- **The built-in set** (MIT) holds only what's made by code: the land, the cities, and plain placeholders for units
  and Wonders (D3). Third-party models come as hosted sets of their own, each under its own licence, and are chosen
  over the built-in set's placeholders.
- **Lookups:**
  - names fall back from the chosen set to the built-in set, then to a marker;
  - the built-in set has an entry for every type Civ1 and Civ2 name;
  - a test checks this against the civilopedia's lists.
- **Licences:** each set's licence and attribution show on its library entry, as tilesets' do. A CC BY set also shows
  them wherever it's chosen.
- **Not in saves:** which set draws the map isn't kept in a save, the same as map art (#1063's decision).

---

## 11. Everything the 2D map shows today (parity)

The 3D view must show all of this before it stops being experimental:

| 2D today | In 3D |
|---|---|
| Terrain, coast, rivers, specials, huts | §4, §5 |
| Never-seen squares and the edge of what's been seen | §4.5 |
| Roads, railroads, irrigation, mines, fortresses, pollution | §5.4 |
| Units, stacks, statuses, the owner's colours | §6 |
| The active unit's marker and blink | §6.3 |
| Cities, sizes, disorder, the owner's colours | §7 |
| City names and banners, with their tooltips | §7.5, §9.2 |
| Yields (`y`) | icons from the interface art floating over each square, drawn on the overlay canvas |
| Hiding units and cities (`t`) | §6.3 |
| Target picking and long press | §9.2 |
| The unit menu on right-click (modern interface, #808) | the same menu, for the unit or square picked (§9.2) |
| Zoom, and its option | the camera's distance, kept per view |
| Changing the art mid-game | changing the model set hands the game over to a new page with it, as an art change that can't be made in place does (#1118) |
| Waiting for the next turn (`setWaiting`) | the same cursor and dimming |

---

## 12. Testing

CI has no GPU, so the logic is kept apart from the drawing and tested headless:

- **Layouts:**
  - a square's middle round-trips;
  - neighbours share edges;
  - copies of the world line up;
  - each layout agrees with the 2D projection's outline where it has one (isometric, hexagonal), and with its
    footprint's box on the square grid.
- **Relief:**
  - it's deterministic;
  - it's continuous across square edges and across the world's seam, checked by sampling both sides;
  - an `Unknown` square is flat whatever its neighbours are.
- **Scatter, sprawl and Wonder sites:**
  - they're deterministic;
  - a city keeps its lots as it grows;
  - nothing is built on water, but a Harbour's docks and a `harbour` Wonder, or on a Wonder's site;
  - a Wonder doesn't move when the city grows.
- **Pacing:** in scripted event and patch sequences:
  - a patch is held until its animation ends, and no longer;
  - GoTo steps join;
  - reduced motion applies everything at once.
- **Camera and picking:**
  - over a known height function, the sea at 0 and a lake at its own height, a ray picks the right square at every
    yaw and pitch, the water's surface where the land is below it;
  - the minimap's four-sided view outline is right.
- **Map events:** a worker-client suite, like the battle sound's. A move the player can't see sends nothing.
- **What's drawn:** a debug page (`dist/map3d-debug.html`, plan 1.1b) that draws a seeded, made-up world on any grid,
  for screenshots in a browser at each slice, with the place it looks at kept in its address. Under `?debug=1`, a game
  under `?3d=1` and the debug page have a stats overlay (frame time, draw calls, triangles, chunks waiting). Pixel
  comparisons can come later, if CI gets a software GPU.

---

## 13. Not in this design

- a 3D city screen, or a 3D minimap;
- day and night, seasons, weather;
- WebGPU, which three.js can target later behind the same view;
- importing Civ5's own models (#101);
- terraforming and building animations, beyond fading in and out;
- one unit per square (1UPT) rules. Those are the engine's; the view would draw them as it is.

---

## 14. What a player will see

At first, nothing: the 3D map is behind `?3d=1` until it shows everything in §11.

After that, Options gains **Map: 2D or 3D**, defaulting to 2D. The 3D map:

- shows the same game, with land you can turn around and tilt;
- shows units walking, sailing and fighting;
- shows cities that grow from huts to towers, with Wonders on the land around them;
- carries the same windows and keys.

A machine without WebGL2 isn't offered it.
