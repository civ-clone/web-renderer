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

**Widened (2026-11-21):** realistic models are still preferred, but a cartoon-like set might work under a realistic
texture, as units are drawn small and low in detail. Such a set can be tried where nothing realistic covers a unit.

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

**Widened (2026-11-21):** CC BY-SA sets may be used too, as hosted sets in repositories of their own under the same
licence, never folded into a CC0, CC BY or MIT set. The first is 0 A.D.'s ancient units, adapted from Wildfire Games'
art ([civ-clone/models-0ad](https://github.com/civ-clone/models-0ad)). It's credited as CC BY-SA asks, wherever it's
used: its library entry gives its licence, linked, and its credit (`licence.attribution`), which names Wildfire Games
with a link, and says what was changed.

**As built (2026-11-23):** the rest are realistic units, in two sets by their licence: those made for civ.one with Meshy
and from Meshy's community (CC0, [civ-clone/models-realistic-cc0](https://github.com/civ-clone/models-realistic-cc0)),
and those mostly adapted from their authors' on Sketchfab (CC BY 4.0,
[civ-clone/models-realistic-by](https://github.com/civ-clone/models-realistic-by)). Each set's library entry gives its
licence and credit, and lists every work it's made from, each linked, with its author and its licence: that list is
the art credits list. Cimpletoon's later units (CC0,
[civ-clone/models-cimpletoon](https://github.com/civ-clone/models-cimpletoon)) shipped for a day before them.

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

**As built (2026-11-23):** the count is the unit type's look's (`unitTable`'s `squad`). The built-in figures use it as
it is: three for most foot units, two for riders, one for the rest. A hosted set's model is drawn as many times as that
for a foot unit, and once for anything else, riders too (`MarkerKit.modelFigures`). Paratroopers are one: a model draws
a parachutist under his canopy, and three canopies would cut through each other. The built-in figure, which has only
his pack, is one too, so a unit looks the same whichever draws it.

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
- **Since:** the minimap shows the 3D map's own overview (1.5), and a long-range order's square is picked on the 3D map
  (1.3).
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

  Typical values, in world units: ocean −0.15, rising to −0.03 at the shore; plains 0.02; hills 0.16, ridged, with
  roughness 0.08; mountains 0.75, roughness 0.15, ridged and peaked, a mountain's top mostly 0.75 to 0.95 high, about
  0.85, up to about 1.05 in a massif. Hills and
  mountains were raised from 0.12 and 0.35 by #1391, so rivers rush down them and mountains stand over the land.
- **Blending:**
  - A point takes its square and that square's neighbours (from the topology), each weighted by a smooth kernel of its
    distance from the square's middle (Wendland C2, radius 1.2 squares).
  - Mountains' peaks are weighted by the square of their weight, so a peak stays inside its own square and doesn't
    spill into the plain beside it.
  - Neighbouring mountains are joined into ranges, as Civ1 joins its mountains: a ridge runs from each peak to its
    neighbour's, dipping to a saddle between them. Across the ridge, the land falls away as it does from a peak, so the
    plain beside a range isn't lifted either.
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
  - Each peak stands off its square's middle by up to 0.22 either way, and is 0.75 to 1.25 times its terrain's height,
    both seeded from the square, so a range of mountains isn't a grid of cones (`peakOf`).
  - **Ranges:** every terrain whose shape is `peaked` is joined to each neighbour of that shape the topology gives,
    across a corner as well as an edge, so a chain of mountains running diagonally is a range too. Squares never seen
    and water are never joined.
    - A ridge runs from one peak to a saddle and on to the other. The saddle is between 0.2 and 0.5 of the lower peak's
      own height, and stands off the line between the peaks by up to 0.12 either way, both seeded from the pair.
    - The crest falls from each peak and levels out at the saddle. Across it, the land falls away by the kernel squared,
      as it does from a peak, and past each peak the ridge is that peak exactly. The land is the highest of the ridges
      and the peaks there, never their sum, so a block of mountains is a massif and not a spike.
    - Each ridge is made by one end, and listed under every square it reaches. A point reads only its own square's
      list, and passes over a ridge whose reach it's outside. The ridges are made again only when a square they join
      changes, or one comes to join them: a square of sea or plain newly seen, the most common change, leaves them.
    - **Cost:** on a world with 7–12% of its squares mountains, as Civ1's are, building the land takes 1–14% longer.
      Reading the terrain again takes no longer, unless a mountain has changed: then 2–5 ms longer (to 5–6 ms on an
      80×50 world, 13–15 ms on a 160×100 one). A world all mountains is the worst case: its land takes about 2.5 times
      as long to build, and reading its terrain again after a mountain changes 30–40 ms on an 80×50 world and about
      120 ms on a 160×100 one, rather than 3–10 ms.
    - A change to a mountain changes its neighbours' ridges, so `refresh` gives back the mountains joined to it, or
      that were, as well as the squares whose terrain changed. The land is rebuilt round them. What's marked on them
      and their neighbours (a unit, a city) is marked again on the land as it is now, and the yields over them laid
      out again.
  - A point's colour is blended more sharply than its height (each square's weight cubed), from a point moved by noise
    up to 0.22 either way (0.31 at most), so terrains' edges wander rather than run along the squares' edges. This makes the land about
    twice as slow to build: 750 ms for an 80×50 world. Spreading a chunk over frames is for M6.

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
- **As built (slice 3.1):** the surfaces' detail, blended, and rock, snow and wet ground by where the land lies.
  - **By where it lies** (`packages/map-3d/terrain/cover.ts`, the same numbers in the land's shader):
    - **rock** where the ground's steep: from about 14° from level, whole by about 28°. So it's on most of a
      mountain, the steeper parts of hills, and a mountain's foot where its slope reaches into a neighbour. Since
      #1391, mountains' sides reach about 64° to 68° at their steepest (58° for most of the steepest, 43° in the
      middle), hills about 34° (up to 55° at a mountain's foot), most under 26°, so about a sixth of a block of hills
      is rock. Those are from the height a sixteenth of a square either side, which reads a little steeper than the
      land's mesh: before, measured so, mountains reached 44° to 49° (37° for most of the steepest, 23° in the
      middle). A texture laid flat stretches about 2.3 times at 64°: rock mapped from three sides would fix that, and
      is still to do;
    - **snow** above a snowline, 0.86 high at the equator and 0.56 at the poles, on ground level enough to hold it:
      none more upright than about 53° from level, whole by about 37°. A mountain's top is mostly 0.75 to 0.95 high,
      about 0.85, up to about 1.05 in a massif. So on the debug page's worlds, counting a peak capped where any of its
      square's points has snow over half, somewhat fewer peaks are capped near the equator than towards the poles, and
      nearly all from halfway to them, a little fewer at each latitude than before #1391. A cap is small, as a peak's
      top is steep. Its latitude is the same at every copy of the world,
      above or below;
    - **wet**, darker and shinier, at the waterline, where water squares are part of what the ground's blended from
      (`GroundSample#shore`, carried by the mesh). Not by height alone: a swamp or a river inland, however low, stays
      dry.
    - None on a square never seen.
  - **Surfaces:** each terrain in the table has a surface (`SURFACES` in `packages/models-builtin/terrain.ts`):
    grass, plains, sand, rock, snow, forest floor, mud and tundra. The sea's floor is sand.
  - **Weights:** the relief blends how much of each surface the ground is at a point as it blends the colour (each
    square's weight cubed, from a point moved by noise), so surfaces' edges wander as colours' do and have no step at
    a square's edge. The land's mesh carries them at each point as eight bytes (`surfacesA`, `surfacesB`).
  - **Detail, made by code** (`packages/map-3d/terrain/surfaces.ts`): each surface's texture, 128 texels a side, made
    from noise that repeats with it, so it tiles. Each texel says how much the land's colour is scaled (by 1 on
    average), which way its bumps tilt the ground, and how rough it is. Grass has patches and blades; plains dry grass
    and soil; sand ripples; rock cracks; snow soft drifts; forest floor leaf litter; mud wet patches, shinier; tundra
    lichen. All eight take about 70 ms to make, once for the page. Their bumps scale with their size, but for the finest, which a smaller texture can't hold (only the tests make one).
  - **Drawn** (`packages/map-3d/landMaterial.ts`): three.js's standard material, its colour the land's at each point,
    with the surfaces' detail sampled from a texture array, by where the point is on the ground, and blended by their
    weights. Each texture repeats every half a square or so, as many whole times as fit the world's period, so every
    copy of the world has the same detail and neither its seam nor a chunk's border has one. The bumps tilt the light
    along the ground's own slope. Far off, the detail's smaller copies even out to the colour, and each surface's own
    roughness: snow and mud shinier than before, rock a little, where all land was as rough. A square never seen has
    no surface, and lends none to its neighbours; the detail fades out towards it.
  - **Cost:** making the noise's slopes from a table rather than a sine and cosine each made the land quicker to build
    (about 520 ms for the debug world rather than 595), more than paying for the weights. Each point of the land
    samples all eight textures, so their smaller copies are chosen alike where surfaces meet.

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
  - As built (`water.ts`): the texture the sea reads holds four things for each of the land's points: its height,
    whether it's never been seen (where no water's drawn), how much cloud is over it, and whether a chunk's been laid
    over it yet. Where a chunk is laid again with a point seen that was laid never seen, its water's there at once, and
    its cloud thins from where it was to none over `CLOUD_CLEARING` (half a second), from the frame its chunk's laid in,
    as the cloud's own noise breaks it up. Where a chunk is laid over a point for the first time, seen, as the game starts or
    the camera goes somewhere new, it has no cloud at all.
  - The map draws frames while any is clearing. It clears at once under reduced motion, or with no frames to clear over.
  - A chunk laid sends the whole texture again, as before. Between those, each frame sends only the points clearing,
    unless more than `WHOLE_FROM` (4,096, about 64 squares) are, or what was last asked was never sent (the context
    lost and made again): then the whole is sent.
- **Squares seen before but not in sight now** are drawn as last seen, with the colour and light dimmed. This is only
  under rules that tell the two apart, the same as the 2D map.

### 4.6 The grid

- **Grid lines,** an option (off by default): lines along each square's outline, laid on the land, drawn from the
  layout.
- **The square under the pointer** gets a soft highlight in its outline. The squares a city works get one too, while
  the city's map is shown.
- **As built, the square under the pointer** (first part, `highlight.ts`):
  - **What:** a band of warm light inside its outline, `HIGHLIGHT.width` (0.09) wide all round, its inner corners where
    the bands along each side meet, as bright as `HIGHLIGHT.edge` (0.55) at the outline and fading smoothly to none at
    its inner edge, through two rings of points between, so the fade between them is the curve's, not a straight
    line's.
  - **Where it lies:** on the land as its mesh draws it (`Land#surface`), cut along its cells as rivers' water is
    (`lay` in `terrain/ribbons.ts`), `HIGHLIGHT.lift` (0.04) over it: over the highest of what's laid flat on the land,
    a runway's markings, there and on a bridge's deck over a river at the outline. That's pulled in front of the land
    (`polygonOffset`) further than the band's lift over it once the camera's far off, and further still on a slope,
    where its strips cut across the land's creases, so the band's pulled in front more (-4, -8, against the overlay's
    -2, -6): about two of its own depth slope's pixels, not enough to show through what stands. So it shows over
    fields, roads and railroads at any distance, on hills and mountains too, while trees, buildings and units stand in
    front of it. At sea, that much over the sea's surface. Drawn at every copy of the world, seen through, and clipped at the
    poles where the view stops there. Drawn after the sea (`HIGHLIGHT_ORDER`, before smog and the cloud, §4.5), as
    the sea, seen through, is one plane across the world that three.js can only order by that: drawn before it, the
    sea would be painted over it at sea and over drowned coasts.
  - **Which square:** the one under the mouse as it rests over the map with no button held (`CameraInput`'s `hover`,
    which also opens tooltips), picked as a click is (`#tileAt`, so a unit's square where a unit's under it). It's
    picked again in a frame where the camera's moved, once it's placed, as the map can move under a still mouse, and
    laid again only where it's another square or the land under it has changed. Where the square under the mouse was
    never seen, it's picked again when squares change, as it may be seen now. A unit walking under a still mouse
    doesn't move it. None over a square never seen, while a menu's open over the map, or once the
    mouse has left the map or pressed. A key doesn't end it, as it does a tooltip.
  - **Cost:** a frame where the mouse moves onto another square; none as it moves within one. On a late Civ1 save,
    a move took 0.8 ms at the median and 1.6 ms at the 90th percentile, picking the square for the tooltip and the
    light. A frame where the camera's moved picks it once more; one where it hasn't, not at all.
- **As built, grid lines** (`grid.ts`):
  - **What:** a thin dark line along every square's outline, on every grid: squares, the staggered grid's diamonds and
    hexes. An option, off as it comes ("Grid lines on the 3D map", under `?3d=1`; `lines=1` on the debug page), shown
    or hidden at once as it's changed, without the map built again.
  - **How:** the land's own chunks drawn a second time with a material of their own, as each chunk's child. Each point
    is lifted `GRID.lift` (0.04, the light's) over the land, or over the sea's surface at sea, and drawn only near a
    square's edge: how far it is from the nearest edge of the square it's on comes from where it is on the ground, as
    each grid lays its squares (`edgeDistance` in TS, the same sums in GLSL, `gridGlsl`), so there's nothing to build
    and a line follows the land's mesh exactly, over hills and mountains alike. A line reaches `GRID.half` (0.012)
    either side of an edge, as dark as `GRID.opacity` (0.3). Further off, where that's thinner than 0.6 of a pixel
    either side, it's that wide and fainter instead, so it doesn't crawl. A pixel's width there is taken across the
    nearest edge from where the pixels are on the ground (`gridEdge` gives the edge's way across as well as how far
    it is), not from how fast the distance to it changes, which folds at the line and would say a line between two
    pixels has none. Where a square's under about 14 of the screen's device pixels across (taken the more foreshortened
    way, so about 20 with the view turned an eighth), it fades, gone by 6, as the lines would crowd it. A line's edge
    is ramped straight across a pixel, so however it falls between pixels it's as dark in all, and doesn't pulse as
    the view pans. None on squares never seen: only where every point round is (the chunks' `unseen`), so the line
    along the edge of what's been seen keeps its inner half at least, whichever square its points were taken from;
    the outer half's there on some sides only, and a line between two squares never seen can reach a step past the
    edge, under the cloud's soft edge.
  - **Order:** seen through and writing no depth, and pulled in front of what it lies on as the light is
    (`polygonOffset` -4, -8), so it's over fields, roads and railroads and under what stands. Drawn after the sea and
    before the light (`GRID_ORDER`, 1.2): the sea's one plane across the world, which three.js can only order by
    that, and the light's after the lines so it's over the line at a square's edge on every chunk alike, not over some
    and under others as the camera moves.
  - **Tried first:** strips laid along each square's outline like the light's band (`lay`), each square laying the
    half of each line inside it. They lay exactly, but cost about 190 ms a chunk to make, more than the land itself,
    which no frame's budget can split, and about as many triangles as the land.
  - **Cost:** nothing to make. Shown, the land's triangles are drawn twice, the second time with a short shader.
  - **Still to see:** the light's 0.04 lift and pulling forward that the lines share can put a tick of a line a pixel
    or two over a ridge's skyline, or over the foot of what stands near an edge, as the light's band can. Where the
    view's foreshortened, a line that reaches further is cut short a pixel or two before it crosses another, where the
    other's edge is nearer; it's faint there.

---

## 5. On the land: vegetation, rivers, improvements

### 5.1 Vegetation and ground cover

The model set's scatter table says what grows on each terrain:

- **forest:** a canopy of trees in stands, conifers towards the poles and broadleaf towards the equator;
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

- **Woods, as built:** forest, jungle and swamp grow as one canopy across their squares, as Civ1's forests run together
  (`woodsPlants` in `packages/map-3d/overlay/overlayMesh.ts`).
  - **The lattice:** trees stand at the points of a lattice laid over the whole ground, about 0.17 apart (`CANOPY`;
    0.26 for a swamp, `Growth#spacing`), each jittered about its cell. The lattice repeats exactly with the world's
    period, so it has no seam, and its spacing isn't a whole share of a square, so its points don't line up with
    squares' edges. A whole square of forest or jungle grows about 25 trees (9 before #1363).
  - **Ownership:** each point is on the square the layout says (`GroundLayout#tileAt`). So no point is planted twice,
    none is past the edge of a world that doesn't wrap, and the canopy runs right across the edge between two squares.
  - **Which woods join:** the vegetation table's `canopy` says. Forest and jungle are one woods; swamp is its own. A
    neighbour counts only where it grows its woods: not a city's lot, cleared ground (fields, a fortress, an airbase),
    or a square never seen.
  - **The fringe:** a square of woods is whole, and whole across the edge to a neighbour of the same woods. Within 0.15
    of an edge to other ground, it thins to half its trees at the edge, and its trees grow smaller there (0.9 of their
    usual size, against 1.3 where whole). So a lone square of forest is a whole wood too, and a big one's edge is
    ragged.
  - **Stability:** each point has its own numbers for whether it's planted, what grows there and how big, and keeps
    the room it would where the woods are whole. So a neighbour turning to woods only ever adds trees, roads or not,
    away from the shore: there, the land under a tree can fall below the sea with the change.
  - **Spacing:** trees keep clear of a unit's stand, what stands on their own square, its roads, and its neighbours'
    roads that cross its corners (a diagonal road beside it), but not of each other: the lattice keeps them apart. A
    crown at a square's edge can reach over a neighbour's hut or mine by a few hundredths, as a tree can't see what
    stands on its neighbour's square.
  - **The clearing** (#1363): a unit stands in a clearing in the middle of its square, as everywhere. A tree's crown
    may reach a third of its room over the clearing's edge (`CROWN_OVER`), over the stand's rim (0.2 from the middle)
    but no further in than 0.17, short of its figures. Trees within 0.12 of the clearing's edge grow smaller, down to
    0.7 of their size at it (`GLADE`, `GLADE_SIZE`), so the tallest don't wall a unit in.
  - **Undergrowth** (#1363, `Growth#undergrowth`, `undergrowthPlants`): bushes, scrub and shrubs under the trees, on a
    lattice of their own (0.13 apart in a forest, 0.11 in a jungle), with the same fringe and stability, on 0.6 of its
    points in a forest and 0.7 in a jungle: about 34 a whole square of forest and 51 of jungle. Its scrub is a low
    five-sided mound. What stands no higher than a unit's stand's top (`GROUND_COVER`, 0.03 over the ground at the
    middle, however the land under it lies) grows in the clearing too, as near the middle as 0.04 and its room
    (`COVER_CLEAR`), under the stand where a unit stands; the rest keeps clear of the stand as trees do. It's built in
    whatever set draws the trees, in the overlay's own mesh.
  - **Stands** (#1363, `Growth#stands`, `standAt` in `overlay/stands.ts`): a forest's and a jungle's trees grow in
    patches of a kind or two, as woods do, rather than every kind mixed tree by tree.
    - **Where:** each stand is round a centre on a lattice about 1.4 apart over the whole ground
      (`STAND_SPACING`), each centre jittered about its cell, repeating with the world's period. A tree is in the stand
      of its nearest centre, a little nearer or further by a number of its own (`STAND_MINGLE`), so stands' edges
      mingle rather than meeting in a line.
    - **Which:** a centre's stand is chosen by a number of its own, as often as each stand's weight at the centre's
      latitude says (`latitudeAt` on the square's place, the land's own rule, where the centre is on the world rather
      than a period round), so a stand reaching over two squares, or over the seam where the world wraps, is one
      stand, and stands change with latitude as woods do.
    - **A forest's:** pine; spruce and fir with pines, the boreal forest, weighted towards the poles; birch among pines;
      a mix of beech, oak, birch and pine; beech; and oak among beeches, weighted towards the equator. At the poles a
      forest is about four fifths firs and pines among birches; at the equator about five sixths broadleaf, oaks and
      birches. The names are the kinds': with 0 A.D.'s trees, a forest's broadleaf is its large oak, its oak the holm
      oak, and its birch its beech.
    - **A jungle's:** rainforest, broadleaf under tall trees over the canopy and a palm or two; and palms with bananas
      between them.
    - **The kinds** they bring (`PLANT_KINDS`): a fir's narrow spire, an oak's spreading crown, a birch's white trunk,
      a tropical tree's high, flat crown, and a banana's broad leaves. Each has a built-in shape as tall as its kind
      (`PLANT_HEIGHT`) and reaching no further round than its room, and a base kind (`PLANT_BASE`): a set with no
      model for a kind draws its base's (`plantModelOf` on the land), so a set with pines and no firs draws pines for
      both rather than the built-in set's shapes among its own.
    - **Stability:** a stand comes from where things are on the world, so a neighbour turning to woods still only adds
      trees.
  - **The shore:** trees stand on dry land; a swamp's reeds stand in the shallows too.
  - **Cost** (#1363): a whole square of forest at the middle latitudes is about 975 triangles with the built-in shapes
    and 3,060 with 0 A.D.'s trees, against 210 and 630 before; of jungle, about 1,180 and 5,040, against 220 and
    1,280. Laying one takes 0.1–0.3 ms. A set's trees are thinned far off (below); the undergrowth, in the overlay's
    mesh, isn't.
- **A set's trees** (#1335): where a set of models draws a kind of plant (`names.plant`, §10), each of that kind is laid
  as where it stands, how tall, its turn and (since #1363) its rank for thinning (the overlay's `plants`, by the
  model), not as the built-in set's shapes, and drawn as the set's model.
  - **Which:** of several sets, the earliest the page names draws a kind, as with units. A kind on a terrain of its own
    (`Jungle:broadleaf`) is drawn with its own model before the kind's, but only where no earlier set draws the kind.
    Once all a set's models have been tried, if any draws a plant, every chunk's overlay is laid again
    (`Land#growWith`), nearest the camera first: once a set, not once a model.
  - **Size:** as tall as the built-in set's shape of its kind would be (`PLANT_HEIGHT`, times its size), by the model's
    height over its origin, where it meets the ground; its roots may reach below. Not at the set's scale, which is its
    units'.
  - **Room** (#1363): each keeps the room its model takes, as far as the model reaches round its origin for each of its
    height (measured by the stage, given to the land with the models, `Land#growWith`), at the height it's drawn
    (`roomOf`), rather than the built-in set's shape's: so a fir drawn with a set's pine keeps the pine's spread at a
    fir's height, clear of the clearing and the roads as the built-in shapes are.
  - **Drawing:** a chunk's plants of each model are one instanced draw call for each of its parts at each copy of the
    world, their matrices one buffer every copy shares, and how far they reach worked out once. Since #1363, they're
    ordered by a rank laid with each (`ditherRank` in `overlay/thinning.ts`, the overlay's sixth number for a plant):
    a 4 by 4 dither over the cells of the lattice it stands on, and within that a fraction of its own; a plant not on
    a lattice, scattered about its square, takes a fraction from the square's seed. Where a lattice's cells round the
    world aren't a whole number of fours, the dither slips at the world's seam, so a line of trees there is kept in
    pairs once they're thinned. As the view
    draws, a chunk's copy whose nearest tree is deep enough into the view (along the way the camera looks) that a tree
    0.3 tall there would stand under 8 of the page's pixels (`PLANTS_FULL_PIXELS`) draws fewer of them, the first few
    by rank, an even scatter: as many to the screen's area as at 8 pixels, never under a fifth (`plantsKept`), the
    same share for each of a model's parts. At the default view, the furthest ground it shows is about 32 deep, so on
    a view 640 pixels tall or more all of its woods are drawn; only a camera drawn well out, or looking low to the
    horizon, thins them. The isometric view looks lower: at the default distance it's whole from about 1,260 pixels
    tall, and on a view 900 tall its top edge keeps about half. Every copy's let go of together, when the chunk's laid
    again or the copies drawn change, as they share the buffer. Leaves are cut out where their texture's under half
    solid, drawn from both sides, and cast shadows cut out as they are (three.js makes the shadow's material from the
    leaves'). They're clipped past a pole the view's stopped at, as the rest of the overlay is.
  - **The shipped trees:** civ-clone/models-0ad's, from 0 A.D.: a pine (`conifer`, 58 triangles), a fir (`fir`, 64,
    0 A.D.'s fir sapling), a large oak (`broadleaf`, 129), a holm oak (`oak`, 236), a beech drawn as the map's birch
    (`birch`, 82), a teak (`Jungle:broadleaf`, 124), a tropical tree (`tropical`, 144), a date palm (`palm`, 208), a
    banana (`banana`, 242) and a dead tree (`deadTree`, 199), since civ-clone/models-0ad#9 (#1363). A forest of them
    costs more than the built-in set's shapes: about 3,060 triangles a whole square at the middle latitudes, against
    975 (the cost, above), and a jungle about 5,040.

### 5.2 Specials and huts

- **Specials:** a special (Fish, Coal, Wheat…) gets a small model on its square. It's looked up as `Terrain:Special`,
  the same key the tilesets use [verified: `names.special` in `packages/tileset-civ2/civ2.json`].
  - **As built** (#1335, made by code until a hosted set brings models): big enough to be seen at play's zoom, each
    takes up to 0.2 of room (`SPECIAL_ROOMS`) 0.85 of the way from the square's middle to its edge, clear of the unit's
    stand and inside the square but for 0.03 (`EDGE_REACH`), so in one of its corners where there's room: nothing on a
    neighbouring square keeps clear of it. Its place is sought a little nearer in too, where a hex's corners have the
    most room. Where there's less (roads, walls, a hex's shallower corners), it takes the most there is, down to 0.1,
    and is drawn smaller to fit, by its own reach (`SPECIAL_REACH`), never bigger than its own size (logs a little
    bigger). What isn't a beast or logs keeps its height as it's drawn narrower, so it's never lower than it was.
    Keeping to its square keeps it off the sea's floor past a shore; and as a guard, nothing on land stands deeper than
    the sea's floor begins beside land (`inTheSea`), though it may stand on land just under the water's level, as a
    low swamp's is at the shore. Inside a fortress's walls, where nothing has room, it takes the spot with the most, as
    before.
  - **Beasts** (`overlay/beasts.ts`) are made of plain shapes as units are, each a little larger than life, beside
    units drawn twice life: horses with manes, tails and hooves, oxen (buffalo) with a hump and horns, deer (game, and
    caribou on the tundra) with antlers, foxes (furs) with a bushy tail, an elephant (ivory) with its trunk and tusks,
    seals lying with their heads up, and pheasants. A herd stands side by side, each a little ahead or behind and turned
    a little its own way, as big as its room allows, by each beast's reach as its parts are turned (`beastReach`); one
    whose place is in the sea isn't drawn. Horses are a bay, a chestnut and a grey (`coats`), so a herd shows
    on the plains' tan.
  - **The rest:** Civ1's shield on grassland (and Civ2's resources) is a stack of six logs, their cut ends pale; ores,
    crops and turf are piles and clumps round a point; a shoal of fish swims round, one in three leaping; a whale
    spouts; an oasis's palms lean out round its pool.
  - **The debug page** lays out every special, one to a square, with `specials=1` (plan 2.1).
- **Huts:** a hut is a small village.

### 5.3 Rivers

- **Where they come from:** a river terrain (Civ1's `River`) or a river on the square (Civ2's).
- **Course:** a spline runs from each river square to each edge-neighbour with a river, and to the sea. Edge-neighbours
  come from the topology, so a river follows square edges on the square grid and hex sides on the hex grid.
- **On the land:** the spline cuts a channel into the relief, and carries a water ribbon that flows downhill.
- **As built** (first part, `terrain/rivers.ts`, `terrain/relief.ts`):
  - **Where:** a square has a river if its terrain is `River` (Civ1) or it has the `River` feature (Civ2), and it's
    been seen (`ReliefSource#riverAt`). It joins each neighbour seen across an edge (`ReliefSource#edgeNeighbours`)
    with a river, and each that's water with a mouth. With neither, it's a pool. A square never seen joins nothing.
  - **Course:** a quadratic Bézier from one square's middle to the other's, its middle bent off the line by up to
    `MEANDER` (0.14), each its own way by the square, the way it runs and the seed. Each is made once, by the end that
    comes first down the world, and listed under every square it reaches into, at every copy of the world, as a
    range's ridges are. A mouth widens from a quarter of the way to the coast, halfway, to `MOUTH` (2.5) times a
    river's width, and runs on into the sea.
  - **Level:** what its channel's cut under. At each point along it, under the lowest of the land round it as it would
    be with no rivers (seen and dry, at it, at its bed's edge and at its bank's top, there and halfway to the next
    point), by `MARGIN`, or less near the sea's level, so land over the sea keeps its river over it (`underLand`). At
    each end, the same for every course from that square, so they meet at one level at its middle. A mouth's comes
    down to the sea's at the coast, and on under it. Away from a square's middle, each course is at its own level, so
    one falling faster than another where they meet (a mouth to the sea, say) can cut the land beside the other's
    channel lower than the other's level: the water lies on the land as it's drawn, not at the level.
  - **Channel:** across its water (`RIVER_WIDTH`, 0.08 either side) and `FLOOR` (0.18, about the land's mesh's
    diagonal) past it, the land is cut flat to its bed, so no triangle under its water rises over it, wherever the
    mesh's points fall. Its bank rises back to the land over `BANK` (0.14), and is wet, darker, from the water to
    halfway up, fading out as the land comes down the last 0.0002 to the sea's level, so it's not where the sea's drawn,
    in a mouth or on the sea's floor under it.
  - **Bed and the sea:** where its level's over the sea's, its bed is `DEPTH` (0.004) under it, or nearer, but over the
    sea's, so the sea's surface never shows inland. At the sea's level its bed is too, and under it, further under,
    so where a river comes down to the sea, the sea is its water. The bed's continuous through all of these, and its
    level and width are taken by where a point falls along the course's line, which changes smoothly, so the land
    has no step.
  - **Changes:** every course is made again when any terrain's changed, and each that's changed, or come or gone, says
    the squares it reaches into, so their chunks are built again (`ReliefMap#refresh`). A river feature that comes or
    goes counts as a change.
  - **Water** (second part, `terrain/ribbons.ts`): a strip along each course, as wide as its water, with a disc at each
    end where it joins others (12 triangles), so bends and junctions are round; a pool's a disc. It's laid on the land
    as the chunk's mesh draws it, `RIVER_LIFT` (0.004) over it: its triangles are cut along the land's cells and their
    diagonals (`lay`), so each piece lies over one of the land's triangles, and both are flat there, so the water's
    exactly its lift over the land everywhere, however creased the land is, as it is where courses cut each other's
    banks over hills and mountains. So it's never under the land, nor left standing over it. Never under the sea's
    level, where the sea's surface is. Only where its level's over the sea's, and on to where it meets it: a mouth's
    water stops at the coast, where the sea's surface takes over. Each course's is carried by the chunk its first
    end's in (`carriedBy`, worked out the same way for every chunk, so one carries it even on a chunk's border),
    relative to its corner as the land's points are, laid on that chunk's points and, past its edge, on the next
    chunk's as they'll be, and drawn with the land at each copy of the world: one more draw call a chunk with a river.
    With the view stopped at the poles, it's clipped at them as the overlays are (a course across the poles has water
    only on the far edge's side for now: #1379). It's darker and greener than the sea at its shore, white where it
    breaks (the fifth part, below), and a little in front of the land under it (`polygonOffset`, `riverMaterial.ts`).
    It doesn't move yet: that's with #1365.
  - **Keeping clear** (third part, `overlayMesh.ts`): what's laid on a square keeps clear of the channels of the rivers
    through it (`ReliefMap#coursesAt`, each placed at the square's copy of the world, as `Land` gives them its overlay),
    out to their flat beds' edges (their water's width and `FLOOR`), as it keeps clear of its roads: what grows there,
    woods' trees, its specials, a mine, a hut and a farm's buildings (each through `Layer#clearance`), and the houses
    of a city beside it that have spread onto it (`SuburbClear#channels`). Where there's room nowhere, each takes the
    place with the most, which can take it a little into a channel's bed, though not, where I've looked, its water. A
    field's rows stop short of a channel either side, where its round ends and the band between them cross the row
    (`channelAcross`, met at five lines down it). A city's lot is left alone: its plaza and buildings stand over the
    river, as the 2D map's city covers its square.
  - **Bridges** (fourth part, `overlayMesh.ts`): roads, railroads and an airbase's runway cross a river's water on a
    bridge, and a city's plaza and streets lie on the same deck over it.
    - **The deck:** where each is over the water, it's laid on a deck `BRIDGE.clearance` (0.008) over the water's
      surface, flat across the water and `BRIDGE.past` (0.03) either side, then falling to the land as steeply as
      `BRIDGE.slope` (0.35), never under the land (`Layer#deckAt`).
    - **Its height:** the water's surface is taken from the river's level, where a point falls along its course, as
      its channel's cut takes it (`riverNear`, from `ReliefMap#coursesAt`, which gives each course's levels with its
      points). So the deck's height is the same at a point from either square, and two squares' roads, railroads and a
      city's streets meet at one height at the edge between them, on a bridge or not. Where no river's near, a square's
      laid as it was. Each point on a deck is worked out once for its square, as strips' triangles share their corners.
    - **Its walls:** along a road's, railroad's, runway's or apron's edges, wherever the edge itself is on the deck
      (not only its middle: a runway's far edge needn't be), from the land or the river's bed to `BRIDGE.parapet`
      (0.012) over it: stone for a road, iron girders for a railroad, concrete for a runway and its apron. They stand
      on its edges as its ribbon lays them, so they follow its bends and end where it does. A road through the square,
      its halves turning no more than about 70° at its middle, has its walls as one, mitred there. Elsewhere they open
      where the square's other roads and railroads join or a road or railroad on its own lies, and where an airbase's
      runway or apron crosses (so roads' and railroads' walls are laid last, once the apron's laid); and a runway's and
      its apron's open for each other: no corner of a wall stands on one. Lengths shorter than 0.06 are left out, so a
      road just reaching over the water at a junction has none. A railroad's girders stand on its ballast's deck. Each
      wall's inner face starts `BRIDGE.under` (0.005) under the deck, as its route is laid less finely than its walls
      where its deck bends. Straight, evenly sloped lengths are one face. A city's streets have no walls.
    - **Where they meet:** every road and railroad on a river square starts at its middle, where its rivers meet, so
      that's where they cross. One that runs the same way as a river runs along it on a causeway, the same deck and
      walls, as far as it's over the water.
    - **A fortress's walls,** where a length of them is over the water, or within `BRIDGE.past` of it, at its middle
      or either end, leave a gate for it, their foot `WATER_GATE` (0.02) over its surface.
    - **A unit** at a river square's middle still stands on the land, so a little lower than a road's deck there.
  - **White water** (fifth part, `foamAt` in `terrain/ribbons.ts`, `riverMaterial.ts`): where a river's water falls
    steeply, it breaks white.
    - **How white:** each point of its water has a `foam`, from 0 to 1, by how steeply the water falls there as it's
      laid, taken just either side of it (a 32nd of the land's spacing), so by the land's triangles that meet there,
      not a bank half a cell off: none under `RAPIDS.from` (0.1), all from `RAPIDS.full` (0.25), and more the steeper
      between. Drawn between its points, a drop over one of the land's cells whitens the water a little above and below
      it too. It's by where a point is alone, so wherever strips and discs share a point or overlap, at bends and
      junctions, or two chunks draw water at one place, they're as white as each other. Its points and triangles are as
      they were.
    - **Where:** Civ1's rivers, in their valleys, are nearly flat: along them they fall no more than about 0.06, and
      their water's steepest, across a mouth, about 0.095 where I've measured, just under `RAPIDS.from`, so they don't
      break. Civ2's, a feature on hills and mountains, fall as steeply as 0.5 to 0.75 in places (0.3 to 0.5 before #1391). A river's levels aren't ordered downhill yet, so where
      one climbs out of a saddle between mountains, it breaks white there too (#1388).
    - **Drawn:** the shader whitens the water where its foam's over a noise of two sizes, by where it is on the ground
      (about 22 and 66 to a unit, a whole number of them to the world's period, so it's the same at every copy of the
      world: `latticeOf`), so it breaks in patches: more of them the more it foams, and nearly all white where it's
      steepest, with flecks of water between. It's rough there, as broken water's no mirror. It doesn't move: that's
      with #1365.
    - **No falls of their own:** a river holding its upper level to the edge between its squares, then falling, barely
      sharpens its drop, as the land caps how long a level can be held, and it looks as its white water does. A fall
      would need the land itself to step, or a river's levels ordered downhill first (#1388).

### 5.4 Tile improvements

Each is looked up by its type name in the model set.

- **Laid flat, as built** (`Layer#flat` in `overlayMesh.ts`): roads, railroads, fields, a runway and its apron, and the
  discs where routes meet are cut along the land's cells and their diagonals (`cutAlong` in `terrain/ribbons.ts`, as
  rivers' water is), which `Land` gives them (`OverlayPlace#spacing`). So each piece lies over one of the land's
  triangles, and all of it lies exactly its lift over the land, between its points as at them, however steep the land.
  Each layer stays in its order everywhere: fields at 0.01, ditches 0.011, a special's disc 0.012, roads 0.014, an
  apron 0.015, ballast 0.016, sleepers 0.018, rails 0.02, a runway 0.022 and its markings 0.024. Cut so, it needs no
  points of its own between the land's. A strip's or a ribbon's length is one piece, cut where the land creases. A
  route that may be on a bridge's deck (anywhere on a square a river reaches into) keeps points every `STEP` (0.06),
  as a deck is curved, not flat between the land's points, as where the land's cells aren't known. On a 60 by 40 world
  with roads everywhere, railroads on every other row and irrigation, that's 4% more triangles than laid at its own
  points every 0.06 and 22% more time; on a late Civ1 save, 2% more triangles and 22% more time.

- **Road:** a strip laid on the land, from the square's middle toward each neighbour that has a road. Only the
  connected directions are drawn, as the 2D map does. As built (`roadHalf` in `overlayMesh.ts`), each half, from the
  middle to the edge it shares with the neighbour, is a lane, not a ruler's line: it bows a seeded way, each way out of
  each square its own, as far as 9% of its length from the straight line, and comes to the edge along that line, so it
  meets the neighbour's half, which does the same, at the same point going the same way. It stays on its own square,
  and what stands there keeps clear of it along its bend.
- **Railroad:** the same, with sleepers and rails, but straight, as railways are laid. Where a square has both, the
  railroad replaces the road.
- **Irrigation and Farmland:** fields laid over the square, with ditches running from water. Farmland is denser.
  - **As built, its farm** (#1335): where no city's houses have spread onto the square, a farm's buildings stand among
    its fields, square with their rows: a farmhouse (its walls and roof their own colours, so a city's houses are told
    from it), a red barn with a gabled roof, and haystacks, or on farmland a silo. They take the room left inside the
    square (`FARM_ROOMS`, 0.13 down to 0.08) and are drawn to fit, and the fields' rows keep clear of them, as of a
    city's houses. Like a city's houses, they stand out of the water, all the room they take, where a river or the
    shore dips the land below it. Where nowhere they might stand is dry (a one-square island, or a river or the shore
    on every side), there's no farm, only fields. The farmhouse's and the barn's walls run from the lowest of the ground
    under them to their height over the highest; the haystacks and the silo reach down to the lowest of the ground
    round their rims.
- **Mine:** a shaft head and spoil heaps on hills; a cut on mountains.
  - **As built** (#1335): on a mountain, a tunnel's dark mouth in its frame, posts and a lintel, dug into the rock
    behind it: a wedge in the mountain's colour, its face upright behind the mouth and over the lintel, sloping back
    into the ground, so seen from behind it's a rise in the slope. A fan of spoil is tipped below it, with a cart. It
    faces the way the land falls the most from behind its mouth to where its spoil's tipped, of 32 ways round, so a
    ridge or a saddle nearby doesn't turn it up the slope (in a hollow, the way it rises least, and out from the
    square's middle where it's about flat). Elsewhere, a headframe over the shaft, four legs leaning in, braced, its
    wheel at the top, an engine house with its chimney behind it, its walls as a house's, spoil heaps and a cart. Each
    part reaches down into the ground at its lowest, so none hangs over a slope. It takes the room left inside the
    square, as a special does (`MINE_ROOMS`, 0.15 down to 0.1), and is drawn to fit.
- **Fortress and Airbase:** a model on the square.
  - **As built, a fortress** (#1335): stone walls round the square's middle, 0.62 of its radius out (the lines what
    else stands there keeps clear of), clear of the unit's stand. Each wall is laid in lengths that step with the
    ground, from the lowest under each to 0.05 over the highest, with merlons along its outer edge. A round tower under
    a slate roof stands at each corner. Wherever a road or railroad leaves through a wall there's a gate, flanked by two
    square towers, as wide as the road, or the railroad's ballast, across the wall at the angle it crosses, with room
    for the towers' depth and a little more; or, where none does, one in the south wall (towards the camera at its
    starting heading). Where a road leaves through a corner, both walls are open there, as far as the gate that opened
    it reaches, with no tower; a gate's tower that would stand in a corner's tower isn't drawn.
  - **As built, an airbase** (#1335): a runway across the square south of its middle, marked with a dashed line down
    its middle, its edges, and bars across each end; a hangar under a vaulted roof, its doors facing the runway, an
    apron of tarmac between, over any road it crosses and under a railroad; and a control tower, a shaft with its glass
    cab. The runway and its markings lie over a railroad that crosses them: each kind laid over the land has a lift of
    its own (`LIFT`), so none lies in another's plane. The hangar and the tower each claim the most room there is for
    them inside the square, as a special does, off the runway (what stands there keeps its room clear of the line down
    its middle); the tower, and what's claimed after, off the apron too. Their walls stand on the ground.
  - **The debug page** lays out fortresses, airbases, mines and farms, some with roads, with `improvements=1`; and on
    Civ1's River squares with rivers through them, a road and a railroad across one, a road along one, a fortress and
    an airbase on one. Last, Civ2's River on hills, falling from mountains to grassland, white where it's steepest, a
    road across it.
- **Pollution and fallout:** smog, a low, sooty brown haze over the square (#1335), darker than open land and rock,
  so it shows over mountains (forest, jungle and swamp are about as dark, and it's told from them by its hue):
  see-through, so the land and what's on it show through, thickest at its
  middle and thinning to nothing at its edges, reaching a little past the square's so polluted neighbours' join
  (`SMOG_REACH`, 1.4 times its radius), with wisps over it, higher and thinner. Draped over the land, as what's laid
  on it is, 0.07 to 0.16 over it, about a figure's height, so it hangs round units on the square, its spokes no
  further apart than its rings so it follows a slope. Past the shore it carries on over the water, riding its surface
  rather than the sea's floor. It's a mesh of its own in each chunk's overlay (`Layer#haze`, the overlay's `haze`),
  each point as solid as it says, drawn from both sides in one pass with one material, unlit, writing no depth, so its
  layers don't hide each other. It's drawn after the sea and before the cloud (`SMOG_ORDER`, 1.5, between the sea's 1
  and the cloud's 2, all in `water.ts`): the sea is one see-through plane across the world, which three.js can only
  order by that, and drawn before it, smog over the land with the sea behind it would be painted over, cut along the
  shore. On high land the smog can be over the cloud's plane, which is still drawn after it, as it's under it on low
  land, which is more often. Dithering it (`alphaHash`, as fading units are) would need no order, but a soft haze,
  mostly faint, would be grainy and shimmer as the camera moves. It doesn't drift: that would
  need frames drawn all the time, as idling does. Fallout, when a rule sends it, can take the same haze, darker.

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
- **Height:** it stands on the land's height at its feet. Its stand's flat, so on a peak or a steep slope it stands on
  the highest of the land under it (`markers/standHeight.ts`: the land's points under it, and its rim all round,
  where it crosses the land's creases too), never sunk into it, and no higher. A walk through a square's middle
  passes at that height too (`WalkPoint#middleLift`). At sea, a ship has no stand, so it rides the water at the
  middle. Since mountains rose (#1391), a stand on a mountain perches on its summit, its rim off the land on the
  steep side; and a unit in a city, which stands in front of the middle, is still at the middle's height, so it can
  sink into a slope there; and the active unit's ring and a fortified unit's wall, a little wider than the stand,
  can dip into a steep side (#1397).
- **Size:** twice life size (`UNIT_SCALE`), as a tabletop game's figures are, so units read at a glance beside the
  cities and land, which are drawn life size. Their stands, and a fortified unit's wall, stay as they are, so a squad
  or a vehicle may reach past its stand, as a counter on a table does. A set says its models' sizes against each
  other: 0 A.D.'s riders and chariot are drawn at three-quarters of its scale, so a horse doesn't tower over a tank.
  Options has the size of the 3D map's units, from half to half as big again, for a player who'd rather have them read
  from further away. (Life size until 2026-11-21, when I tried twice life size in a game and kept it.)
- **Aircraft:** an aircraft flies over its stand, wherever it is: the built-in set's are drawn so, and one drawn with
  a model flies as high, its underside `AIRBORNE_LIFT` times its size over the stand (`MarkerKit.modelFigures`).
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
  - As built (`MapView3D#blink`, `markers/drawMarker.ts`): the page passes the option as the 2D map reads it
    (`unitMarkerMode`: the theme's choice where the player hasn't made one, or a ring under reduced motion) and the
    theme's `--ui-unit-ring`. Both are read again every half a second, at the blink's tick, so a choice in Options or a
    new theme takes at the next tick.
  - **Ring, or both:** a ring at the unit's feet, in the theme's colour (the modern theme's gold, the classic theme's
    white), whether it's standing or walking.
  - **Blink, or both:** its figures are hidden and shown in turn every half a second, as the 2D map's blink, while its
    flag and the pointer over it stay, and its stand where it's drawn with a model (the built-in set's figures are one
    mesh with their stand). A tick that only hides or shows them draws the scene again and nothing more, in a frame
    like those for units idling (§10, its fifth part). Marked afresh, it's shown, and blinks from there. Walking, it
    doesn't blink. Hidden, its figures are still picked (§9.2, `BLINKED_OUT`), as the 2D map's blink doesn't change
    what's clicked either.
  - **The pointer** over it, in the theme's colour, is drawn however it's marked, so it's found at any distance.
- **Hidden units:** `t` hides units and cities, as it does on the 2D map, so the land shows as it is. A city's walls and
  name go, and its town: its buildings, on its square and round it, are laid with the land (§7.2), so every square with
  a city on it or beside it is laid again as though none stood there, its woods and fields whole (but for one spot,
  below), and its roads as they run (`Land#showTowns`). Shown again, by `t` or for a unit to give orders to, they're
  laid again with the town. Each chunk keeps what's laid on it both ways, so after the first time, `t` takes them again
  rather than laying them: while nothing laid on them has changed, and the land hasn't changed near enough to move the
  heights they're laid on. A unit in a city still stands where it would in front of its buildings, so what grows on its
  square keeps clear of that spot too, as of the middle (`front`), and a ship there is still in port. On the square
  grid, where the spot is 0.24 from the square's edge, the trees of the square beside it can reach within about 0.13 of
  it, clear of the unit's stand. (Chosen on 2026-11-20: `t` shows the terrain.)

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
- **Defeat:** the loser plays `die` and then fades away, in a puff of smoke. The winner returns to its square, or stays
  where the rules moved it.
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
  - steep slopes: mountains;
  - Wonder sites;
  - squares where a mine, a fortress or an airbase takes the ground.
- **Fields give way:** a square of fields is built on where the town reaches it, its rows of crops stopping short of the
  houses. So a city ringed by fields, as most grown ones are, still spreads. (Chosen on 2026-11-20: in one of my saves,
  most neighbours of grown cities were irrigated, so built only on open land, most cities would have spread onto one or
  two squares, or none.)
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
- **As built (4.1, first part: the city's own square;** `overlay/sprawl.ts`, laid with the land by `overlayMesh.ts`):
  - A city's lot is laid with the land, as its overlay (`overlayFor`'s `city`): it follows the land and casts shadows,
    and nothing else is laid there. Its marker keeps its walls, a ring round the buildings, and its name and size.
  - A paved plaza at its middle, and streets from it to the edge it shares with each neighbour whose road or railroad
    comes in (where the neighbour's half arrives), and one down to its quay, to the neighbour of sea most nearly the way
    they all lie on the ground.
  - Lots: one sequence seeded from the city's id, from a jostled grid over the square, nearest the middle first. A city
    of a size has that many from the front, 5 at size 1 and 2 more each size, up to 30 or as many as fit, so one that
    grows keeps its buildings and adds the next out, and one that shrinks loses the outermost. About 25 or more fit
    with no streets, 20 or more with one or two, and 13 or more with a street out every way. A road built clears a
    street through the lots in its way, rather than laying the city out afresh.
  - Each building's footprint, out to its roof's eaves, is inside the walls and clear of the streets, the plaza, the
    lots before it, and the stand of a unit in front of the buildings, with the ring at its feet or its bank. So the
    buildings stand round the plaza and behind the unit, which stands in the open.
  - Each lot a house: beside a street, facing it, square to it, so the houses line it; otherwise facing the plaza. A
    storey or two, taller near the middle each six sizes, sunk to its lowest corner on a slope, roofed in a seeded
    colour of its own lot's, none the owner's.
  - A city attacked is laid as it was till the battle's blow, as its marker shows it: one that shrinks loses its outer
    houses then, and one destroyed its whole town.
  - Still to come: side streets following the land, worked squares further out, eras' buildings, landmarks and the
    palace, docks.
- **As built (4.1, second part: neighbouring squares;** `suburb` in `overlay/sprawl.ts`, laid by `overlayMesh.ts`):
  - From size 4, a city's houses spill onto the squares round it. Each square lays them on its own ground, as each lays
    its own half of a road, from the city beside it (`overlayFor`'s `suburbs`: its seed, how far it's spread, and the
    way to it), so it needs to know only its neighbours, and is laid again when they change.
  - How far they reach from the city's middle grows a step each size, from 0.62 at size 4 to 1.17 at 15, then stops.
    A city that grows keeps its houses and adds the next out, as on its own square: the lots are one seeded sequence
    on each square, nearest the city first, and a size takes those within its reach.
  - Fewer are built further out: all those with room at the city's edge, about half at its furthest.
  - Lots come from a jostled grid over the square, and along each road and railroad on it, either side, facing it, so
    the houses line the roads into town. The grid's lots keep off the roadside, which is left for those. Each road's
    lots are seeded from the way it goes, so a road built another way leaves them be, but for any in its way.
  - On land a city builds on, which isn't the sea, mountains, a mine, a fortress or an airbase, or never seen, and out
    of the water where the land dips under it at the shore. Fields give way: their rows stop short of each house. The
    trees and other plants on a house's square keep clear of it (a neighbouring wood's trees, at the edge, can crowd
    it), and what was on the square first (its specials and hut) stays where it was.
  - Each house's footprint, out to its eaves, is on its own square, with room to its edge, so no two squares' houses
    meet; outside the city's walls; clear of the unit in front of each city's buildings and of one standing on the
    square, at its middle; clear of the square's roads and railroads, the roads past its corners, what's claimed its
    place there first, and every house before it.
  - The ways in are kept clear: from the square's middle to where units stand in front of each city beside it, as a unit
    walks it, where no road or railroad takes it (`Land#roadPath`); where one does, it's kept clear. A way in with
    neither is kept clear a unit's width either side, as far as its figures reach across its way (0.13), so a unit's
    figures walk between the houses, though its stand and ring, wider and low, still reach into the walls of the
    nearest. Roads and railroads are kept clear only to the roadside (0.055), so the houses line them closely, and a
    unit walking along one passes through those beside it, its figures through their eaves and its stand through their
    walls (#1282). (Chosen on 2026-11-20: a unit's width along the roads too cost a quarter of the houses round cities,
    and most of those lining the roads into town.) A unit walking into a city from another square can still cross a
    corner of this one, and one walking between two squares round a city, not into it, through their houses (#1282).
  - A house beside a road, railroad or way in faces it, square to it; any other faces the city. A storey, and some two.
  - Between two cities, or more, each builds on its own side of a square, nearer its own middle than the other's,
    whatever size the other is. So a city's houses there hang on that city and the square alone: it keeps them as it
    grows, whatever the others do.
  - A city attacked keeps its houses round it till the battle's blow, as it keeps its town.

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

**As built, first part (drawing):**

- **Painted by the page:** the interface's layer for the cities' labels (`cityLabels`) paints one city's banner alone,
  on a canvas of its own (`CityNames#paintBanner`), laid out as the 2D map lays it at the 2D art's scale. It's painted
  with as many of the screen's pixels to each of the 2D map's as the 2D map shows them: the pixel ratio times the zoom
  over the whole scale it draws at. So it's as big, and says as much (a compact banner where the 2D map's is), as on
  the 2D map, and as sharp as the screen. The 3D script imports none of it: the page's bundle hands it the painter
  (`MapView3DDeps['cityBanners']`), and gives none for an interface whose layer paints no banner.
- **When:** as a city's square is marked (a patch, `t`, an option), if what its banner says has changed, as the layer
  says it (`bannerKey`); and every city's again as the theme, the fonts loaded or the art change, or as the art's
  zoom or the screen's pixels do. A city kept as it was before a battle is painted as it's shown: what its banner
  shows of it is copied when it's kept, as the page fills its objects in place. One that can't be painted (a browser
  short of what the interface draws with) is named over its city instead, as before, and the map goes on.
- **Where:** on a canvas after the map's in the page, so it's drawn over the map and under whatever floats over it, and
  clicks go through it (`pointer-events: none`). Each banner hangs below its city's square as the camera sees it, from
  the lowest corner of the square's outline on the screen, under its middle, as the 2D map hangs one below its square,
  so the unit standing in front of the city and its flag stay clear of it. At every copy of the world the markers are
  drawn at (`markerSight`), short of where the haze hides the land, and faded as it thickens, as the land is; the
  lowest on the screen drawn last, over the rest, as the 2D map draws a lower row's over a higher one's
  (`banners.ts`).
- **The city's own name:** not drawn over a city with a banner. Where the interface paints none (the classic label,
  which hangs off the 2D map's city sprite), the city's name and size stand over it as before.
- **Hidden:** with the units (`t`), and with the yields (`y`) where the interface's banners give way to them, as on
  the 2D map.

**As built, second part (clicks and hovers):**

- **Clicks:** a click on a banner is for its city as well as the square under it, as on the 2D map
  (`mapSquares.ts`, `clickSquare`): its city opens, or the map centres on it, unless the square under the banner has a
  city, or units of the player's, which the click opens or offers as ever. A click on a banner past a pole the camera
  stops at, where there's no square under it, is still for its city.
- **Tooltips:** the mouse resting on a banner opens its city's tooltip over the banner, about its city's square, as on
  the 2D map: what your city's building, or else what's on the square, where the interface has square tooltips.
  Moving off it onto the land is a new hover, for the square under the mouse.
- **Which banner:** the banners as they were drawn the last frame, so what's on the screen is what's clicked. Of
  banners that overlap, the one drawn over the other (the lower on the screen) takes it. One more than half faded into
  the haze lets clicks and the mouse through to the land, as faded as it is. None with the units hidden (`t`), nor
  once its city has gone, nor while a square's being chosen for a long-range order, which takes the click as ever.
- **Still to do:** fading a banner whose city is hidden behind the land.

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

**As built (slice 2.3, first part: walks)** (`packages/map-3d/walks.ts`, `MapView3D`):

- **A walk** is a unit's steps, from where it stood (at its square's middle, or in front of its city's buildings, where
  cities are shown) through the middle of each square it steps onto, a city's too, to where it'll stand on the last. A
  unit's drawn walking as the latest patch has it, hurt in a battle say. Less motion asked for mid-walk ends every walk
  on the next frame. It's drawn as a marker of its own, its
  units alone, over the land at its feet, the short way round the world. Its figures face the way from one square's
  middle to the next, as a unit standing faces the way it last went, turning as it passes a square's middle, and from
  the way it faced when a step's joined. Its flag, ring and pointer go with it.
- **Along roads:** between two squares with a road drawn between them, a step follows it as it bends (§5.4,
  `Land#roadPath`): along the half the square it leaves draws, from its middle to the edge they share, and on along the
  half the square it comes to draws, to its middle. Where a railroad takes the way instead of the road, it follows the
  railroad's half, straight to the edge. Where only one draws a half (the other a city, say), it goes straight to or
  from the edge on the other's side; with neither, straight, as before. Aircraft fly straight over roads.
  - The points it passes are kept from the middle of the square it's going to (`via`), so they go a copy of the world
    round with it, and a step joined mid-bend keeps them.
  - It goes along them by distance, and faces the way it goes, turning from each piece's way to the next's as it goes
    along one, so it turns with no jolt. At a square's middle it turns from the way it comes in to the way it goes out,
    the short way round, one turn shared by both sides of the middle, so doubling back it never snaps half way round.
- **Aircraft fly an arc** (aircraft, helicopters and missiles, as the built-in set draws them: `airborne`):
  - A walk whose units all fly climbs as it sets off, over a step's way, to 0.3 over where they'd stand (`CRUISE`,
    about an aircraft's own height), and comes down over its last step's way to land at its end. A hop of one square
    goes half as high.
  - A step joined as it comes down climbs on from where it is. One setting off again from elsewhere mid-air sets off as
    high as it is.
  - Its figures, hit points' bar, flag, label and pointer climb (`ALOFT_PART`); its stand and the ring at its feet stay
    on the ground, so whose it is, and that it's active, show where it is. Its shadow falls on the land below.
  - It flies over the land at its feet, as a unit walking does, so over hills and mountains it rises and falls with
    them.
  - Nothing on the ground rides along with a walk that flies: it walks on its own beneath. An aircraft a ship carries
    rides with the ship, on the water, and flying on alone from where the ship's bound, takes off. An aircraft rides
    along with another flying only at the same height; otherwise it flies on with a walk of its own.
- **Ships** (`packages/map-3d/wakes.ts`, and `RIPPLES` in `markers/figures.ts`):
  - Drawn shown on top, and not in front of a city's buildings, a ship sits in two rings of ripples, ovals of foam round
    its hull just over the water, part of its own mesh, so they cost nothing and turn with it. A ship walking into port
    or out of it carries them over the shore till it's there.
  - Sailing, a stack with a ship in it, shown on top or carrying the one that is, leaves a wake: a point laid behind it
    every 0.04 of a square along its way, however few the frames, the newest following it, drawn as two lines of foam,
    one each side of its path, spreading out in a V, wide open half a square behind it however fast it goes, and
    thinning away over 1.2 s. A ship that's stopped, its walk over or no longer drawn (units hidden), lays no more, and
    its wake thins away, the frames going on till it's gone. Each wake's foam is made again every frame, and costs a
    draw call at every copy of the world in sight.
  - The foam's solid, just over the sea, so it's drawn with the land and the units, and the sea needs drawing in no
    other order round it. It lies at sea level wherever the ship is, so one coming into port doesn't lift its wake off
    the water behind it, and the land hides what lies over it. It's unlit, so where a line folds over itself on the
    inside of a turn, it's the same white.
  - With less motion asked for, or units moved at once, there's no walk and no wake, and wakes under way are gone at
    once.
- **Left off, not held:** rather than holding patches, a unit walking is left off every square it's on until its walk's
  over, when those squares are marked again. Whatever else a patch changes (a city captured, the land) shows at once. A
  unit that joins a stack under a stronger one walks there and disappears into it.
- **Waiting for its patch:** a walk over before the patch for its unit's last step has come, as when meeting a leader
  holds the patches until it's answered, stands where it ended, its unit still left off the squares, until it comes.
  The worker sends both squares of every move the player's view knows, just after the step, so the first tile for
  either queued after the step is that step's patch, and the unit's then wherever it puts it, sent home by the talks,
  say. One queued before it, for the step before, say, isn't. A held action's patches, a GoTo's steps', come together.
  It needs no frames meanwhile, and is drawn
  again as its units are (hidden, ringed, their size). Stepping on meanwhile, the unit walks on from where it stands,
  where that move's walked at all.
- **Pace, by the clock:**
  - It gets up to pace from standing and stops at its end. A step joined mid-walk goes on at the pace it's going, so a
    GoTo's steps, which come all at once, and a unit moved again before it's arrived, are one walk.
  - The player's own units take a quarter of a second a step; other players' units take half that.
  - However many steps, what's left of a walk takes no more than 2 s, or 1 s for others' units: a railroad trip of a
    hundred squares hurries, rather than queueing. It doesn't skip.
  - By the clock, not by frames: with no frames for a while, as in a tab out of sight, the first frame drawn again ends
    the walks that are over. A walk lets go of the squares it's passed as it goes on.
  - The world's tiles replaced, as by a square newly seen, which happens on most steps into the unknown, ends none of
    them.
- **Together:** units making the same step within 50 ms of each other, drawn at the same place as it was made, walk as
  one, as a ship and what it carries do, shown as a stack of them.
  - One that doesn't step on stays bound where it was.
  - One that steps on from where the walk's bound, ashore say, goes on along the way it came, from where it is.
  - One that steps from elsewhere sets off from where it's drawn, and a walk it was alone in is taken away.
- **Not walked:**
  - other players' units off the screen, unless they're walking already;
  - a unit the page doesn't have where it set off from, as one stepping out of the dark;
  - any unit, with reduced motion asked for, or no frames to draw.
- **Every unit's walk plays at once,** not one queue: as each is left off the squares it's on, no two can disagree.
- **The game waits** (second part): when the game chooses the next unit while the one that was active is still walking,
  its moves spent, the ring and the minimap's mark stay on that unit, and the camera where it is, until it's there:
  then they go to the next.
  - Unlike the design above, the next unit is chosen as before, at once, and the unit panel shows it: only what the
    map shows waits, so a unit's orders are never held up.
  - The active unit's own walk holds nothing: moved on and on, the camera follows it at once.
  - A key pressed, or the map pressed, while they wait ends that walk at once, so what it's for is shown where it is.
    Pressed on the map, the camera stays where the player's looking; a minimap click goes where it's clicked. A key
    typed in a field, a modifier alone, or a shortcut with Ctrl, Cmd or Alt doesn't.
  - Another chosen while the game would still offer the unit walking (`w`, a click) ends its walk at once too: the
    player's moved on from it. One boarding a ship is asleep aboard, so isn't offered, and the ring waits for it.
  - While they wait, whether a square's in sight is as the camera will look once they've moved on. The unit walking
    made active again, the camera's errand is dropped.
  - Others' walks hold nothing, nor do the player's other units' walks, as GoTos at the turn's start.
- **Options** (third part), under `?3d=1` only, read at each move:
  - **Units moving on the 3D map:** walk, walk quickly (twice as fast), or move at once (no walks);
  - **Show other players' units moving:** off, their units are on their new squares at once, unless they're walking
    already.
  - Either chosen as walks go on: moving at once ends them all on the next frame, as less motion asked for does.
- **Battles** (2.4, first part: `packages/map-3d/battles.ts`, `MapView3D`), by the clock, as walks are:
  - **The fight:** the attacker sets off from where it stands towards the square it attacks, gathering pace, to the edge
    between the two (`REACH`, 0.45 of the way between their middles), facing it: that's the blow, a fifth of a second
    in. Won, it goes back to where it stood in under a third of a second; lost, it fades away at the edge. The loser
    that stood fades away where it stood over 0.6 s, from the blow, as what was drawn there: the stack's size with it,
    as a stack dies with its defender outside a city or fortress in Civ1; what's left there, as in a city, is shown at
    once. The defender turns to face its attacker as the battle comes, as it did before. Walking quickly halves it all.
  - **A puff of smoke** (third part: `packages/map-3d/markers/puff.ts`) where the loser falls, from the blow, as it
    fades: where what fell stood, or at the edge, for an attacker that lost. Seven grey blobs, lighter and darker, burst
    out, rising and spreading, swelling at once to their biggest a quarter of the way through and shrinking away to
    nothing as the loser's gone, the middle one last. They're solid shapes made by code, as the figures are, not
    see-through smoke, so they're drawn with the land and the units, and neither the sea nor the cloud needs drawing in
    another order round them. Not with nothing drawn falling (units hidden), and not for a battle shown at once; a
    battle ended at once, as one before its blow is by a step or a key, takes its puff with it.
  - **Guns, catapults and bows** (fourth and fifth parts: `unitFire` in `packages/models-builtin/units.ts`, `Fires`
    and `FIRE_PACE` in `shots.ts`, `firePoints` in `markers/drawMarker.ts`, `muzzleOf` in `stage.ts`): an attacker
    with no clip to fight with whose look fires shoots from where it stands rather than lunging, as one that shoots in
    its clip does.
    - **Guns:** a cannon, artillery, a howitzer and a tank fire a shell (`SHOT_LOOKS.shell`). A warship fires one for
      each of its guns: a frigate's broadside, an ironclad's, a destroyer's and a missile cruiser's one, a cruiser's
      two and a battleship's three. Laid for a tenth of a second, then fired, a warship's 0.15 s apart, landing a
      little apart, with smoke and a flash at the muzzle and a burst with a flash where each lands. A shell leaves the
      front of the unit's figures, four tenths of the way up them, and a warship's leave along its hull from the bow
      back.
    - **Catapults:** an ancient or medieval siege engine, drawn as a catapult, lobs a stone (`SHOT_LOOKS.stone`, a
      rough grey stone, tumbling) from the top of its arm, wound for a fifth of a second, high over to the square
      attacked.
    - **Bows:** archers loose an arrow each, from in front of each figure at the shoulder, a quarter of a second in
      and 0.06 s apart, a ragged volley landing a little apart.
    - **Where from** (`FIRE_HEIGHTS`): worked out as the unit's drawn, from the box round its figures: a model's
      meshes, or the built-in set's figures alone, without their stand or a ship's ripples, which are one geometry
      with them. They're kept with the figures (`FIRES_FROM`), and the stage turns them to where the figures stand.
    - **The blow** falls as the first shot lands. Lost, the unit fades where it stands. It's the built-in look that
      says, whichever set draws the unit, as it is for whether a unit flies, so a hosted set's static cannon fires
      too; for one the page doesn't have yet, out of the dark, the type the battle names. A trireme, a sail, a
      submarine and a carrier still close in, as do aircraft, missiles, and soldiers with muskets and rifles, and units
      drawn with a clip of their own fight as their clip has them.
  - **Fading:** a unit's figures, stand and ring fade by leaving out a share of their points (`alphaHash`), drawn with
    the solid models; see-through, they'd be drawn before the sea, and a ship's hull fading would cut a dark hole in it.
    Its flag and labels, drawn after the sea and the cloud, fade as see-through.
  - **Left off, as walks are:** the attacker's left off its square, drawn on its own (a walker with a battle's id), till
    it's back. The square attacked isn't held: it's drawn with what was on it as the battle came, till the blow, the
    battle's patch notwithstanding, its city too, and then as the patch has it. What's kept is copied, as the page fills
    the objects it holds in place as patches come; units that come to the square meanwhile, as one built there, are
    drawn with them.
  - **Waiting for its patch:** the battle's patch, both squares, comes just after the event, as a step's does. If it's
    held, as meeting a leader holds patches, the winner stands where it stood once the battle's over, and the loser's
    left off, till it comes.
  - **Moving on** (#1334, `Battles#moveOn`): a step, or a key while the ring waits, before the blow ends the battle at
    once, as it did. After it, the loser falls and fades as it would, its puff and any shots in flight with it:
    - an attacker that won steps on, or stands where it fought from, there or on its square; it's drawn no more in the
      battle, no battle of its waits for the fall, and the ring goes on;
    - an attacker that lost, hurried, frees the ring, though it's still falling;
    - a unit that won defending goes on as it is, as the battle draws nothing of it.
    So the attacker's part ends as it moves on (`#attackerDone`), and the loser's when the battle's over. A battle that
    no longer holds its attacker doesn't hold the ring (`Battles#holds`); one it's still drawn in, falling, keeps it
    off its square (`Battles#attacking`). Those waiting for one moved on from, as a counterattack on the winner, start
    as soon as they can; one moved on from isn't ended when its attacker's battles fall too far behind, nor by another
    at its square ending, only told its blow, in order; and shots in flight land, but with units hidden.
  - **Together, mostly:** one figure can't lunge twice at once, so a battle waits for those whose attacker is one of its
    units: a unit attacking again, or attacked as it lunges (a counterattack as the player ends the turn just after
    attacking), stands on its square till its last is over. Others are fought at once, several at a square together, as
    a rival's attacks on a city come: the square's shown as it was till the first blow, and what fell in each fades
    alone. None starts before one that came before it at its square, as when that one's attacker walks there first, so
    blows there fall in the order the battles came. A unit's battles more than two seconds behind are over at once, the
    last fought, as the queue skips to the end above. An attacker attacking again is drawn once, in the battle it's
    fighting.
  - **As a rival's turn sends them:** the page's world is rebuilt, and the tiles released, once a frame while waiting
    for the turn (`GameState`), so a rival's step and its attack, an attack and its step after, or two attacks, can come
    before the world has the first's patch.
    - The attacker walking there: the battle's fought once it's there, its walk not cut short. One standing where it
      walked to, waiting for its step's patch, fights from there. One the page doesn't have there yet, stepping out of
      the dark or with others' moves not shown, is drawn fighting once it has, a frame later.
    - Another player's unit stepping on from its battle, as one taking the square it emptied, is on its new square once
      the battle's over.
    - A second attack on a square whose first battle's patch the world hasn't taken is fought on what the first left,
      its loser gone; once it has, on the world, as in the player's own turn.
  - **Ended at once:** before its blow, the player's own unit stepping (attacking, then moving in), the defender
    stepping, or a key or a press while the ring waits for the battle; and, whenever, moving at once or less motion
    chosen mid-battle: the blow falls, and it's over, with nothing left to fade. After the blow, a step or a key moves
    on from it ("Moving on", above). Those before it at its square whose blow's still to fall go with it, their blows
    first, so blows there still fall in order; those waiting for it start as soon as they can. Blows at a square keep
    their order whatever their paces, as when walking quickly's chosen between two attacks.
  - **The game waits:** the active unit attacking with its last move holds the ring and the camera till its battle's
    over, as its walk does; lost, till it's faded away.
  - **Not fought:** as walks aren't walked: with no frames, less motion asked for, or moving at once; two other players'
    battle with their moves not shown; one with both squares off the screen; one whose defender the page doesn't have
    where it fought. How it went is shown at once.
  - **Fading:** a marker fading has materials of its own, made from the kit's, so no other unit in its colours fades
    with it; under half solid, it casts no shadow.
- **Arriving or leaving with no move** (2.4, second part: `packages/map-3d/fades.ts`, `MapView3D`), by the clock:
  - **Which:** as tiles are taken, told against each square as it was marked when its tiles were released (its units as
    they were drawn, the one shown on top, and whether it stood in front of a city), and every unit marked anywhere or
    drawn walking or fighting then, as the game marks the active unit's square again before the frame takes them.
    - The unit shown on a released square that isn't drawn anywhere now (marked on another square, walking, fighting,
      or waiting for its patch, as a battle's loser does) has left with no move, as one disbanded, lost, or gone out of
      sight. One beneath it going goes unseen, as it was.
    - On a square that showed no unit, the unit on top now, if it wasn't marked anywhere, has arrived, as one built, or
      come into sight. One shown over another, a stronger one built where one stands, is there at once.
    - What each square's marked with is what's drawn there, as it was before a battle's blow too; squares marked other
      than as tiles are taken (a battle's blow, a walk's end, `t`) don't count, so a battle's loser, a walker arriving
      and a unit hidden don't fade.
  - **How:** one that's left fades out where it stood, drawn as it was shown, ringed if it was, the units gone with it
    its stack, over half a second; marked again within it, come back from the fog say, its fade out's over, and it's
    there at once, as it was being drawn; units hidden (`t`) within it, it's over too. One that's
    arrived fades in where it's marked, its unit alone, the city there solid (`Stage#fadeMarker`, the kit's materials
    back once it's solid), and isn't left off its square: another on top there, or it walking away, ends its fade.
    Walking quickly halves it.
  - **Not:** till the view's drawn once; off the screen; with less motion asked for or units to move at once, which also
    end fades under way; with units hidden, any but the active unit, the only one shown; more than eight in one batch
    anywhere, as a turn handed over or a stretch of the map coming into sight sends, which come and go at once; or a
    world replaced with most of it released at once, as an observer's change of view sends it.
  - A stack killed in a battle whose patch was held past the blow fades as the patch comes, the rest of it gone then.
  - Two other players' battle with their moves not shown is shown at once, but its loser fades out: a fade isn't a move.
- **Still to come:**
  - battles' rest (2.4): muskets and rifles without clips, a submarine's torpedo, aircraft as they fight, Civ2's
    rounds once they're sent (§8.1), a flash under reduced motion, a unit gone with its battle won (a missile) fading
    rather than going at the end, and another player's unit walking onto the square it emptied rather than being put
    there (#1255);
  - units that go while drawn elsewhere, walking or fighting, out of sight say, fade with neither (#1255).

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
  - two keys turn the view, and one returns it to north-up: `[`, `]` and `\`;
  - the 2D map's keys keep working;
  - the keys that move a unit (the arrows, Home, End, Page Up and Page Down, and the number pad) turn with the view:
    each moves a unit to the neighbour nearest the way it points, turned on the ground as the camera's turned to, so
    up moves a unit the way the camera faces. Seen from above, that's the way the key points on the screen; seen at a
    slant, the ground ahead is foreshortened and a diagonal key can look a little off. Unturned, they're the 2D map's
    own. On the hex grid, where up and down move nothing unturned, they move a unit once the view is turned to put a
    neighbour within a sixteenth of a turn (22.5°) of straight ahead or behind.
- **Following:** centring on a unit glides the focus to it. It's instant under reduced motion.
- **The sidebar:** squares under the sidebar (`setCovered`) count as off screen, so the active unit is kept clear of it,
  as on the 2D map.

- **As built (slice 1.2):** `packages/map-3d/camera/orbit.ts`, and `CameraInput.ts` for the mouse, the wheel and touch. The distance runs from 5 to 90 world units,
  24 by default, and a step of zoom brings the camera 1.12 times nearer. The haze starts at 1.2 times the distance and
  hides everything by 3.5 times it. The keys are `[` and `]` to turn an eighth of a turn and `\` to face north: none is a
  unit's order or one the numeric keypad sends (`mappedKey`). Two fingers on a touch screen also tilt the view by
  moving up or down together. The distance is kept in the `map3dDistance` option.
- **As built (2026-11-23, #1316): drawn back, it looks down.** Drawn back from a world, the camera used to see the world
  repeat into the distance, the copies' banners piling up along the horizon. Now:
  - **The haze:** it hides everything deeper along the way the camera looks than half the world round past the focus,
    the narrower way where it wraps both ways (`sightFor`, given the world's period). The haze is by depth, as
    three.js's fog is, so on the ground, looking down, it reaches further than half the world. Drawn right back on a
    world that wraps both ways, part of the next copy ahead shows faintly at the top of the view, and a world narrower
    than the view shows a copy at either side. The haze starts at 1.2 times the distance, or halfway to where it ends
    where that's sooner. A world so small that half of it is nearer than the camera ever comes (5) repeats wherever it
    looks, so it's seen as before.
  - **The lowest pitch:** 25° while the haze is as far off as close in, and higher as it's drawn in
    (`lowestPitch`), so the top of the view is as deep in it as close in: at the furthest, about 39° on a world 128
    round, or 52° on one 104 by 65 that wraps both ways. Drawn back, the camera looks down on the land rather than out
    to the horizon, as strategy games' cameras do. Brought in again, it looks down as it did until it's tilted.
    Stopping at the poles, or letting go of them, settles it again, as the world then repeats differently.
  - **The wheel** still zooms about the pointer where the camera looks down further as it draws back: the focus moves
    by as much as brings the ground back under the pointer (`CameraTarget#settle`).
  - What's drawn of a world drawn back is a fraction of what it was: on that world at the furthest and lowest, 4,488
    draw calls rather than 11,686.

### 9.2 Picking

- **A square:** a ray from the pointer meets what's shown there: the land, or the water's surface where the land is
  below it (the sea at height 0, a lake or swamp pool at its own). It's stepped against the land as it's drawn
  (`Land#surfaceAt`, since #1391), taken as no lower than the water, and refined. The point where it lands goes through `layout.tileAt`, then wraps.
- **A unit:** a ray that passes through a unit's bounding sphere picks the unit before the square.
  - As built (`markers/pickUnit.ts`, `Stage.unitAt`): the ray meets what's drawn of each square's unit (its figures,
    stand and ring, at every copy of the world drawn), and the nearest it meets picks that unit's square, before the
    ground. Units are drawn twice life size, and aircraft fly over their stands, so their figures stand over the ground
    of the square behind: a click, a GoTo's square or a tooltip there goes to the square whose unit it's on, as it's
    seen, even while the blink hides its figures (§6.3). A unit walking or fighting isn't picked. Nor is one further
    off than the land under the pointer (a hair past it, `LAND_SLACK`): one behind a hill or a mountain, which hides
    it, isn't picked through it.
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

**As built, first part (drawing units with a set's models):**

- **The manifest** (`packages/map-3d/models/modelSet.ts`): as above, and checked as it's read:
  - its licence, with the credit it asks for where it asks for one (`licence.attribution`, as a tileset's);
  - its credits, each naming the work, its author, a link and the licence;
  - its scale, the 3D map's squares to each of its models' units, which a model may set for itself;
  - each model's file, a glTF binary (`.glb`) beside the manifest: not the site's root, above the set, nor another
    site, nor with anything a URL reads as other than it says (`%`, `?`, `#`, a space or a control character);
  - each unit type it draws, by the engine's name for it, drawn by one of its models;
  - each plant it draws, where it draws any (`names.plant`, #1335): by the 3D map's kind (`PLANT_KINDS`: `conifer`,
    `broadleaf`, `palm`, `deadTree` and the rest), or a kind on a terrain of its own (`Jungle:broadleaf`, the terrain
    letters only), drawn by one of its models.

  A manifest that isn't one is refused, saying why, and the map draws the built-in set's figures.
- **Loading** (`loadModels.ts`): the stage fetches the manifest, then each model that draws a unit type or a plant, glTF
  binaries read with three.js's `GLTFLoader`. Only from this site:
  - each address is checked before it's fetched (`onSite`), a redirect is refused, and each model must be beside the
    manifest;
  - a model must be whole in itself (`selfContained`: its chunks read as three.js reads them, one JSON chunk and a
    binary one, as long as it says; no `uri` anywhere in it, its buffers and images as lists, and no extensions), and
    it's parsed from its bytes;
  - what it's loaded with refuses any address but what's in the file itself (`modelManager`: this site's `blob:`
    addresses and `data:` ones), so nothing else is fetched for it, whatever it says. Nothing's sent with what's
    fetched (no cookies).

  A model's parts are its meshes, each a geometry and a texture:
  - in its owner's colour where its material says (`extras.playerColour`), its texture's alpha the mask, as `rgb ×
    mix(owner, white, alpha)`. An owner's colour darker than `TINT_FLOOR` (a luminance of 0.08, in linear light) is
    mixed with white just enough to reach it (`ownerTint`), so black doesn't leave the model a flat silhouette. That
    lightens dark colours, not black alone: of the civilizations' own colours, the Zulus' near-black, the Americans'
    navy, the Carthaginians' and Romans' purples, the Malians' brown, the Celts' green and the Russians' dark red, and
    any saturated blue. The unit's flag keeps the colour as it is;
  - or cut out where its alpha is under a half (`alphaMode` `MASK`), both sides drawn;
  - from both sides where its material says (glTF's `doubleSided`), as a model made in Blender, which draws both, may
    need: a coat's single sheet, seen from inside.

  As each arrives, every unit of a type it draws is marked again with it (`UnitMarker.model`). Units of other types,
  and all of them till then, are the built-in set's figures. A set that can't be loaded is said once, and each model
  that can't be is said, its types left as they were.
- **Several sets:** the page gives the map its sets in order (`MapView3DDeps.models`), and each is loaded at once. A
  unit type is drawn by the first set's model for it: a later set's draws it till the first's arrives, or if the
  first's can't be had. Two sets may name a model the same, so each set's are kept apart by a key of their own
  (`modelKey`: the manifest's address and the model's name).
- **Drawn** (`MarkerKit.modelFigures`):
  - **Figures:** as many as stand for one unit of the type's look (D6), in its formation, merged in a mesh for each of
    the model's parts. So a unit is a draw call for each part, besides its stand: mostly one or two, and eight for
    the realistic Fighter and Helicopter.
  - **Size:** the set's size, or the model's own, times twice life size and the player's choice (§6.2).
  - **Where:** on the built-in set's stand, and behind its wall when fortified. A ship sits on the water in its
    ripples, with no stand.
  - **Colour:** `TintedMaterial` (`markers/tinted.ts`) mixes the owner's colour in. It's a class of its own, so a
    unit faded as it arrives or falls keeps its colour.
  - **Flags:** a unit's flag and labels stand over what the model reaches.
- **Asking for one:** `?models=` with a manifest's path on the site draws with that set instead of the ones that ship,
  for trying one out (`map3dModelsAsked`). It's read as the browser reads it, and taken only if it's a path on this
  site, however it's spelled.

**As built, second part (the sets that ship):**

- **0 A.D.'s ancient units** ([civ-clone/models-0ad](https://github.com/civ-clone/models-0ad), CC BY-SA 3.0, adapted
  from Wildfire Games' art):
  - 10 models, each drawing a unit type: Spearman, Archer, Swordman, Pikeman, Horseman, Chariot, Elephant, Catapult,
    Caravan and Trireme;
  - 2.7 MB in all, each a unit posed as it stands still, from one atlas (and a second for what's see-through).

- **Realistic units made for civ.one**
  ([civ-clone/models-realistic-cc0](https://github.com/civ-clone/models-realistic-cc0), CC0 1.0: generated with Meshy,
  and Meshy's community's):
  - 20 models, each drawing a unit type: Settlers, Warrior, Knight, Explorer, Sail, Crusader, Musketman, Rifleman,
    Cavalry, Dragoon, Alpine Troops, Partisan, Spy, Marine, Engineer, Bomber, Stealth Bomber, Frigate, Ironclad and
    Transport;
  - 7.6 MB in all.

- **Realistic units adapted from their authors'**
  ([civ-clone/models-realistic-by](https://github.com/civ-clone/models-realistic-by), CC BY 4.0, from Sketchfab, but
  for the Paratrooper, generated for civ.one under the canopy from Sketchfab):
  - 21 models, each drawing a unit type: Diplomat, Paratrooper, Fanatic, Mech. Inf., Cannon, Artillery, Howitzer,
    Tank, Freight, Nuclear, Cruise Missile, Fighter, Helicopter, Stealth Fighter, Galleon, Destroyer, Cruiser, AEGIS
    Cruiser, Battleship, Submarine and Carrier;
  - 7.9 MB in all.

  The realistic ones are reduced from far finer models, each to a few thousand triangles, with its colours baked into
  one texture (JPEG, 512 px for people and 1024 px for the rest), and a second, of up to 512 px, where a prop was put in
  (the Partisan's molotov, the Diplomat's hat, the Paratrooper's canopy, the Fanatic's torch). Each ship floats with its
  waterline at its origin, and each but the people has a scale of its own, so all sit beside each other and 0 A.D.'s
  units. Each takes its owner's colour on one part, such as a coat, a sail, a band along a hull or the wingtips: a
  second material says so (`extras.playerColour`) over the faces that take it, with a PNG at half the texture's size,
  grey where the colour goes, whose alpha is the mask. The Paratrooper, canopy and all, is as tall as the Knight.

  Each is a dependency of the renderer, pinned by its commit in the lockfile. One package here
  (`packages/models-hosted`) declares the three (`civ-clone.hostedModels`), and gives the page them in order, 0 A.D.'s
  first (`hostedModelSets`). No unit type is drawn by two.
- **The build** (`tools/lib/hostedSets.js`) copies each set's models beside the page as
  `dist/sets/<id>.<hash>.<name>.glb`, each as its manifest's SHA-256 says it is, and its manifest, naming them so, as
  `<id>.<hash>.json`. The hash is the manifest's, so the browser keeps them until the set changes. The set's files from
  before are removed by name, and the package is told where each manifest is (`modelSets.js`).
- **The page** draws with them under `?3d=1`, unless `?models=` asks for another.
- **The library** lists each, where the page asked for the 3D map, under Units on the 3D map. It says it comes with
  civ.one, its licence, linked, and the credit it gives (`licence.attribution`). Under it, a list the player opens
  names every work the set's made from (`credits`): each work linked, its author, and its licence, linked.

**As built, third part (clips, 2026-11-23): units walking.** A model may have a rigged copy that plays clips, beside it
in its set (plan 2.2). It's in the model's entry:

```json
"partisan": {
  "file": "models/partisan.glb",
  "rigged": {
    "file": "models/rigged/partisan.glb",
    "sha256": "…",
    "clips": { "idle": "idle", "move": "move", "fight": "fight", "die": "die" },
    "shots": { "fight": [{ "at": 0.5, "joint": "prop" }] }
  }
}
```

- **The rigged copy** is posed as the model stands (its bind pose), so the two can be swapped without a jump. It has
  one skeleton, at most four joints to a point, and no clip moves it off where it stands.
- **The roles** are `idle`, `move`, `fight`, `die`, `work` and `settle`. `clips` names the clip in the file that each
  role plays. `idle`, `move` and `work` loop; the rest play once, and `die` holds its last frame (`clips.ts`).
- **`shots`** say when, in seconds into a role's clip, a shot leaves, from which joint, and what it is (`kind`, since
  the sixth part: `bottle`, `arrow`, `bullet`, `shell` or, since plan 2.4's fifth part, `stone`, a bottle where it
  doesn't say). The map draws it flying
  from that joint to its target, as its kind flies. A shot may be given only in a role that has a clip. The set says
  what flies, as its model knows what it holds, not the unit's type.
- **`strikes`** say when, in seconds into a role's clip, its blow lands, hand to hand, where it lets nothing fly: the
  Fanatic's torch thrust, `"strikes": { "fight": 0.5 }`. Without one, the blow falls a fifth of a second in, which only
  a quick jab fits. Given only in a role that has a clip, after its start and no later than its clip's over (to a
  thousandth of a second, as a file keeps a clip's times in 32 bits).
- **Checked as it's read** (`modelSet.ts`): its file as a model's is, a name for each clip, each shot's time, joint
  and kind, of those the map draws, and each strike's time, over 0, in a role with a clip. A clip for a role the map
  doesn't play, as a later one may, is left out. One the map can't play is dropped, and its model's drawn as it
  stands, the rest of the set as it is.
- **Built** (`tools/lib/hostedSets.js`): copied beside the page with its model, as `<id>.<hash>.<name>.rigged.glb`,
  as its SHA-256 says it is, the manifest naming it so. The deploy keeps it for one more deploy, as it keeps the
  model (`setsAskedFor`).
- **Loaded** (`loadModels.ts`) once its model's drawing, with every check the model has. One that can't be had, names
  a clip its file hasn't, has a clip moving a node it can't find by name (as each figure's copy finds it), or a blow
  landing after its clip's over, is said, and the model's drawn as before.
- **Drawn:** a unit at rest is drawn with its model's parts, merged, as before, but for one idling near the camera
  (the fifth part, below). A walker, or a unit fighting or
  fading out, which the stage draws as one, is drawn with the rigged copy (`MarkerKit#rigFigures`): each figure a copy
  of its own, its skeleton its own, in its owner's colour as the model's are. Each part's bounds cover every pose its
  clips take it to (`boundClips`, since the fifth part), so it's drawn, and casts a shadow, only where it's seen. Each
  copy of the world's has a copy of its own (`copyOf`, with `SkeletonUtils.clone`), and
  its skeletons' textures are let go of as it's taken away (`letGoOfSkeletons`). Copies made afresh, as the copies of
  the world in sight change, are posed as the others were.
- **Walking:** as it goes, its figures play `move`, their legs keeping up with how far it's gone: a second of the clip
  for every two squares (`STRIDE`), so twice as quick as it's made at a player's quarter of a second a square, quicker
  for a rival's or a quick walk, slower as it gets going and stops. Each walk starts the clip from its start, and a
  squad's figures are 0.13 s apart. Waiting where it's come, or fighting, it stands as its model does, till `fight` and
  `die` are played. The Partisans' was the first; the Riflemen's, Musketmen's and Marines' followed, then the
  Explorers', the Spies', the Fanatics', the Warriors', the Engineers', the Alpine Troops', who glide on skis, and
  the Paratroopers', who swing with their canopies about their planted feet.
- **Since:** `fight` with its shots, and `die`, on the battles' own frames (the fourth part, below); and `idle`,
  with frames drawn for it (the fifth).

**As built, fourth part (clips, 2026-11-23): fighting and falling.** A battle whose fighters are drawn with rigged
copies is paced for their clips (`clipPace` in `battles.ts`), as the stage says what each plays (`Stage#rigFacts`): how
long each role's clip is, its shots, how many figures, and how far apart in a clip. A battle neither of whose fighters
has a clip to play is paced as before.

- **The attacker** plays `fight` from the start. Where its clip has shots, it stands where it is to shoot rather than
  lunging (`lunge` 0), and the blow falls as its first figure's first shot lands, the shot's time in the clip and its
  flight after (a bottle's 350 ms; each kind's since the sixth part). Where it has none, it lunges, and the blow falls
  when its clip says it lands (`strikes`), arriving at the edge of the square it attacks then, or a fifth of a second
  in, as before. In a battle twice as quick, the blow's half as far in, as its clip plays twice as quick. It's drawn
  till its last figure's clip is over, or the battle is.
- **The loser** plays `die` from the blow: the defender where it stood, or the attacker where it is, lost. It stays
  solid till its last figure has fallen (`falls`), then fades in its puff of smoke as before.
- **A squad's figures** are 0.13 s apart in a clip that loops, as walking, and each 0.13 s behind the one before in a
  clip played once (`poseFigures`), so none is ahead of the blow, and the battle waits for the last.
- **The Partisans' battle,** a throw half a second in and a fall of 1.5 s, takes 3.2 s won, against 0.8 s for a battle
  without clips; twice as quick, as the player can choose, its clips play twice as quick and it takes half as long.
  An attacker's drawn till its last shot has landed and burst, won or lost: lost with no `die` clip, it fades as it
  would, then is drawn as nothing till then. A unit's battles too far behind (§8.2) are over at once when they're more
  than two seconds behind, or two of the longest battle, the new one or one its units are in, where that's longer, so
  an attacker attacking again waits rather than cutting a long battle short.
- **Shots** (`shots.ts`): each figure's leaves the node its clip names (found as three.js names it, and checked as the
  clip's tracks are), as that figure's clip comes to it (by the battle's clock since the sixth part), from where the
  node is as the figure's posed then
  (`Stage#jointAt`, `jointOf`). It flies the short way to the square attacked, over the world's seam or not, in an arc
  (`SHOT_ARC`), landing by the loser's feet, a squad's a little apart (`SHOT_SPREAD`). Where it lands, it bursts in a
  puff of smoke of its own (`HIT_PUFF`, half a second). The Partisans' is a bottle, alight at its neck, tumbling end
  over end (`Stage#shot`). A battle ended at once takes its shots and their puffs with it. An attacker not drawn, as
  with units hidden (`t`) but for the one ringed, throws nothing that's drawn.

**As built, fifth part (clips, 2026-11-24): idling.** Units near the camera, with it close in, play `idle` where they
stand. The map used to draw a frame only when something changed; while units idle, it draws frames for them.

- **Which** (`idling.ts`): those on squares within 1.6 of the camera's distances of its focus, the short way round the
  world, on the screen or within half a square of it, with the camera 12 or closer. Those idling go on to twice its
  distance, a square and a half off the screen, and 14, so one at an edge doesn't swap back and forth; with none
  idling, none go on further. Further off, the
  motion's too small to see, and they stand as their models do.
- **None idle** with motion reduced, with units' moves not shown (Options), or without frames to play them in.
- **Drawn** (`Stage#idle`): a stack starts idling drawn afresh with its model's rigged copy, as a walker is, four at
  most a frame (`idleChanges`), the rest the next. Each is posed by the clock, each stack its own way into its clip
  (`idlePhase`), a squad's figures 0.13 s apart. One no longer near stands again, drawn with its model's parts, merged.
  One fading is left as it is till it's solid. Marked again while idling (its unit hurt, say, or the ring moving), it
  idles on, as far into its clip as it was. A rigged copy that arrives once its model's drawing tells the view again
  (`Stage#loadModels`), so units near the camera start idling then.
- **Frames:** while any idles, frames are drawn for them about 30 a second (`IDLE_FRAME`, timed by when the
  browser's frames begin), the screen's others passed over. Such a frame only poses them and draws the scene: the camera, the land, the banners, the minimap and the rest
  are as they were. One asked for meanwhile, by anything that's changed, is drawn whole at once. Once none idle, the
  frames stop. The blink's tick (§6.3) asks for one such frame too, as only its unit's figures have changed.
- **Bounds** (`markers/rigBounds.ts`): a skinned mesh's own are its bind pose's, worked out once, so rigged copies
  weren't culled at all: each was drawn wherever it was. A rig's are now worked out as it's loaded, from the model's
  stance and every tenth of a second of each clip, and a tenth more, and taken by its copies, so one off the screen
  isn't drawn, nor its shadow unless that falls on the screen, and a click tests a box before its points. They're worked out by its bones,
  not its points: each point a bone moves lies within a reach of it, as far as the furthest it moves lay from it as
  the model stands. That takes a few milliseconds a rig, where every point at every pose took a twentieth of a
  second.
- **What it costs** (an M2 Pro, a late-game save with every land unit drawn as the Partisans, 1,440 × 900): before
  bounds, every land stack drawn with its rigged copy took 20 ms of the main thread a frame, in sight or not. Now an
  idle frame takes 1.5 to 2.3 ms, with the camera at its closest and at 12, round the busiest stretch of units: about
  7% of the main thread at 30 a second, nearly all of it drawing the scene again. A whole frame there, the camera
  moving, takes 2 to 5.6 ms.

**As built, sixth part (clips, 2026-11-24): what flies.** A shot says what it is (`kind` in the manifest, above), and
each kind goes as it would (`SHOT_LOOKS` in `shots.ts`):

| Kind | Flies | Arc, each square | Drawn | Leaving | Landing |
|---|---|---|---|---|---|
| `bottle` | 350 ms | 0.25 | a bottle, alight at its neck, tumbling | | a puff, as a fallen unit's |
| `arrow` | 450 ms | 0.2 | a shaft and its head, pointing the way it goes | | a puff a third as big |
| `bullet` | 80 ms | none, straight | a bright streak trailing it, pointing the way it goes | a flash, and smoke a third as big | a puff a third as big |
| `shell` | 700 ms | 0.35 | a dark ball | a flash, and smoke most as big | a burst: a flash, and a puff 1.6 times as big |
| `stone` | 650 ms | 0.5 | a rough grey stone, tumbling | | a puff a little bigger than a fallen unit's |

- **Pacing** (`clipPace`): the blow falls as the first shot to land lands, each as long after it leaves as its kind
  flies, so a bullet that leaves after a bottle can land first. The battle's drawn till the last shot's puff is over
  (`shotOver`); the smoke where each left, 400 ms (`MUZZLE_PUFF`), is over before it.
- **A squad that loses,** with a `die` clip, falls at the blow, which a bullet can bring before its last figures have
  fired. Shots leave by the battle's clock (`Fighter.fought`), not the clip a figure plays, and each figure fights on
  till its own fall begins, a little behind the one before (`poseFigures`' `before`): so each fires what its clip has
  before the blow, from where it aims, and none what its clip has after (`shotsFired`). With no `die` clip, it fades
  as before, firing every shot.
- **Drawn** (`#placeShots`, `Stage#shot`, `Stage#puff`): each points the way it's going (`shotHeading`), the arc's
  tangent, but for a bottle and a stone, which tumble, and a shell, a ball. The smoke where it leaves a muzzle is
  timed from when it left, so a bullet that leaves and lands between one frame and the next still shows it. Its flash
  is solid and unlit, as the bottle's flame is: no see-through shapes, so nothing needs drawing in another order. A
  puff takes a size, and a flash.
- **The Partisans' bottle** goes as it did: none of its numbers changed.
- **Rifles:** the Riflemen, Musketmen and Marines have rigged copies since models-realistic-cc0 d1851f9d, and the
  Alpine Troops since its 9ce1b464, which needed nothing here. Each fires a bullet from its rifle's muzzle (`muzzle`,
  a node under its weapon) about half a second into its `fight`, the Marines three a sixth of a second apart, though
  Marines that attack and lose fire only the first, as the blow comes as it lands (`shotsFired`). Cannons fire once
  their models have rigged copies whose `fight` clips say so.
- **The Paratroopers' gun:** their rigged copies, since models-realistic-by 7fd50670, fire three bullets a sixth of a
  second apart from the hip, from 0.5 s into their `fight`, though, as the Marines, one that attacks and loses fires
  only the first. Their `muzzle` hangs from the chest joint, with no `prop`, which needed nothing here either: a
  shot's joint is found by its name (`jointOf`).

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
| Yields (`y`) | the 2D map's icons (the map's pack's own, or the interface's) standing in the world over each square, facing the camera, shrinking with distance (as strategy maps show them) |
| Hiding units and cities (`t`) | §6.3 |
| Target picking and long press | §9.2 |
| The unit menu on right-click (modern interface, #808) | the same menu, for the unit or square picked (§9.2) |
| Zoom, and its option | the camera's distance, kept per view |
| Changing the art mid-game | changing the model set hands the game over to a new page with it, as an art change that can't be made in place does (#1118) |
| Waiting for the next turn (`setWaiting`) | tooltips stay shut, as on the 2D map, which has no cursor or dimming of its own for it; the page's banner shows over either map |

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
  for screenshots in a browser at each slice, with the place it looks at kept in its address. With `?gallery=1` it lays
  out every unit type the built-in set names, rather than its seeded cities and units. Under `?debug=1`, a game
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
