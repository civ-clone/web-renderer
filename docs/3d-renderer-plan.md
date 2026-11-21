# A 3D map (WebGL): plan of work

2026-11-18. It builds what [3d-renderer.md](3d-renderer.md) specifies, with the decisions its §1 records (D1–D9).

Each slice is one PR, reviewed as every PR is:

- **Reviews:** a fresh agent with none of the context, plus Copilot for web-renderer.
- **Fixes:** Mediums and Highs are fixed before merging, and Lows become issues.
- **Release notes:** every commit on `main` is a release note, subject-only commits too (`toBullets` keeps the subject
  when there's no body). So until the 3D map is offered, each slice's message says plainly that it's work towards a
  3D map that isn't available yet, for example: 'Work towards a 3D map, not offered yet: units walk from square to
  square.'

---

## Prerequisites: gaps in what the page is told

Both of these are gaps today, apart from 3D. They're closed first.

### P1. City walls on the map (#688, #1069)

**Done:** #1170 (9fe998bb), with civ1-tileset-pixelart v0.2.2. Civ1's walls needed no new art: it draws them with the
fortified unit's frame, which the import already has.

- **The page** is told whether each city is walled, as the rules decide in the worker: Civ1's City Walls, or Civ2's
  City Walls or the owner's Great Wall. Your own cities carry it as AdditionalData, and rivals' stand-ins through
  `WorkerRules.walled`, kept up to date as buildings, Wonders and cities change hands.
- **The descriptor** gains an optional `cities.walls` overlay, which Civ1's map and the pixel art use.

This feeds the 3D view's `appearance` (spec D9): `walled` is the first piece of it.

### P2. Map events: who moved where, who fought whom

**Done:** #1173 (2736197d).

**Before it** [verified]:

- A move reaches the page only as two tile patches (`unit:moved` in `patchEvents.ts`).
- A battle reaches it only as a sound (`battle` in `battleEvents.ts`).

**The slice:**

- **The event:** a `mapEvent` message on the transport, `moved` and `battle` (spec §8.1). It's sent from the worker as
  the engine emits `unit:moved` and `unit:defeated`, before that move's patches flush.
- **Who's told:** a step or a battle the player could see: the player's own always, anyone else's between squares
  the player knows, one of them in sight. A watcher gets what their view sees: a player's or several players' view,
  as those players would; the whole map, everything.
- **On the page:** `GameSession` passes the events to the map view. The 2D view ignores them for now.
- **Tests:** a worker-client suite like the battle sounds' covers:
  - a move;
  - a move the player can't see;
  - an attack won and an attack lost;
  - a defeat that wasn't a battle;
  - a GoTo of three steps;
  - a unit that boards a ship.

If a later slice finds the patches already carry enough (a unit's id on both squares), P2 shrinks to the battle half.

---

## M0: foundations (nothing a player sees)

### 0.1 The `MapRenderer` seam

- **What changes:**
  - What `GameSession`, `InputController` and `ActiveUnitController` use of `MapView` becomes `MapRenderer`, and what
    everything else holds the portal for (the HUD, the reports, the unit panel, the city list, the game menu, the
    cheats, the city openers and the city screen's sizes) becomes `MapPortal` (spec §2.1).
  - The layer calls they make become methods on the view. The debug panel's layer handles stay the 2D view's own: it
    asks the view for its view modes.
  - `MapView` becomes `MapView2D`.
- **Proof that nothing changes:** the render-geometry fixture, `npm test`, and a game played in the browser on all
  three grids.

### 0.1b The map's input, shared

Split from 0.1, as its risk and its proof are different: the timing of events, not where calls go.

**Done:** `packages/widgets/lib/mapGestures.ts`: `Press` (the drag threshold and release speed), `Glide`, `WheelTurn`
and `Pinch`, each saying what to do in the page's px or zoom steps, with the zoom's step and range passed in, as the 3D
camera's zoom is its own (1.2). `GamePortal` drives them; `tests/ui/mapGestures.ts` checks them on their own.

- **What:** the input handling the 3D view will share is lifted out of `GamePortal` into a module of its own: the drag
  threshold, the glide, wheel steps, pinch and Safari's gestures.
- **Proof that nothing changes:** the `mapNavigation` and `zoom` suites, and a mouse, a trackpad and Safari's pinch
  tried in the browser.

### 0.2 The package, three.js and a lazy entry

**Done** (spec §2.4, "As built"): an empty, lit scene under `?3d=1`. `map3d.js` is 556 KB minified (140 KB gzipped),
and `frontend.js` grew by 1.7 KB. `packages/models-builtin` waits for its first use, the terrain table in 1.1.

- **Packages:**
  - `packages/map-3d` and `packages/models-builtin`;
  - three.js pinned to an exact version.
- **The entry:** a second esbuild entry, `dist/map3d.js`, exporting `createMapView3D(deps)`. The main bundle fetches it
  the first time a game starts in 3D (spec §2.4).
- **The gate:** `?3d=1`, plus a WebGL2 check. Without WebGL2 the game stays 2D and says why once.
- **Done when:**
  - a game under `?3d=1` shows an empty lit scene where the map was;
  - every window works;
  - `dist/frontend.js` hasn't grown by more than the loader;
  - `map3d.js`'s size is recorded in the PR.

### 0.3 Ground layouts

**Done:** `packages/map-3d/layouts`, tested by `tests/ui/groundLayouts.ts`. Beyond the tests below, it checks:
- each grid's sizes;
- that every corner is shared by four squares, or three hexes;
- that 20,000 seeded points out to a thousand worlds away, and points on edges and corners, are each given a square whose
  outline holds them.

A point exactly on an edge goes to either square, whichever the rounding gives.

- **What:** `GroundLayout` for `square`, `staggered-iso` and `hex-odd-r` (spec §3), with no three.js import.
- **Tests:**
  - round trips;
  - shared edges against `topologyFor`;
  - periods;
  - outlines against each 2D projection's outline once foreshortened, where it has one (isometric, hexagonal), and
    against the footprint's box on the square grid.

---

## M1: a map you can play on (behind `?3d=1`)

### 1.1 Relief and the land's mesh

**Done** (spec §4.1 and §4.2, "As built"): under `?3d=1`, a game shows its land on every grid: relief, the sea's floor
and a colour per terrain. It's built a few chunks a frame, from where the map is centred.
- **Code:** `packages/map-3d/terrain` (kernel, noise, relief, chunks) and `packages/map-3d/Land.ts`, with the terrain
  table in `packages/models-builtin/terrain.ts`.
- **Tests:** `tests/ui/relief.ts` and `tests/ui/chunks.ts`.
- **Colour:** one per terrain, blended by the same kernel as the height.
- **Squares never seen:** flat at sea level and dark. The cloud over them is 1.4's.
- **Speed:** an 80×50 world builds in 250–370 ms, 17–25 ms a chunk. A frame builds chunks until 10 ms have gone, but
  a chunk is built whole, so in practice a frame builds one: smaller chunks, or a chunk over several frames, are for
  M6.
- **`?debug=1`:** the stats overlay, and `window.civMap3DView` for the console.
- **Moved to 1.1b:** fixed seeds and a world on any grid without a game. Saved camera positions wait for the camera (1.2).

- **What:**
  - the height function (spec §4.1), with relief profiles from the built-in set's terrain table;
  - chunks;
  - wrapped copies;
  - unseen squares flat, under a plain cover.
- **Colour:** flat, one per terrain (no textures yet).
- **The debug page:** `?3d=1&debug=1`, with fixed seeds, saved camera positions and a stats overlay (spec §12), for
  screenshots at this slice and every one after.
- **Tests:** determinism, seams and `Unknown`.
- **Done when:** a Civ1 world on each grid shows its land from a fixed camera.

### 1.1b The debug world page

**Done:** `dist/map3d-debug.html`, served beside the scripts (open it as `/dist/map3d-debug.html`), and published with
them. A form on the page sets `grid`, `width` and `height` (up to 160), `seed` and `seen` (0 to 1). The arrow keys move
the square it's centred on, which the address keeps as `x` and `y`, so a reload or a link shows the same place.
Building another world from the form starts it in the middle again.
- **Code:** `packages/map-3d/debug`: the page, its script, its options, and `generateWorld.ts`. That makes a world with
  about two fifths land, ice at the poles, hills, mountains, rivers, and terrain by latitude and wetness. It isn't the
  engine's generator.
- **Tests:** `tests/ui/debugWorld.ts`. It also checks the land over a debug world builds every chunk once, the nearest
  to the map's centre first.

- **What:** a page that builds a generated world on any grid (`square`, `staggered-iso`, `hex-odd-r`), with no game,
  from a seed and a size in its address, and draws it with the 3D map. It's for screenshots and for trying the grids a
  game can't start on yet (the isometric grid needs Civ2's art to start a game).
- **It has:** the stats overlay, and every square seen, or as much as asked, round the world's middle.
- **It doesn't:** start the game's worker, or load the 2D art.

### 1.2 Camera

**Done** (spec §9.1, "As built"): the camera's maths, the keys, centring, and the mouse, the wheel and touch.
- **The orbit:** `packages/map-3d/camera/orbit.ts`, with no three.js. It holds the yaw, pitch and distance, the presets
  (not offered yet: no key or menu chooses one), a ray from the screen to the ground, and dragging that keeps the ground
  under the pointer. Tested at every yaw and pitch by `tests/ui/orbit.ts`.
- **What the view does:**
  - centring on a square glides the camera there: at once the first time, as a game starts or loads, anywhere
    further than about the camera sees round its focus, and under reduced motion;
  - the camera stops at the poles when the player asks the map to (`lockVerticalEdges`);
  - it follows the land's height under the focus, eased, so it doesn't jolt over hills;
  - the world's copies follow the camera: every copy the haze doesn't hide is drawn, however far it sees;
  - the haze, and how far the camera sees, follow its distance.
- **Keys:** through `InputController`, as the zoom keys are. `[` and `]` turn the view an eighth of a turn, and `\`
  turns it back to north, or the keys where those are on a US keyboard, for layouts that type them with AltGr. `z` and `x` zoom. A 2D map ignores the turn keys.
- **The keys that move a unit** turn with the camera (`MapRenderer#heading`, `turnedDirectionKeys` in
  `packages/client/lib/unitActionKeys.ts`, the ways from `layouts/directions.ts`): each moves the unit to the neighbour
  nearest the way it points, turned on the ground as the camera's turned to, mid-turn too. The 2D map has no heading,
  so its keys are its own. Tested by `tests/ui/turnedKeys.ts` on all three grids at every 2.5° of turn.
- **The mouse, the wheel and touch:** `packages/map-3d/camera/CameraInput.ts`, on the shared gestures (0.1b):
  - a drag keeps the ground under the pointer, and a flick glides on, unless the player asked for less motion;
  - the middle button, or the main one with Alt, turns and tilts; the right button is left to the unit's menu;
  - the wheel, or a trackpad's pinch, zooms about the pointer, in the 2D map's steps and pauses;
  - two fingers pinch, twist and tilt, and Safari's trackpad gestures pinch and twist.

  Tested by `tests/ui/cameraInput.ts`.
- **Its distance** is kept as an option of its own, `map3dDistance` (0 until the player zooms), as each set's zoom is,
  and kept within the camera's range whatever's stored.

- **What:**
  - orbit, pan with glide, zoom on the shared wheel steps, turn and tilt;
  - the three presets;
  - the north-up key;
  - pinch and twist.
- **Keys:** chosen against the key table, so they don't clash with unit orders.
- **Following:** `centre()` and `setCovered`.
- **Zoom:** the camera's distance, with its own option, kept as the 2D map's zoom is (spec §11).
- **Reduced motion:** no glide.

### 1.3 Picking and input

**First parts done:**
- **Picking's maths:** `packages/map-3d/camera/pick.ts`. A ray from the screen is stepped through the band of heights
  the land can be in, and halved down to where it first meets the land, or the sea's surface over land below it.
  Tested at every yaw and pitch over a known height function (`tests/ui/pick.ts`), with a ridge in the way, and the sea.
- **Markers:** `packages/map-3d/markers`. A city is a cluster of buildings, more as it grows, with its owner's colour on
  their roofs, a wall if it's walled, and its name and size over it ("!" in disorder). A unit is a pawn in its owner's
  colours, the active unit if it's in the stack or else the best defender, with a pennant giving the stack's size, and
  a ring under the active unit. `t` hides all but the active unit. Colours are the civilization's `colors` attribute.
  The debug page puts seeded cities and units on its world.
- **What's on the screen:** `isVisible` projects a square's middle to the screen, `margin` squares and half a square in
  from its edges, and not under what floats over the map (`measureCovered`), so the game brings the active unit into
  view as on the 2D map.
- **Clicks, held presses and right-clicks** do what they do on the 2D map, through the page's own handling
  (`packages/game/lib/mapSquares.ts`, which `GamePortal` uses too): open a city, choose among the player's units there,
  or centre on the square; the unit's menu; and choosing a square for a long-range order.
- **Tooltips:** the mouse resting on a square opens its tooltip, or its city's, after a moment, as on the 2D map, through
  the page's own; a key, a press, the camera moving or the other players' turns close it.
- **Banners:** a city's banner takes clicks and hovers of its own, as it hangs past its square on the 2D map (spec
  §7.5, "As built, second part").
- **Still to do:** waiting's cursor (the page's, not the map's).

- **What:**
  - a ray to what's shown, then to a square: the land, or the water's surface where the land is below it (spec §9.2);
  - clicks, long presses and target picking;
  - hover tooltips with the 2D map's content;
  - `isVisible` with covered rectangles;
  - `MapPortal`'s `openCity`, `setCenter` and `render`, and the city screen's sizes from the 2D art;
  - hiding units and cities (`t`), and waiting for the next turn (`setWaiting`), as on the 2D map: a city's buildings,
    laid with the land, stayed at first. Since 4.1, `t` lays the land again without the towns, to show the terrain,
    and each chunk keeps both, so pressing it again only swaps them, till what's laid on it or the land near it
    changes.
- **Tests:** picking at every yaw and pitch over a known height function, the sea at 0 and a lake at its own height,
  including a square under water at a low pitch.
- **Done when:** a whole turn can be played by mouse and keyboard, with units and cities drawn as plain markers.

### 1.4 Water, light and sky

**First part done:**
- **The sea:** `packages/map-3d/water.ts`. One surface at height 0 under the camera, drawn wherever the land is below it.
  How deep the water is comes from the land's own heights, which each chunk writes into a texture the size of the ground
  as it's built; the texture repeats as the world does. Teal over the shallows, deep blue out at sea, foam where it
  meets the land, the sky in it at a low angle, and the sun's glint.
- **Shadows:** the sun casts one shadow map, fitted round the camera's focus as it moves and zooms. The land shadows
  itself, and markers cast shadows on it.
- **Cloud** over the squares never seen (§4.5): a layer just over the land, reading which points are unseen from the
  same texture, softened over a short edge and broken up by noise. No water is drawn under it.
- **Still to do:** the sky and its environment map, waves (they need frames all the time: for the quality presets,
  M6), lakes at their own height, and the cloud clearing as squares are seen (it goes at once).
- **Cost:** at the default distance, about 1,500 draw calls and 3 million triangles a frame on an 80×50 world, more
  zoomed out: each marker is several meshes, and the land and markers are drawn at every copy in sight, and again
  for the shadows. Instancing the markers and coarser distant chunks are for M6.

  Since then (#1204), a unit's figures, stand and wall are one mesh, and a city's buildings and walls are one: on the
  populated debug world, 1,285 draw calls a frame at the default distance, from 2,181. The kit lets go of the city
  labels and buildings no marker uses, which grew with every size a city reached.

- **What:**
  - the sea surface with depth tint and shore foam;
  - a sky made by code, with its environment map;
  - the sun with one shadow cascade;
  - tone mapping.

### 1.5 The minimap's view outline

**Done:** `packages/map-3d/minimap/Minimap3D.ts`, the 3D map's own overview on the page's minimap canvas, drawn on the
ground rather than the grid: each square is its outline (`GroundLayout`) in its terrain's colour, so one overview serves
every grid. Dots for cities and stacks in their owners' colours, the unit awaiting orders, and the four-sided patch of
ground the camera sees at each copy the overview shows. A click moves the camera there. Drawn again only when squares
change, and its patch each frame the camera moves. Tested by `tests/ui/minimap3d.ts`.

- **What:**
  - the 3D view keeps a 2D overview of its own, fed the same tile updates as its map;
  - the minimap marks the four-sided patch of ground the camera sees, in place of the box it works out today (the
    square grid's from `rawVisibleRange()`, the isometric and hexagonal grids' in `StaggeredMinimap.viewport()`);
  - a click on the minimap moves the camera's focus point.

**M1 is done when** a Civ1 game can be played start to finish under `?3d=1` on every grid, with markers for units and
cities.

---

## M2: units

### 2.0 Licence survey (in parallel with M1)

**Done:** [3d-art-survey.md](3d-art-survey.md). Animals, ships, tanks, ground textures and temperate plants are well
covered. Many Wonders have real-monument scans. The gaps:
- realistic soldiers that come with their own clips. The route is CC BY soldiers retargeted with CC0 and CC BY motion
  data;
- archers, paratroopers and civilians in period dress;
- a catapult;
- Wonders: 9 of Civ1's 21 have no candidate, and 13 of Civ2's 28.

Three sources needed a decision, and I've allowed all three, each credited:
- CMU's motion capture and NASA's models, whose terms are permissive but not CC0 or CC BY;
- a CC0 aircraft series, much of it made with AI.

Some CivFanatics modellers are leads that need written permission: their models can be tried locally, but aren't
committed or deployed until I have it. Before use, check whether the soldiers' rigs embed
Epic's UE4 skeleton or only match its bone names.

- **What:** realistic (D2), not stylised, CC0 and CC BY glTF models for people, animals, ships, vehicles and aircraft,
  with rigs and the clips the spec names, and for Wonders and landmark buildings. Also textures and plants.
- **Where to look:**
  - the usual CC0 and CC BY libraries;
  - modellers on CivFanatics who offer their work free to use. Their models need a licence, or permission in writing,
    that allows hosting.
- **Each file's licence is checked,** as was done for the hex art. The result is a table in the PR, as for D3: each
  model's author, licence, link and the attribution it asks for.
- **Nothing is fetched into a repo** until a pack has passed.
- **Credits:** with the first third-party model comes an art credits list in the game, beside the library's
  per-set licence (D3).

### 2.1 The model set and the built-in units

- **What:**
  - the `models` manifest kind (spec §10) and its validator;
  - the built-in set's placeholder units, by domain, made by code: figures, ships, vehicles, aircraft. Units' own models
    come from CC0 or CC BY sets (D3, 2.2 and 6.4);
  - the owner's colours;
  - formations (D6), and stacks shown by their defender (D5);
  - flags, with the veteran mark, the count, hit points, sentry and orders;
  - the active unit's ring, following the marker option.
- **Tests:** a test checks that every unit type Civ1 and Civ2 name has a model.
- **First part, the built-in units:**
  - `packages/models-builtin/units.ts` says what each of Civ1's and Civ2's unit types looks like: its shape (on foot,
    mounted, an elephant, a cart, siege, a vehicle, a ship, an aircraft, a helicopter, a missile), its era's kit, what
    it carries, its hull, and how many figures stand for it. A type it doesn't know is drawn by its kind (`Naval`,
    `Air`).
  - `packages/map-3d/markers/figures.ts` makes each look from plain shapes in the owner's colours, merged into one
    geometry, life size unless the player chooses otherwise in Options (half to half as big again).
  - A unit stands on a stand in its owner's second colour (a ship rides the water without one), behind a low wall when
    fortified. Its flag flies over it, with the stack's size, the 2D map's letter for what it's busy with, a veteran's
    star, and a bar for its hit points when it's hurt.
  - The debug page lays out every unit type with `?gallery=1`.
- **Facing:** a unit faces the way it last moved, or attacked, from the map's events (P2), and a defender faces its
  attacker.
- **Still to do in 2.1:** the `models` manifest kind and its validator; the ring following the marker option.

### 2.2 glTF and skeletal animation

**First part, static models: done** (spec §10, "As built"). A set of models, its manifest's path on the site given as
`?models=`, is loaded as the game starts. Each unit type it has a model for is drawn with it once it arrives: the
model's parts in their owner's colour, the squad merged in each, on the built-in set's stand. The rest are the built-in
set's figures. Posed as they stand still: no clips yet.

**Second part, the first set: done.** 0 A.D.'s ancient units ship with civ.one: under `?3d=1` the map draws the 15 unit
types they have models for with them (Knight, Explorer and Sail by stand-ins), and the library lists them with their
licence and credit. Still to do:
- **More sets:** the eras 0 A.D. doesn't reach;
- **Clips:** idle, walk, attack, death;
- **Squads:** instancing them;
- **Textures:** KTX2.

- **What:**
  - loading `.glb` with KTX2 textures;
  - `AnimationMixer` clips and the fallbacks;
  - instancing for squads.
- **The first hosted pack** that passed 2.0 is wired in, as a hosted set in the library.

### 2.3 Pacing and moves (needs P2)

**First part, walks: done** (spec §8.2, "As built"). Units walk from square to square over the land, a GoTo's steps as
one walk, by the clock. Other players' units walk only on the screen, twice as fast. Long walks hurry. Units stepping
together, as a ship and its cargo, walk as one.

**Second part, the game waits: done.** The ring and the camera wait for the unit that was active to finish walking
before going to the next unit, which is chosen at once as before; a key or a press for it ends the walk.

**Third part, the options: done.** Under `?3d=1`, Options has how units move (walk, walk quickly, or at once) and
whether other players' units are shown moving.

**Fourth part, paths: done.** Aircraft fly an arc, climbing off their stands and landing at the walk's end. Ships sit
in rings of ripples out at sea, and leave a wake of foam as they sail, spreading out in a V and thinning away. Walks
follow roads as they wind (3.4), from one square's middle along its half to the edge, and on along the next's.

- **What:**
  - the shown state and held patches (spec §8.2);
  - GoTo steps joined;
  - rivals' moves on screen only, with a backlog cap;
  - the animation speed option, and whether to show rivals' moves;
  - reduced motion;
  - the game waiting for the queue.
- **Tests:** the pacing suite.

### 2.4 Battles

**First part, the fight: done** (spec §8.2, "As built"). The attacker lunges to the edge of the square it attacks
and goes back, or fades away there if it lost; the loser fades away where it stood, its stack with it. Till the blow,
the square attacked shows what was on it. Battles at one square are fought together; a unit attacking again, or
attacked as it lunges, waits for its last. Rivals' battles that come together in a burst are each shown. The ring and
the camera wait for a battle the active unit fought with its last move.

**Second part, arriving and leaving: done.** Units that arrive or leave with no move, built, disbanded, lost, or going
out of sight or coming into it, fade in or out over half a second.

**Third part, a puff of smoke: done.** Where the loser falls, a puff of grey smoke bursts out from the blow, rising and
spreading as the loser fades, and it's gone with it. Fading units are dithered rather than see-through, so a ship
fading cuts no hole in the sea. Still to do: ranged units firing, ships and aircraft as they fight, Civ2's rounds, a
flash under reduced motion, and #1255's follow-ups.

- **What:**
  - melee, ranged, naval and air;
  - rounds under Civ2;
  - death and fading;
  - fading in and out for units that arrive or leave with no move.

---

## M3: depth on the land

| Slice | What |
|---|---|
| 3.1 | The surface's materials: texture arrays, blend weights, slope and height rules, triplanar rock, snow, wet sand. CC0 textures if 2.0 found them, otherwise made by code. |
| 3.2 | Vegetation: scatter tables, Poisson spacing, instancing per chunk, impostors, wind; forest, jungle and swamp first. |
| 3.3 | Rivers: splines, channels cut into the land, flowing water. |
| 3.4 | Improvements: roads, railroads, irrigation and Farmland, mines, Fortress and Airbase, pollution and fallout; specials and huts. |
| 3.5 | Clouds over unseen squares, which clear when a square is seen. Squares not in sight are dimmed under rules that say. Grid lines and the hover highlight. |

**3.1, first part: done.** The surfaces' detail (spec §4.3): each terrain has a surface (grass, plains, sand, rock, snow, forest floor, mud, tundra), blended across squares as its colour is, and drawn as a texture made by code over the land's colour, with its bumps and roughness, tiling with the world. Rock on steep slopes, snow on the tallest peaks, more towards the poles, and wet ground at the waterline: done too. Still to do in 3.1: rock mapped from three sides, as mountains' steepest sides stretch a texture laid flat about 1.4 times.

**Ranges: done.** Mountains side by side are joined, as Civ1 joins them (spec §4.1): a ridge runs from each peak to
its neighbour's, across an edge or a corner, dipping to a saddle between them, so a chain of mountains is a range and
a block of them a massif, not a grid of cones. Hills already run into one another, as their relief is blended.

**3.2, first part: done.** What grows is laid with the rest of the overlay, from the built-in set's table (`packages/models-builtin/vegetation.ts`):
- forests' trees are conifers towards the poles and broadleaf towards the equator;
- jungle has broadleaf and palms, swamps reeds and dead trees, and grassland, plains, tundra and hills bushes, shrubs and scrub;
- deserts and mountains get rocks, and deserts a cactus or two.

Plants are scattered by seed, each where it has room. They stay clear of a unit's stand, roads, mines, huts and specials, and off a city's lot and cleared ground (fields, a fortress, an airbase). A tree is a handful of low-sided shapes. Still to do in 3.2: instancing, impostors at a distance, and wind.

**Woods: done.** Forest, jungle and swamp grow as one canopy across their squares, as Civ1's forests run together (spec §5.1): trees stand at the points of a lattice over the whole ground, whole across the edge to the same woods and thinning to a fringe at the edge to other ground, so a forest is a wood rather than a clump on each square. An all-forest chunk is 48,000–58,000 triangles and 35–50 ms to lay, a few squares a frame.

**3.4, first part: done.** What's laid on the land is made by code (`packages/map-3d/overlay/`), one vertex-coloured mesh a chunk, so it costs a draw call a chunk:
- roads and railroads are draped over the land, joined to their neighbours as the 2D map joins them, along the topology's directions, and at the nearest copy across the world's seams. Roads wind like country lanes, each half bowing its own way and meeting its neighbour's at the edge; railroads are straight;
- irrigation and farmland are rows of crops with ditches; pollution is a dark smear;
- mines, fortresses, airbases, specials (`packages/models-builtin/specials.ts`, every feature Civ1 and Civ2 name) and huts are small solids, standing clear of a unit's stand;
- a chunk's overlay is made again with its land, or when what's laid on a square in it or next to it changes. A unit moving changes nothing laid, so it remakes nothing, and a road built rebuilds no land. Chunks are made nearest the camera first;
- it's draped over the land as drawn (the chunks' flat triangles), so it never sinks into a hill, and read from the chunks' points, which also makes it cheap: about 15 ms a chunk on a populated world;
- a unit's stand is thick enough to stand over all of it, and fields fit inside their square, whether a square, a diamond or a hex;
- a city's lot has nothing laid on it, as the 2D map's city covers its square;
- a square's mine, specials and hut each claim a spot clear of its roads, a fortress's walls, an airbase's runway and each other, and plants keep clear of all of them. Where there isn't room for that (roads all eight ways, or inside a fortress's walls), each takes the spot with the most;
- a chunk's overlay is made a few squares a frame within the frame's budget, so no frame waits on a busy chunk. A square changed before its chunk's make reaches it is read when it gets there, without beginning again;
- with the view stopped at the poles of a world that wraps over them, a first or last row's overlay that reaches past a pole is drawn a period round too, clipped there, where the land between the far row's squares is its own.

Still to do in 3.4: improvements as models from a hosted set, and Fortress and Airbase models that read better from afar.

---

## M4: cities

### 4.0 Ages for every player, and `appearance` (D9, building on P1's `walled`)

- **What:**
  - each player's age, as AdditionalData, rivals included;
  - each city's landmarks, decided in the worker by each rule set's own hook;
  - Wonders for your own cities.
- **Follow-up:** rivals' Wonders.
- **Civ1's era:** from the owner's advances, by the tiers the ages and research-cost sets share. That may mean lifting
  `lib/advanceTiers` out of `civ1-enhanced` into a package the worker can use.
- **Civ2's era:** from its style.

### 4.1 Sprawl

- **What:** the area, streets, lots, growth and modernising, as pure functions with tests (spec §7.2), drawn as plain
  blocks first.

**First part, the city's own square: done** (spec §7.2, "As built"). A city is laid with the land round a paved plaza,
with streets out to the roads that come in and to its quay, and houses lining them on lots that fill in as it grows,
seeded from the city, so it keeps its buildings as it grows. They stand inside its walls, clear of a unit in front.
Its marker keeps its walls and name.

**Second part, neighbouring squares: done** (spec §7.2, "As built"). From size 4, a city's houses spill onto the squares
round it, further each size up to 15, lining the roads into town and thinning outward. Each square lays them itself,
from the city beside it, on land that isn't the sea, mountains, a mine, a fortress or an airbase. Fields give way to
them, and trees keep clear.

Still to do: worked squares further out, side streets, eras and modernising.

### 4.2 The building kit

- **What:**
  - buildings made by code for each era;
  - landmarks for your own buildings;
  - the palace;
  - walls with gates;
  - docks;
  - styles for each civilization where the set has them.

### 4.3 Banners and states

- **What:**
  - city banners on the overlay canvas, by depth, stacked where they overlap, as the 2D map stacks them;
  - disorder, celebration, captured and destroyed;
  - yields over squares (`y`).

**Banners, first part (drawing): done** (spec §7.5, "As built"). The interface's own banners, as the 2D map draws
them, painted by the page one city at a time and hung below each city's square on a canvas over the map, the lowest
on the screen over the rest, at every copy of the world in sight. Hidden with the units and, where they give way to
them, with the yields.

**Banners, second part (clicks and hovers): done** (spec §7.5). A click on a banner is for its city, and resting on one
opens its tooltip over it, as on the 2D map. Still to do: fading those hidden behind the land, and the states
(disorder, celebration, captured and destroyed) on the map itself.

**Yields (`y`): done.** The 2D map's icons for what each square yields (the map's pack's own, or the interface's) stand
in the world over each square's middle, as strategy maps show them, rather than on the screen:
- **Laid out** as the 2D map lays them in its tile (`tileYieldGrid`: two rows, more columns the more there are), in a
  block that fits the circle inside the square, so it stays within the square from above however the camera's turned
  (`packages/map-3d/yields.ts`). The lower the camera looks, the smaller the blocks are (by the sine of its pitch),
  so they still fit their squares.
- **Drawn** as one instance each of a quad that faces the camera, upright on the screen, its size in the world's units,
  so the icons shrink with distance as the land does, down to dots far out, on every square in sight, at every copy of
  the world (`packages/map-3d/yieldIcons.ts`). One draw call for each copy, faded by the haze.
- **Hidden** by what's in front, as the land is, but drawn as if 0.6 nearer the camera than they are, so what stands on
  their own square (its trees, its unit, its city) and its slope don't bury them.
- **The art** is the page's (`yieldIcon`), as the 3D map's script keeps none of its own: drawn into an atlas, each icon
  in a cell with room round it, crisp up close and smoothed smaller.
- **Cost:** each square's icons are laid out once and kept until its land or yields change, so drawing them again after
  a change costs well under 1 ms on an explored 80×50 world. The first time they're shown, laying them all out takes
  about 16 ms.

**M4 is done when** every row of spec §11 is in the 3D view but one: changing the art mid-game, which comes with model
sets in 6.4.

---

## M5: Wonders

### 5.1 Sites

- **What:** the placement policy (spec §7.6), keyed on the city and the Wonder, with its tests:
  - deterministic;
  - stable as the city grows;
  - never on water unless the Wonder's site is `harbour`;
  - your own cities' Wonders; rivals' follow (D9).

### 5.2 Models

- **What:**
  - Civ1's 21 Wonders from CC0 or CC BY models (D3, through 2.0's survey), each with a plain placeholder made by code
    until one is found;
  - the Great Wall along the edge of the city's area;
  - the coastal Wonders: Colossus, Lighthouse, Magellan's;
  - ruins for a Wonder lost with its city;
  - then Civ2's.

---

## M6: realism and speed

| Slice | What |
|---|---|
| 6.1 | Light: cascaded shadows fitted to the view, haze and aerial perspective, SSAO on High, choice of tone mapping. |
| 6.2 | Quality presets, the first-game benchmark, the stats overlay; the budget (spec §9.4) measured on a Civ2 large map. |
| 6.3 | Speed: building meshes and scatter in a worker if the main thread misses frames; level of detail on far chunks. |
| 6.4 | Art: hosted model sets in the library, each under its own licence, chosen over the built-in set's placeholders (spec §10); licences and attribution shown on each set and in the art credits list. Changing the model set mid-game hands the game over to a new page (spec §11). |

---

## M7: offering it

- **What:**
  - Options gains **Map: 2D or 3D**;
  - `?3d=1` is removed;
  - a switch mid-game hands the game over to a new page with the other view, as an art change that can't be made in
    place does (#1118, #1144).
- **Docs:** README, quick start and `docs/frontend-ui.md`.
- **Release notes:** written for players.

---

## Order and what runs alongside

- **Done:** P1, P2.
- **Now, in parallel:** 0.1 (the seam), and 2.0 (the licence survey, which is research).
- **Then, in order:** 0.1b (the input), 0.2 (the entry), 0.3 (layouts), then M1. 0.1b can run beside 0.2 and 0.3,
  which don't touch `GamePortal`.
- **After M1:**
  - M2, whose 2.3 needs P2;
  - M3, alongside M2.
- **Then:** M4, whose 4.0 needs D9's ages; M5; M6; M7.

- **Other sessions:** a slice that touches the rule packages or the tilesets (P2, 4.0) is told to the Civ2 session
  first. The engine and asset releases follow the usual release check: commits on master that aren't ours mean asking
  their session first.

## Risks

- **Bundle size:** a minimal scene with three.js, its glTF and KTX2 loaders, shadows and post-processing is 759 KB
  minified, 199 KB gzipped (spec D1), against today's 296 KB gzipped `frontend.js`. The lazy entry keeps it off the 2D
  path, and 0.2 records the real entry's size.
- **Art:** a realistic look depends on models more than code. If the survey (2.0) finds little, the built-in set
  carries more of the look, and the plan's art slices grow.
- **Speed on large maps:** vegetation and cities are the heavy parts. The presets and 6.3 are the answer, and 6.2
  measures before tuning.
- **Two views drifting apart:** the `MapRenderer` seam and the parity table (spec §11) are the guard. A feature added
  to the 2D map later has to say what the 3D view does with it.
