# A library of art and sound (#1063): design

A proposal for Dom, to settle before it's built. It replaces Import Assets with one library of everything the game can
draw or play with, wherever that comes from, so that a player who owns no original game can play with art that ships
with civ.one. [asset-system.md](asset-system.md) describes the system as it is today.

## In short

- **Every set is an entry in the library.** A set is a pack of art or sound, of a kind, from a source. The library lists
  them all, says whether each is ready, and imports, re-imports or removes them.
- **Sets come from two sources for now:**
  - _ships with civ.one_: royalty-free, served beside the game and fetched when it's needed;
  - _from your copy_: imported from the player's own files, as today.

  Sets installed in the browser (#964) come later and fit the same list.

- **Nothing needs importing to play.** The square pixel-art set ships with civ.one and has every interface sprite Civ1's
  import provides, so it can stand in for Civ1's art. An import becomes an upgrade, not a gate.
- **The manifest is the tileset descriptor, extended.** It gains a licence and a source. Sound gets a small manifest of
  the same shape, so `ASOUND.CVL` becomes a set like any other.
- **Almost no migration.** Imported sprites keep the keys they have, and a player who has imported Civ1 sees what they
  saw before until they choose otherwise. Only the map scale option moves to a new key, once (decision 4).

## Terms

- **Set:** one library entry, with one manifest and one id. Today's packs (Civ1's, Civ2's) are sets.
- **Kind:** `tileset` (art for one grid, and possibly the interface's art) or `sound` (music and the driver it needs).
  Themes stay out of the library (decision 1).
- **Source:**
  - `hosted`: built into the site and fetched;
  - `imported`: read from the player's own files;
  - later, `installed` (#964).
- **Ready:** every sprite or file the set requires is there. Optional ones only add to it.
- **Interface art:** the icons, citizens, meters, cursor and textures every screen draws from. These are the sprites
  under a tileset's `assets.ui` prefixes. One set provides them at a time.

## The five questions in #1063

1. **Theme and tileset: kept apart.**
   - A theme stays UI tokens, chosen with the interface, as it is now (#167's bundling isn't done).
   - The library lists art and sound, not themes. Themes stay in Options with the interface.
   - Why: a theme recolours windows whatever the map is drawn with, and bundling the two would mean a theme per tileset.
2. **Per game or global: global, one choice per grid.**
   - The player picks the art for square maps, the art for isometric maps and so on, in the library. It's kept as an
     option (`tileset.<grid>`).
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

     A fetch that fails stops that start with a message saying why. Today a missing import only hides the menu items.

   - The browser's own cache keeps the sheet, so it's fetched once per version, and nothing is written to IndexedDB.
   - Why: the bundle stays small, a set can change without the code changing, and it works with storage blocked (5).
4. **Migration: one option moves.**
   - Imported sprites keep their keys (`spriteKey`: the set's storage prefix, name and extension), and the sound driver
     keeps `./sources/ASOUND.CVL`.
   - The new options default to what's in use now: Civ1's art where it's imported, otherwise the pixel art.
   - The map scale is kept per set. Today it is `mapScale` for the interface's pack and `mapScale.<id>` for the others
     (`mapScaleOption`), so once the interface art is a choice, Civ1's moves to `mapScale.civ1`. Its value carries over
     once, on the first start after the change.
5. **Storage blocked (#850): hosted sets still work.**
   - Each importable set says it can't be imported, with today's message, and its import is disabled.
   - Hosted sets don't need storage, so the game still starts and plays with them.

## The manifest

A tileset's manifest is its descriptor (#92), with two new fields:

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
  "…": "the rest of the descriptor, unchanged"
}
```

- **`source`:** `hosted` or `imported`. For an imported set, its import (`registerPackImport`) still says which files it
  reads, in code: reading a PIC or a GIF is code. The library asks the import for its list, so the manifest doesn't
  repeat it.
- **`licence`:** a name, a link, and `attribution` when the licence asks for it (CC BY). It is shown on the set's entry,
  and for a CC BY set wherever it is chosen (#98). An imported set has no licence of ours to show. It says the art comes
  from the player's own copy.
- **`fallback`:** unchanged. A set without interface art leaves those sprites to the interface art set (the
  `assets.ui` prefixes).

A sound set's manifest has the same head and no descriptor body:

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
  `civ1-tileset-pixelart`, which holds the square pack and the hexagonal one. Its package in the renderer
  (`tileset-pixelart`) registers its descriptors with `source: "hosted"`.
- **The build:** a step packs each hosted set's PNGs into one sheet and an index (`dist/sets/<id>.<hash>.png` and
  `.json`), and records the names in the descriptor it registers.
- **Loading:**
  - `AssetStore.load` decodes a hosted set from its sheet, cutting each sprite out under its usual key, where an
    imported set's sprites come from IndexedDB.
  - The sprite lookups (`getPreloadedImage`) don't change.
  - A sheet that fails to load (offline on a first visit) is said so on its entry, and stops a game that needs it
    (decision 3).
- **Its own colours:**
  - `installTilesets` passes every pack but the interface's through `withImportedKeys`. For a set whose cities have an
    overlay (Civ2's flag), that takes the overlay's colour keys from what its import recorded, and leaves the set
    uninstalled without a record.
  - A hosted set has no import, and the hexagonal pixel art's city rim is an overlay. So a hosted set keeps its
    descriptor's own keys, and only an imported set's come from its record.
- **The check:** every sprite the descriptor requires is in the sheet. The build fails otherwise, as the pack's own
  CI does.

## The interface's art

- **Today:** `interfaceTileset()` is the one pack registered as the interface's, Civ1's, and the game can't start
  without it.
- **With the library:** it is the chosen interface art set: the first that is ready of
  1. the player's choice (an `interfaceArt` option);
  2. Civ1's, when imported;
  3. the pixel art.
- **What it covers:** only the sprites under those prefixes. A unit in a window is drawn with the map's set, not the
  interface art (`hud/components/Unit.ts`), so it looks as it does on the map.
- **Gaps:** the pixel art has every sprite Civ1 requires there. Only Civ1's optional improvement and Wonder icons
  (`city-improvements/*`, `wonders/*`) have no stand-in, and the city screen already draws nothing where one is
  missing.
- **The menus:** they stop gating New Game and Load Game on Civ1's import. They gate on there being interface art and
  art for at least one grid, which the hosted sets always give. A first visit offline is the exception: the menus then
  say why.

## The screen

The library replaces Import Assets. It opens from the main menu and from Options, wherever Import Assets is now.

- **Sections:**
  - _Map art_, by grid;
  - _Interface art_;
  - _Sound_.
- **Each entry shows:**
  - its name, and its grid for a tileset;
  - where it comes from: "Comes with civ.one", or "From your copy of Civilization" (or II);
  - its licence and any attribution;
  - its status: _Ready_, _Needs …_ (the files still wanted, each marked required or optional), or _Not imported_;
  - for an imported set, the space it uses in the browser.
- **Each entry's actions:**
  - _Import…_ or _Import again_, for an imported set. This opens that set's own file picker and instructions, so
    there's no joined paragraph, and Civ1's import is no longer required first.
  - _Remove_, for an imported set. This deletes its keys.
  - _Use for square maps_ (and so on), and _Use for the interface_. Each sets the option. The one in use is marked.
- **When something changes:** after an import the page reloads, as it does today.
- **No assets imported:** the screen is still the first thing offered there, and it shows the hosted sets as ready.

## Slices

1. **The library, listing what there is today.**
   - Sets: Civ1, Civ2 and the sound, as a set.
   - Changes: the two new manifest fields; the window replacing Import Assets, with per-set imports; the sound import
     moving into a set.
   - Gating and loading are unchanged, so nothing changes for a player but the screen.
2. **Hosted sets, and the square pixel art.**
   - The pieces: the build step, the sheet loader, and `tileset-pixelart` registering the square set.
   - The square pack's `tileset.json` predates `assets.ui`, which the renderer now requires, so it's brought up to date
     in its own repository first.
   - The interface art becomes chosen, and the menus stop gating on Civ1's import.
   - Choosing art per grid arrives here too, as #56's step e.
3. **The hexagonal pixel art.**
   - Its descriptor is registered from the same package, keeping its own city rim colours (Hosted sets).
   - Hex is then offered for new games (#94).
   - Two things aren't proven yet:
     - the renderer has only drawn hex with stand-in square sprites, so this is the pack's first real test;
     - the civ5 plan's Track A still has hex overlays and the hex city screen to do.
4. **Remove, and the space used.**
   - Then #964's installed sets join the list as a third source.

## Where this departs from #1063

- **Its first slice** lists Civ1 and Civ2 and adds the pixel art. Here the pixel art waits for slice 2, because it
  needs the hosted loader, which slice 1 leaves out so that slice 1 changes nothing but the screen.
- **Its manifest** lists the files a set reads. Here they stay in each set's import code, which already says them and
  has to read them, so they aren't written down twice.

## Not in this design

- Themes in the library (decision 1).
- Recording a game's art in its save (decision 2).
- Sets installed from elsewhere (#964), and choosing which plugins a game loads (#668).
- Per-civilization music (#801): a sound set, when it comes.

## For Dom

The five decisions above are proposals. The ones that change what a player sees:

- nothing needs importing to play (the menus stop gating);
- the art is chosen per grid, globally rather than per game;
- the pixel art is the interface's art for a player who hasn't imported Civ1.
