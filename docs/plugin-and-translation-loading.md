# Plugin and Translation Loading

## Plugin loading strategy

The project uses generated import lists rather than dynamic runtime discovery in browser code.

## Build-time plugin generation

`buildPluginList.js`:

- Reads `package.json["civ-clone"]` config.
  - `paths` defaults to `node_modules/@civ-clone/*`.
  - `excludes` can remove packages from generated imports.
- For each candidate package:
  - Uses package `main` if available and accessible.
  - Falls back to `index.js`.
- Writes static import file: `src/js/plugins.ts`.

Observed behavior:

- Generated imports are absolute filesystem paths.
- Plugin side effects are expected to self-register with core registries when imported.

## Runtime plugin activation

In `Game.start()`:

- Worker calls `engine.start()`.
- Worker imports `../plugins`.
- After import resolves, emits `plugins:load:end` for engine lifecycle progression.

## Translation loading strategy

`buildTranslationList.js`:

- Scans `translations/*/*.ts`.
- Writes static import file `src/js/translations.ts`.

In frontend `Renderer.init()`:

- Initializes `i18next` with browser language detector.
- Dynamically imports `../translations` so translation modules register their resources.

## Practical implications

- Adding a plugin/translation generally requires rerunning prebuild to regenerate import list files.
- Absolute-path imports reduce portability and can complicate remote/CI scenarios.
- Build-generated files are source-controlled artifacts in current setup.

## Rewrite recommendations

- Keep explicit plugin manifests but avoid absolute filesystem imports.
- Consider generating workspace-relative imports or JSON manifests consumed by bundler.
- Treat plugin registration as an explicit contract (metadata + capabilities), not only side effects.
- Add validation for missing plugin entrypoints and duplicate registrations.
