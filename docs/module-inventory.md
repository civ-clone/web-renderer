# Module Inventory

Quick reference map of key code areas.

## Top-level

- `index.html`: static shell with map/sidebar/menu containers.
- `esbuild.js`: bundling config and watch/dev flags.
- `buildPluginList.js`: generates `src/js/plugins.ts` import list.
- `buildTranslationList.js`: generates `src/js/translations.ts` import list.
- `build.json`: generated version metadata used by UI.

## Engine side (`src/js/Engine`)

- `Game.ts`: startup, options, player/client setup.
- `DataTransferClient.ts`: backend-to-frontend state/action bridge.
- `Transport.ts`: channel and payload typing.
- `ParentTransport.ts` / `WorkerTransport.ts`: worker messaging implementations.
- `DataQueue.ts`: patch queue and transfer serialization.
- `Request.ts` + `Requests/Options.ts`: request/response convenience layer.
- `UnknownObjects/*`: wrappers for partially-known entities.

## UI side (`src/js/UI`)

- `Renderer.ts`: main frontend orchestrator.
- `Transport.ts`: UI-oriented transport type mapping.
- `AssetStore.ts`: IndexedDB + image caches.
- `DataObserver.ts`: patch/data event subscription helper.
- `Store.ts`: generic IndexedDB wrapper.
- `GameOptionsRegistry.ts`: in-memory UI options.
- `components/*`: windows, panels, menus, reports, details.
- `components/Map/*`: map canvas layers.
- `lib/*`: utility helpers (reconstitution, object-map pruning, key mapping, image scaling/recolouring, etc.).
- `lib/memoryTestbed.ts`: opt-in heap/object-count sampler (debug mode).
- `lib/UIStressRunner.ts`: opt-in automated UI stress harness (debug mode).

## Styling and assets

- `src/css/app.scss`: entry style file.
- `src/css/components/*`: component-level SCSS modules.
- `src/img/main-menu-bg.jpg`: main menu background image.

## Localization

- `translations/*`: namespaced translation modules.
- `src/js/translations.ts`: generated import fan-in file.

## Changelog and release notes

- `changelog/*.json`: release snapshots.
- `changelog/releases.json`: aggregate release feed.
- `src/js/UI/components/ReleaseWindow.ts`: in-app release viewer.
