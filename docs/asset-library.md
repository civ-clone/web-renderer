# A library of art and sound (#1063): design

The design, agreed in review before it's built. It replaces Import Assets with one library of everything the game can
draw or play with, wherever that comes from, so that a player who owns no original game can play with art that ships
with civ.one. [asset-system.md](asset-system.md) describes the system as it is today.

## In short

- **Every set is an entry in the library.** A set is a pack of art or sound from a source. The library lists them all,
  says whether each is ready, and imports, re-imports or removes them.
- **Sets come from two sources for now:**

  - _ships with civ.one_: royalty-free, served beside the game and fetched when it's needed;
  - _from your copy_: imported from the player's own files, as today.

  Sets installed in the browser (#964) come later and fit the same list.

- **Themes are in the library too.** A theme is the interface's colours and the interface art it draws with (icons,
  citizens, meters, cursors, textures). The interface asks for that art by names of civ.one's own, so a theme can draw
  with Civ1's art, the pixel art, or another game's when it has some.
- **Nothing needs importing to play.** The pixel art ships with civ.one, for the map and the interface, so it can stand
  in for Civ1's art. An import becomes an upgrade, not a gate.
- **The manifest is the tileset descriptor, extended.** It gains a licence and a source. Sound gets a small manifest of
  the same shape, so `ASOUND.CVL` becomes a set like any other.
- **Zoom replaces the map scale:** a slider in steps of 0.1, kept per set.
- **Almost no migration.** Imported sprites keep the keys they have, and a player who has imported Civ1 sees what they
  saw before until they choose otherwise. Only the map scale moves, once, into the zoom.

## Terms

- **Set:** one library entry, with one source and one id. Today's packs (Civ1's, Civ2's) are sets. A set has a
  descriptor for each grid it draws, each with its own id (the pixel art's square `civ1-pixelart` and hexagonal
  `hex-pixelart`), and what is kept per tile size (a zoom, a sprite sheet) is kept per descriptor.
- **What a set provides:**
  - map art for a grid: a tileset, with its descriptor (a set can have one for each grid, as the pixel art has square
    and hexagonal);
  - interface art: the sprites under its descriptor's `assets.ui` prefixes, as Civ1's provides today;
  - sound: music and the driver it needs.
- **Source:**
  - `hosted`: built into the site and fetched;
  - `imported`: read from the player's own files;
  - later, `installed` (#964).
- **Ready:** every sprite or file the set requires is there. Optional ones only add to it.
- **Theme:** the interface's colours (its tokens), and which sets' interface art it draws with. A theme is code, not a
  set: an interface registers it, as now, so it is always there and has nothing to import or remove.

## The five questions in #1063

1. **Theme and tileset: a theme picks the interface's art, and the map's art stays apart.**
   - A theme names the sets whose interface art it draws with, in order, and draws with the first that is ready.
     Every theme's list ends with the pixel art, so every theme is always ready.
     - Civ1 classic: Civ1's art, then the pixel art.
     - Slate and brass: the same, which is what it draws with today.
   - A theme doesn't bring map art. The map is drawn with the art chosen for its grid (2), whatever the theme.
   - A rule set can name a theme, as `civ2` names its tileset. It's used until the player chooses one.
   - Why: every screen asks for Civ1's art by Civ1's names today, so the interface only works with Civ1's import. Names
     of civ.one's own, and a theme that says whose art fills them, make it work with any set that has interface art.
   - Civ2 has none yet. Its descriptor's `assets.ui` is empty, and its windows draw Civ1's (`interfaceTileset()`). A Civ2 theme
     waits on importing Civ2's icons (#152). Until then the `civ2` rule set can name Slate and brass, or nothing.
2. **Per game or global: global, one choice per grid.**
   - The player picks the art for square maps, the art for isometric maps and so on, in the library. It's kept as an
     option (`tileset.<grid>`).
   - Until they pick one, a grid uses the imported set for it when it's ready, and otherwise the set that ships with
     civ.one.
   - A rule set that names its tileset (`civ2`) still uses that one.
   - A save records its grid and rule set, as now, but not its art. Art doesn't change the game, and a save then opens
     in whatever the player likes to see.
3. **Hosted sets: fetched, not bundled.**
   - Each hosted set is built into one sprite sheet and an index of where each sprite is in it, named by its content's
     hash.
   - A hosted set counts as installed by declaration: the grids a new game offers don't wait on any fetch.
   - Its sheet is fetched when it's needed:
     - the interface art's at start-up;
     - a map set's when a game on its grid starts or loads, before the first draw.
   - The browser's own cache keeps the sheet, so it's fetched once per version, and nothing is written to IndexedDB.
   - **Changing the map's art in a running game** should be possible. The game's state is in the worker and doesn't
     depend on the art, and the map's view can already be disposed of (`MapView.dispose`), so choosing other art for
     the grid would build the view again with it. That `GameSession` can rebuild its view, and that nothing else keeps
     the old one, is to be proven in slice 3.
   - If it is, a sheet that fails to load doesn't stop a game. The grid falls back to another set that is ready, with a
     message saying why. Only a first visit offline with nothing imported for that grid has no set to fall back to,
     and then the start stops with that message.
   - Why: the bundle stays small, a set can change without the code changing, and it works with storage blocked (5).
4. **Migration: the map scale moves into the zoom.**
   - Imported sprites keep their keys (`spriteKey`: the set's storage prefix, name and extension), and the sound driver
     keeps `./sources/ASOUND.CVL`.
   - The new options default to what's in use now: Civ1's art where it's imported, otherwise the pixel art. The theme
     option (`uiTheme`) doesn't change.
   - The map scale becomes a zoom kept per set (`zoom.<id>`). Today's values, `mapScale` for Civ1 and `mapScale.<id>`
     for the others, carry over once, on the first start after the change. A set with no value kept starts at its
     default.
5. **Storage blocked (#850): hosted sets still work.**
   - Each importable set says it can't be imported, with today's message, and its import is disabled.
   - Hosted sets don't need storage, so the game still starts and plays with them.

## The manifest

A tileset's manifest is its descriptor (#92), with two new fields for the library:

```json
{
  "schema": 1,
  "kind": "tileset",
  "id": "civ1-pixelart",
  "name": "Pixel art",
  "grid": "square",
  "source": "hosted",
  "licence": {
    "name": "MIT",
    "url": "https://github.com/civ-clone/civ1-tileset-pixelart/blob/main/LICENSE"
  },
  "…": "the rest of the descriptor"
}
```

- **`source`:** `hosted` or `imported`. For an imported set, its import (`registerPackImport`) still says which files it
  reads, in code: reading a PIC or a GIF is code. The library asks the import for its list, so the manifest doesn't
  repeat it. `PackImport` has `requiredFiles` now, and gains `optionalFiles` for the files it reads when they're
  there.
- **`licence`:** a name, a link, and `attribution` when the licence asks for it (CC BY). It is shown on the set's entry,
  and for a CC BY set wherever it is chosen (#98). An imported set has no licence of ours to show. It says the art comes
  from the player's own copy.
- **Interface art** stays where Civ1's is now: `assets.ui` lists its prefixes and `ui` its sizes (icon, citizen,
  cursor). A set whose sprites have other names maps civ.one's interface names to them in a new `names.ui`, beside the
  terrain, special and unit names `names` holds now.
- **`fallback`:** declared but not used yet (nothing looks sprites up there, `TilesetDescriptor.ts`). For interface
  art the theme's list does its job, and it stays unused for map art.

A theme gains one field where an interface registers it:

```ts
registerTheme({
  id: 'civ1-classic',
  name: 'GameOptions.theme-choice.civ1-classic',
  art: ['civ1', 'civ1-pixelart'],
});
```

A sound set's manifest has the same head as a tileset's and no descriptor body. The descriptor's schema fixes `kind`
to `tileset`, so a sound set's manifest has a schema and a reader of its own:

```json
{
  "schema": 1,
  "kind": "sound",
  "id": "civ1-adlib",
  "name": "Civilization's music (AdLib)",
  "source": "imported",
  "storage": { "prefix": "./sources/", "ext": "" }
}
```

Its import is a `PackImport` like the art's. It reads `ASOUND.CVL`, checks it (`CvlImage`) and keeps it under the key
it has today. The import window's own handling of the file goes, and the music reads the driver through the set.

## Hosted sets

- **Where they come from:** a set's repository is a dependency, as the asset extractors are, for example
  `civ1-tileset-pixelart`, which holds the square pack (`pack`) and the hexagonal one (`pack-hex`). Its package in the
  renderer (`tileset-pixelart`) registers both descriptors with `source: "hosted"`, and declares each for the build.
- **The build:** a step packs each hosted set's PNGs into one sheet and an index (`dist/sets/<id>.<hash>.png` and
  `.json`), and records the names in the descriptor it registers.
- **Loading:**
  - `AssetStore.load` decodes a hosted set from its sheet, cutting each sprite out under its usual key, where an
    imported set's sprites come from IndexedDB.
  - The sprite lookups (`getPreloadedImage`) don't change.
  - A sheet that fails to load (offline on a first visit) is said so on its entry. The theme moves on to the next art
    in its list, and the grid falls back as decision 3 says, once changing art in a game is proven;
    until then the start stops with a message.
- **Its own colours:**
  - `installTilesets` passes every pack but the interface's through `withImportedKeys`. For a set whose cities have an
    overlay (Civ2's flag), that takes the overlay's colour keys from what its import recorded, and leaves the set
    uninstalled without a record.
  - A hosted set has no import, and the hexagonal pixel art's city rim is an overlay. So a hosted set keeps its
    descriptor's own keys, and only an imported set's come from its record.
- **The check:** every sprite the descriptor requires is in the sheet. The build fails otherwise, as the pack's own
  CI does.

## The interface's art

- **Today:** `interfaceTileset()` is Civ1's pack, and `currentTileset()` returns it too. The game can't start without
  it. They're used in three ways:
  - **for interface art:** the screens ask for `spriteKey(currentTileset(), 'city/bulb')` and size it by
    `currentTileset().ui`, in about twenty places, and the map draws the interface's art over tiles through
    `Map#getInterfaceImage`;
  - **as the pack that's always installed:** `installPacks`, `installTilesets` and `pluginSets` leave it out of what
    needs installing or choosing, and `installedTilesets` always includes it;
  - **as a reference size:** `shownScale` sizes windows' art by its 16 px tile, and `mapScaleOption` keeps its scale as
    plain `mapScale`.
- **With the library:**
  - **interface art** comes from the theme's art, `interfaceArt()`, the first ready set in the theme's list. The names
    asked for don't change: they start as Civ1's, and become civ.one's by being listed in the renderer as the
    interface's own, each required or optional;
  - **no pack is always installed,** from slice 3: hosted sets are installed by declaration, and imported ones when
    they're ready. Until then (slice 2) a list's sets that aren't registered are skipped, and when none is ready Civ1's
    is used, as today, since the game can't start without it;
  - **the reference size** is a constant, 16 px, which is what windows are laid out for. The zoom's option has no
    special case for Civ1 once Zoom has moved it.
  - Map art that defaults to `currentTileset()` (`renderUnit`, `getPreloadedImage`) is given the map's set by its
    caller instead.
- **What's missing:** a set with interface art can leave optional names out. The pixel art has every required name.
  Civ1's optional improvement and Wonder icons (`city-improvements/*`, `wonders/*`) have no stand-in, and the city
  screen already draws nothing where one is missing.
- **Changing theme:** its colours change at once, as now. When it changes the interface art too, the page reloads, as
  it does after an import, since windows already open have drawn their icons.
- **What it covers:** only the interface's art. A unit in a window is drawn with the map's art, not the theme's
  (`hud/components/Unit.ts`), so it looks as it does on the map.
- **The menus:** they stop gating New Game and Load Game on Civ1's import. They gate on there being interface art and
  art for at least one grid, which the hosted sets always give. A first visit offline is the exception: the menus then
  say why.

## Zoom

- **A slider instead of a list:** in steps of 0.1, from the set's smallest zoom to its largest, in Options and on the
  map (with keys and the mouse wheel later).
- **Kept per descriptor,** as the map scale is now (`zoom.<id>`), because each one's tiles are their own size.
- **Defaults:** a descriptor gains an optional `defaultZoom`, any step of 0.1 between its smallest and largest scale,
  falling back to `defaultScale`. Civ1's is 2, the pixel art's 1, and Civ2's about 1.4, to settle by eye.
  `defaultScale` stays a whole number in `scales`, as windows use it (below).
- **Drawing between whole numbers:**
  - At a whole number the map draws as now, each sprite scaled by it, with no smoothing.
  - Between them, sprites scaled one by one can't meet exactly. A tile's place on the canvas rounds differently from
    its neighbours', which leaves gaps and overlaps. The hexagonal grid's 27 px row step is a whole number of pixels
    only at whole zooms.
  - So between whole numbers the map draws at the next whole number up, and the canvas is shown smaller by its CSS
    size, smoothed by the browser. The tiles meet as they do at that whole number.
- **The costs:**
  - The picture is a little softer.
  - The canvas has more pixels to draw: just above a whole number, up to four times as many at 1.1 (drawn at 2), and
    about twice as many at 2.1 (drawn at 3).
  - Every layer of the portal is sized the same way, and whatever is placed over the map (the floating interface,
    clicks) converts between the page's pixels and the canvas's. `MapView` already converts the floating interface's
    boxes.
  - Whether the portal's layers take a CSS size cleanly is to be proven when it's built.
- **Windows** keep whole scales: `shownScale` caps them at `defaultScale`, not the zoom, as their art is drawn at the
  size of a 16 px tile.

## The screen

The library replaces Import Assets. It opens from the main menu and from Options, wherever Import Assets is now.

- **Sections:**
  - _Map art_, by grid;
  - _Themes_;
  - _Sound_.
- **Each set shows:**
  - its name, and what it provides: map art for which grids, interface art, sound;
  - where it comes from: "Comes with civ.one", or "From your copy of Civilization" (or II);
  - its licence and any attribution;
  - its status: _Ready_, _Needs …_ (the files still wanted, each marked required or optional), or _Not imported_;
  - for an imported set, the space it uses in the browser.
- **Each set's actions:**
  - _Import…_ or _Import again_, for an imported set. This opens that set's own file picker and instructions, so
    there's no joined paragraph. Civ1's import stays required first until slice 3, when the menus stop gating.
  - _Remove_, for an imported set. This deletes the keys its descriptors list, which takes its map art and its interface art together. Not
    everything under its prefix: Civ1's `./assets/` holds Civ2's `./assets/civ2/` too.
  - _Use for square maps_ (and so on). This sets the option, and the one in use is marked.
- **Each theme shows** its name, the interface it comes with, and, from slice 2, whose art it's drawing with now ("Civ1's", or "the
  pixel art's, until Civ1 is imported"), with _Use_. Options keeps its theme picker, which sets the same option.
- **After an import** the page reloads, as it does today.
- **No assets imported:** the screen is still the first thing offered there, and it shows the hosted sets as ready.

## Slices

1. **The library, listing what there is today.**
   - Sets: Civ1's and Civ2's art, and the sound. Themes: the two there are.
   - Changes: the new manifest fields; the window replacing Import Assets, with per-set imports; the sound import
     moving into a set.
   - Gating and loading are unchanged, Civ1's import is still required first, and nothing changes for a player but
     the screen.
2. **Themes pick the interface's art.**
   - Themes gain their art lists, and `interfaceArt()` replaces `interfaceTileset()` and `currentTileset()` in the
     three ways above.
   - Civ1's is the only interface art yet, so nothing looks different.
3. **Hosted sets, and the square pixel art.**
   - The pieces: the build step, the sheet loader, and `tileset-pixelart` registering the square set.
   - The menus stop gating on Civ1's import.
   - Choosing art per grid arrives here too, as #56's step e, and changing it in a running game if that's proven
     (decision 3).
4. **The hexagonal pixel art.**
   - Its descriptor is registered from the same package, keeping its own city rim colours (Hosted sets).
   - Hex is offered for new games (#94) only on a page loaded with `?hex=1` for now (`offerUnfinishedGrids`), as the
     civ5 plan's Track A still has hex overlays and the hex city screen to do. A save on hex loads either way.
   - This was the pack's first real test: the renderer had only drawn hex with stand-in square sprites.
5. **Remove, and the space used.**
   - Then #964's installed sets join the list as a third source.

**Zoom** stands apart from these and can come first: the option and its one-off migration from `mapScale`, the
`defaultZoom` field, and the drawing above.

## Where this departs from #1063

- **Its first slice** lists Civ1 and Civ2 and adds the pixel art. Here the pixel art waits for slice 3, because it
  needs the hosted loader and the themes' art, which slices 1 and 2 leave out so that each changes as little as it can.
- **Its manifest** lists the files a set reads. Here they stay in each set's import code, which already says them and
  has to read them, so they aren't written down twice.
- **#167's theme** bundles a tileset. Here a theme picks the interface's art but not the map's (decision 1).

## Not in this design

- Recording a game's art in its save (decision 2).
- A theme of Civ2's, which needs Civ2's icons imported first (#152).
- Sets installed from elsewhere (#964), and choosing which plugins a game loads (#668).
- Per-civilization music (#801): a sound set, when it comes.

## What a player will see

Four of the five decisions change what a player sees:

- nothing needs importing to play, as the menus stop gating (3);
- the art is chosen per grid, globally rather than per game, and may change during a game (2 and 3);
- a theme picks the interface's art, and draws with the pixel art for a player who hasn't imported Civ1 (1);
- the map scale becomes a zoom slider (4).
