# Plugin and Translation Loading

## Plugin loading strategy

The project uses generated import lists rather than dynamic runtime discovery in browser code.

## Build-time plugin generation

`buildPluginList.js` (`npm run build:generate-plugins-ts`, run by `prebuild`, `npm test`, `npm run arena` and several
`test:*` scripts):

- Reads `package.json["civ-clone"]` config.
  - `paths` defaults to `node_modules/@civ-clone/*`.
  - `excludes` can remove packages from generated imports. It currently holds `civ1-asset-extractor`, which is used by
    the asset import window, not the engine.
- For each candidate package:
  - Uses package `main` if available and accessible.
  - Falls back to `index.js`.
  - Packages with neither are skipped silently.
- Writes `src/js/plugins.ts`, which has:
  - one static import per package, and
  - an exported `plugins` manifest: package name to installed version, sorted by name.

Observed behavior:

- Generated imports are absolute filesystem paths.
- Plugin side effects are expected to self-register with core registries when imported.
- The manifest is for saved games. `engine.registerPlugins(plugins)` hands it to the engine, `core-save-game` writes
  it into every save and refuses to write one with an empty manifest, and loading compares it with the manifest in the
  file: a save that needs a plugin this build lacks is refused, and differing versions are reported as drift.

## Runtime plugin activation

The worker's `Game.ts` and `loadGame.ts` import the `plugins` manifest statically, so the plugin modules run, and
register their rules, as soon as the worker script loads.

In `Game.start()` (a new game):

- Registers `engine:start` handlers that call `engine.registerPlugins(plugins)` and register the save-game classes
  (`registerClasses`, `registerDiplomacyClasses`), then create the players and their clients.
- Calls `engine.start()`.
- Imports `../plugins` again; once that resolves, emits `plugins:load:end` for engine lifecycle progression.

In `Game.load(file)` (a saved game):

- Imports `../plugins` and then calls `loadGame`, which registers the manifest itself. `engine.start()` is never
  called, so `engine:start` never fires and the rules that build a world and place settlers do not run.

Because the plugins' rules close over the singleton registries, a game cannot be loaded over one in progress. Loading
reloads the page and hands the save to a fresh worker (see `src/js/UI/lib/savedGame.ts`).

## Translation loading strategy

`buildTranslationList.js` (`npm run build:generate-translations-ts`):

- Scans `translations/*/*.ts`: one directory per engine package (`civ1-unit`, `civ1-science`, ...) plus `local` for
  the renderer's own strings, with a file per language (`en.ts`, and `en-GB.ts` where British English differs).
- Writes static import file `src/js/translations.ts`, again with absolute paths.

Each translation file calls `i18next.addResources(language, namespace, {...})` when imported.

In frontend `Renderer.init()`:

- Initializes `i18next` with browser language detector (default namespace `default`).
- Dynamically imports `../translations` so translation modules register their resources.

`npm run test:translations` bundles `tests/ui/translations.ts` with esbuild and checks the strings it covers, such as
names with an apostrophe surviving translation (#3).

## Practical implications

- Adding a plugin/translation generally requires rerunning prebuild to regenerate import list files.
- Absolute-path imports reduce portability and can complicate remote/CI scenarios. CI regenerates both files, as
  `npm test` does before anything else.
- The generated files (`src/js/plugins.ts`, `src/js/translations.ts`) are git-ignored, so a clean checkout has
  neither until one of those scripts runs.
- A plugin's installed version is now part of what a save records, so changing the installed set can make older saves
  report drift or refuse to load.

## Rewrite recommendations

- Keep explicit plugin manifests but avoid absolute filesystem imports.
- Consider generating workspace-relative imports or JSON manifests consumed by bundler.
- Treat plugin registration as an explicit contract (metadata + capabilities), not only side effects. Partly done: the
  generated `plugins` manifest records each plugin's name and version for saves.
- Add validation for missing plugin entrypoints and duplicate registrations. (`npm run civ -- duplicates` now finds
  packages installed more than once, but the generator itself still skips a missing entrypoint silently.)
