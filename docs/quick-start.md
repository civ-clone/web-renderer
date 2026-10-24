# Quick start: running and working on civ-clone

This is the "what do I download, clone and install" guide. It covers playing the
game, running it locally, changing the renderer, and changing the engine
packages, which live in their own repositories. The rest of [`docs/`](./README.md)
describes how the code works once you are in.

## Just play

Go to [civ.one](https://civ.one). The game runs entirely in your browser; there is
no account and no install. The first time, choose **Import assets** on the main
menu and give it `TER257.PIC` and `SP257.PIC` from an original copy of
Civilization (1991): the graphics are read from those two files and kept in
your browser's storage. Nothing is uploaded anywhere.

On Brave, put Shields down while importing and playing, or the images come out
wrong (Brave "farbles" canvas reads as a fingerprinting defence).

## What is where

civ-clone is one game spread over many small packages, so that any rule can be
replaced and other rulesets can be layered on later. Every package is a
repository under [github.com/civ-clone](https://github.com/civ-clone):

| Prefix | Roughly how many | What they hold |
| ------ | ---------------- | -------------- |
| `core-*` | 47 | The engine's abstract parts: `Player`, `City`, `Unit`, `Tile`, the registries that hold them, `Rule`s, the turn loop, saving and loading. No game content. |
| `base-*` | 304 | One concrete thing each: a unit type, a city improvement, a terrain, a wonder, a government, an AI strategy, a unit action. Most are a few files. |
| `library-*` | 9 | Helpers several packages share, for units, cities, diplomacy, strategy, government, wonders, the world, science and civilizations. |
| `civ1-*` | 26 | Civilization (1991) itself: its civilizations and leaders, its rules for science, government, happiness, trade, combat, barbarians, the game's ending. |
| `simple-*` | 4 | The default implementations: `simple-ai-client` and `simple-ai-strategy-client` (the computer players), `simple-world-generator`, `simple-world-path`. |
| `web-renderer` | 1 | The game you play: the page, the map, the windows, and a Web Worker that runs the engine with the packages above. This repository. |

`web-renderer` depends on all of them as ordinary npm packages. The `core-*`,
`base-*` and `library-*` packages come from the npm registry; the `civ1-*` and
`simple-*` ones are resolved straight from GitHub (`"github:civ-clone/<name>"`
in `package.json`), pinned to a commit in `pnpm-lock.yaml`. Either way they are
in `node_modules` after one install: **to play, build or change the renderer you
clone one repository, this one.**

## Run it locally

There is no prebuilt download: civ.one is the ready-made version, and running
your own means building it. What to install:

- [git](https://git-scm.com/). The build reads the commit it is built from, so
  a downloaded zip of the repository won't build; clone it.
- [Node.js](https://nodejs.org/) 24.
- [pnpm](https://pnpm.io/) 11: `npm install -g pnpm@11`, or `corepack enable`
  and let it pick the version up.
- Optionally [Docker](https://www.docker.com/) or Python 3, for a web server.

Those are the versions the deploy uses; nothing else is tested. Then:

```bash
git clone https://github.com/civ-clone/web-renderer.git
cd web-renderer
pnpm install --frozen-lockfile
npm run build
```

The install fetches some 65 `@civ-clone` packages and takes a minute or two;
the 27 resolved from GitHub come down through git. `npm run build` writes
`dist/app.css`, `dist/frontend.js` and `dist/backend.js`; it also formats
`src/` with Prettier on the way (`npm run prettier:format`), so a build can
touch files. `npm run build:dev` is the same without minification, and
`npm run watch` rebuilds the bundles on change.

The page must be served over HTTP: `frontend.js` starts `backend.js` as a Web
Worker, which a browser refuses from a `file://` URL. Any static server will
do; two that need nothing else installed:

```bash
docker compose up          # Apache on port 8080
```

```bash
python3 -m http.server 8080
```

Open http://127.0.0.1:8080, import the assets as above, and play. Use the same
address every time: the imported assets are kept per origin, so
`localhost:8080` and `127.0.0.1:8080` each want their own import. Saves are
files you download and load again, so nothing is lost between builds. If a
rebuild seems not to have taken, hard-reload: the page caches its bundles.

## Change the renderer

Everything on the page is in `src/js/UI`; everything in the worker (the engine's
host, the AI pacing, what is sent to the page) is in `src/js/Engine`; styles are
in `src/css`. [`architecture-overview.md`](./architecture-overview.md) and
[`runtime-data-flow.md`](./runtime-data-flow.md) explain how the two halves
talk.

Checks, from quickest to slowest:

```bash
npm run prettier:check                      # formatting; prettier:format fixes it
npm run ts:compile                          # typecheck src/
node tools/run-suite.js ui citizens         # one suite, tests/ui/citizens.ts
npm run test:observer                       # the same through its npm script
npm test                                    # everything: about five minutes
```

Suites live in `tests/engine` and `tests/ui` and are plain TypeScript programs:
one passes when it exits 0 **and** prints a line starting `PASS`. The UI suites
run against [linkedom](https://github.com/WebReflection/linkedom), so there is
no browser to start. `npm run test:conformance` plays a seeded four-player game
and compares its checksums to a committed fixture: it is the regression net for
the whole engine, and `--update` rewrites the fixture when a change to the rules
is meant to move it.

Open a pull request against `main`. The test workflow runs
`npm run prettier:check` and the same `npm test`, and merging to `main`
deploys to civ.one. **Commit messages are the release
notes**: every commit body on `main` is shown to players in the game's release
window, one bullet per paragraph, so write it for a player ("When choosing your
civilization, you can now pick Random (#15).") and keep implementation detail in
the pull request. [`build-and-release.md`](./build-and-release.md) has the
details.

The UI's text is in `translations/local/en.ts`, with British spellings as
overrides in `en-GB.ts`; a new string that differs between the two needs an
entry in both.

## Change the engine

An engine change happens in that package's own repository, but it is tested
here, in the game, before it is published. The workflow is: clone the package
next to `web-renderer`, change it, copy its source into this repository's
`node_modules`, run the game and the suites, then publish and bump.

`./tools/civ` automates the awkward parts (`node tools/civ --help` lists every
command; [`../tools/README.md`](../tools/README.md) explains the reasoning):

1. **Clone.** The tools look for packages in one workspace directory: the
   `root` in `tools/packages.json`, which is `~/Code/civ-clone`, so
   `~/Code/civ-clone/core-city` beside `~/Code/civ-clone/web-renderer`. Change
   `root` (or remove it, and the parent directory of `web-renderer` is used)
   if your checkouts live elsewhere. Clone the package there:
   `git clone https://github.com/civ-clone/core-city.git`. Their default
   branch is `master`. (`./tools/civ clone` clones the packages
   `tools/packages.json` lists, which is the set an engine-wide change was
   last tracking rather than everything, and it clones over SSH.)

2. **Change it, on a branch.** Packages commit their compiled output
   (`City.js`, `City.d.ts`, `City.js.map` next to `City.ts`), formatted with
   Prettier 2.8.8 and compiled with TypeScript 4.x. You don't need to rebuild
   while iterating, because the renderer resolves the `.ts` source first.

3. **Sync it into the game.** `./tools/civ sync core-city` copies the checkout's
   `.ts` files into `node_modules/@civ-clone/core-city`. `npm run build:dev` (or
   `npm run watch` with `./tools/civ watch core-city`) then picks the change up
   with no publish. Running the game, `npm test` and `npm run test:conformance`
   now exercise your change.

4. **Check the tree.** After any install or sync, `./tools/civ duplicates`
   confirms no package is installed twice (two copies are two classes, and
   `instanceof` between them is quietly false), and `./tools/civ stale`
   confirms each installed copy matches its checkout.

5. **Typecheck the other packages.** `./tools/civ typecheck` compiles every
   checkout against the renderer's installed tree. It is the one check that
   sees a base-class change break a dependant: `core-data-object@0.1.14` added
   one required static and broke 22 packages whose own tests were green. It
   refuses to run while a checkout has uncommitted tracked changes, so commit
   first.

6. **Compile for the commit.** `./tools/civ compile core-city` formats the
   source, compiles it against the renderer's tree and formats the output, so
   the committed `.js` and `.d.ts` match the `.ts`. Packages have their own
   `npm run build` and `npm test` (ts-mocha) as well, which need an install in
   the checkout: use `pnpm install --ignore-scripts` there, never `npm install`
   in a package with many `github:` dependencies, which installs them
   recursively until the machine runs out of memory.

7. **Publish, then bump.** Open a pull request against the package's `master`.
   Once it is merged, bump the version on `master`, tag it `v<version>`, push
   both and create a GitHub release, then `npm publish` for an npm-resolved
   package. `./tools/civ publish --pending --dry-run` shows what a wave of
   publishes would do, in dependency order; drop `--dry-run` to run it (the npm
   account needs an automation token, as writes have 2FA). A GitHub-resolved
   package (`civ1-*`, `simple-*`) is not published: the renderer's
   `pnpm update @civ-clone/<name>` moves its lockfile pin to the new commit.

8. **Bump the renderer.** In `web-renderer`, update the dependency, then
   `rm -rf node_modules && pnpm install --frozen-lockfile` (a partial update
   leaves old copies linked; `civ duplicates` says so), run `npm test`, and open
   the pull request. Its commit message is the release note for the change, so
   say what a player will notice.

A change to several packages at once goes the same way, package by package in
dependency order; `./tools/civ audit` prints the graph, its cycles and the
publish waves.

### Where to look in the engine

- A **rule** is a `Rule` subclass with `Criterion`s and `Effect`s, registered
  into the game's `RuleRegistry` by the package's `registerRules.ts`. Yields,
  combat, what a city can build, what happens when a player is defeated: all
  rules. A new behaviour is usually a new package with one rule in it.
- **Registries** hold the entities (`PlayerRegistry`, `CityRegistry`,
  `UnitRegistry` and so on) and the game's `Game` object adopts them.
- The renderer's worker builds the game in `src/js/Engine/Game.ts` from the
  `plugins` list that `npm run build` generates from `package.json`, so a new
  package becomes part of the game by being a dependency.
- Civilization's actual rules, as opposed to the mechanism, are in `civ1-*`.
  Where behaviour is in question, v474.05 of the original is the reference.

## Where to ask

Open an issue on [`web-renderer`](https://github.com/civ-clone/web-renderer/issues),
whichever package the fault turns out to be in: that is where the work is
tracked. The [organisation's discussions](https://github.com/civ-clone/civ-clone/discussions)
are for questions, and there is a long-running thread on
[CivFanatics](https://forums.civfanatics.com/threads/yet-anther-clone.680494/).
