# Build and Release

## Build toolchain

- Bundler: `esbuild` (`esbuild.js`)
- Styles: `sass` via `esbuild-sass-plugin`
- Language: TypeScript
- Formatter: Prettier

## Bundle outputs

`esbuild.js` bundles three entry points into `dist/`:

- `src/css/app.scss` -> `dist/app.css`
- `src/js/backend.ts` -> `dist/backend.js`
- `src/js/frontend.ts` -> `dist/frontend.js`

Notable options:

- `bundle: true`
- `sourcemap: true`
- `minify: true` by default (`dev` arg disables minify)
- Optional watch mode (`watch` arg)

## npm scripts (from `package.json`)

- `build`: prebuild + production bundle
- `build:dev`: prebuild + non-minified bundle
- `prebuild`:
  - generate plugin imports
  - generate translation imports
  - TypeScript compile check
  - Prettier format write
  - generate `build.json` version string
- `watch`: esbuild watch mode

## Generated files in normal workflow

- `src/js/plugins.ts`
- `src/js/translations.ts`
- `build.json`

These are generated from local environment and package set.

## Serving the app

From repository context:

- App shell expects `dist/app.css` and `dist/frontend.js` from `index.html`.
- `docker-compose.yml` provides an Apache static file container on port `8080`.

## Release/changelog mechanics

- Changelog entries are JSON files under `changelog/`.
- `generate-changelog.mjs` can inspect local commit + dependency changes (Git + GitHub API token).
- `ReleaseWindow` (`src/js/UI/components/ReleaseWindow.ts`) reads `changelog/releases.json` and renders in-app release notes.

## Rewrite recommendations

- Keep build-generation steps but separate formatting from build for deterministic CI.
- Replace absolute import generation with relative manifest generation.
- Add a dedicated dev server workflow (if moving to a framework bundler).
- Keep changelog format if in-app release window remains a feature.

