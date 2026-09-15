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
- `release:changelog`: add release-note entries for every commit since the newest one — see [Releasing](#releasing)

## Generated files in normal workflow

- `src/js/plugins.ts`
- `src/js/translations.ts`
- `build.json`

These are generated from local environment and package set.

## Serving the app

From repository context:

- App shell expects `dist/app.css` and `dist/frontend.js` from `index.html`.
- `docker-compose.yml` provides an Apache static file container on port `8080`.

## Releasing

A release is: the engine packages it needs are published, the changelog is
brought up to date, the bundle is built from that commit, and the bundle is
copied into [`civ-clone/civ-clone.github.io`](https://github.com/civ-clone/civ-clone.github.io),
which GitHub Pages serves at **https://civ.one**.

The order matters in two places. `ReleaseWindow` *imports*
`changelog/releases.json`, so the notes are bundled into `frontend.js` — they
have to be committed before the build. And `build.json` records
`<version>@<HEAD>`, so the build has to run on the commit that is being
released.

### 1. The engine it depends on is published and resolved

If any `@civ-clone` checkout has unpublished commits, publish them first
(`npm run civ -- publish --pending`; see
[`engine-serialisation/04-package-workflow.md`](engine-serialisation/04-package-workflow.md)),
then resolve the renderer against them with a full reinstall:

```sh
rm -rf node_modules pnpm-lock.yaml
pnpm install --config.confirmModulesPurge=false --config.minimumReleaseAge=0 \
  --config.blockExoticSubdeps=false
```

and check the tree before trusting anything built from it:

```sh
npm run civ -- duplicates   # one copy of each package
npm run civ -- stale        # every installed copy matches its checkout
npm run civ -- typecheck
npm run civ -- busy
npm run civ -- lint
npm test                    # typechecks src/ first — see below
```

`npm test` starts with `ts:compile` because nothing else typechecks the
renderer's own source: the suites are bundled with esbuild, which strips types
without checking them, and `civ typecheck` compiles the engine checkouts. A
type error there surfaced only when `npm run build` ran `prebuild` — as
`core-rule@0.1.5`'s `Rule._id` did, colliding with `DataObject._id` in
`DataTransferClient`.

Commit the lockfile. A release built against unpublished checkouts synced into
`node_modules` would work locally and be impossible to reproduce.

### 2. The changelog

```sh
npm run release:changelog
```

This finds the newest entry in `changelog/releases.json` and, for every commit
after it, writes `changelog/<sha>.json` and adds the entry to the top of
`releases.json`, newest first. Existing entries are never rewritten — the last
one, `0.0.0`, was written by hand and exists nowhere else. It needs a GitHub
token for the external logs: `GITHUB_TOKEN`, or whatever `gh auth token`
prints.

What an entry contains:

- **Local changes** come from the commit message. Written one change per line,
  each line is a bullet. Written as a subject, a blank line and a body, the
  subject is dropped and each body paragraph becomes a bullet, with wrapped
  lines joined and `- ` items kept separate. Trailers such as `Co-Authored-By:`
  are dropped. So a commit message *is* its release note, and is worth writing
  for a player as well as a reviewer.
- **External changes** compare the `@civ-clone` packages resolved in the
  lockfile at the commit and its parent — `pnpm-lock.yaml`, or `yarn.lock` for
  commits from before the switch — and list each one added, updated or removed,
  with the commit messages between the two published versions (tags `v0.1.x`,
  or bare `0.1.x` from before `civ publish`). `package.json` cannot be used for
  this: it holds `^0.1.0` ranges, which do not change when a patch is published.

Commit the new `changelog/*.json` files and `releases.json` together. By the
convention every release has followed, **a release commit carries entries up to
its parent**; its own entry arrives with the next release.

`generate-changelog.sh <sha>` still prints a single entry.
`generate-changelog-combined.sh` is retired — it rebuilt `releases.json` from
scratch, which would delete the `0.0.0` entry.

### 3. Build and look at it

```sh
npm run build
docker compose up    # http://localhost:8080
```

`build` runs `prebuild` first: plugin and translation imports, a TypeScript
check, `prettier:format` over `src/`, and `build.json`. Every generated file is
git-ignored, so `git status` should still be clean afterwards; if prettier
changed tracked source, commit that and build again, or `build.json` will name
a commit the bundle was not built from.

Before deploying, start a game and open the release window: it is the one place
the new notes are rendered, and a malformed entry shows up there first.

### 4. Deploy

```sh
git clone git@github.com:civ-clone/civ-clone.github.io.git ../civ-clone.github.io   # once
cd ../civ-clone.github.io
git pull
./update.sh          # copies ../web-renderer/dist and ../web-renderer/index.html
git add -A
git commit -m "Updates from build $(git -C ../web-renderer rev-parse --short HEAD) of web-renderer."
git push
```

GitHub Pages publishes `master` at the root, with `CNAME` pointing at
`civ.one`. The commit message names the renderer commit the bundle was built
from, as every deploy so far has.

`update.sh` copies `dist/` over the old one without deleting anything, so
assets that are no longer referenced — esbuild names images by content hash —
accumulate in the site repo. Harmless, but worth clearing occasionally.

### Automating it

Every step above is manual, and the deploy in particular depends on a sibling
checkout and a hand-typed commit message. A GitHub Actions workflow in this
repository could run steps 2–4 on demand: install, test, generate the
changelog, build, and push `dist/` and `index.html` to the site repository with
a deploy key. Step 1 stays manual while publishing needs an npm token with
two-factor authentication.

## Rewrite recommendations

- Keep build-generation steps but separate formatting from build for deterministic CI.
- Replace absolute import generation with relative manifest generation.
- Add a dedicated dev server workflow (if moving to a framework bundler).
- Keep changelog format if in-app release window remains a feature.
