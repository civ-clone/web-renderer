# web-renderer Documentation

This folder documents the current implementation of `@civ-clone/web-renderer` to support a full rewrite.

## Recommended reading order

1. [`architecture-overview.md`](./architecture-overview.md)
2. [`module-inventory.md`](./module-inventory.md)
3. [`runtime-data-flow.md`](./runtime-data-flow.md)
4. [`backend-worker.md`](./backend-worker.md)
5. [`frontend-ui.md`](./frontend-ui.md)
6. [`plugin-and-translation-loading.md`](./plugin-and-translation-loading.md)
7. [`asset-system.md`](./asset-system.md)
8. [`build-and-release.md`](./build-and-release.md)
9. [`known-issues-and-rewrite-notes.md`](./known-issues-and-rewrite-notes.md)

## Scope and intent

- Capture how the current code behaves, not how it should ideally work.
- Highlight coupling points and risk areas for rewrite planning.
- Keep depth medium: broad system coverage with targeted details where architecture depends on them.

## Current high-level shape

- Frontend and backend are both TypeScript bundles.
- Backend runs inside a Web Worker and hosts game engine/client logic.
- Frontend owns DOM, canvas rendering, input handling, and interaction windows.
- Backend sends initial game data + incremental patches over a typed message transport.
- UI reconstructs object graphs from plain objects and re-renders from that state.

## Useful entry points

- App shell: `index.html`
- Frontend entry: `src/js/frontend.ts`
- Backend entry: `src/js/backend.ts`
- Backend orchestrator: `src/js/Engine/Game.ts`
- Backend data bridge: `src/js/Engine/DataTransferClient.ts`
- Frontend orchestrator: `src/js/UI/Renderer.ts`
- Asset import UI: `src/js/UI/components/ImportAssetsWindow.ts`
- Asset storage/cache: `src/js/UI/AssetStore.ts`
