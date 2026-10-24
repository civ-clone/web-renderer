# web-renderer

The browser game of [civ-clone](https://github.com/civ-clone/civ-clone): an open
source, plugin-driven clone of Sid Meier's Civilization (1991), written in
TypeScript. This repository is the page you play on, the map and windows it
draws, and the Web Worker that runs the engine behind them.

**Play it at [civ.one](https://civ.one).** Every push to `main` deploys there.

## Playing

The game needs the graphics from an original copy of Civilization: on the main
menu choose **Import assets** and give it `TER257.PIC` and `SP257.PIC`. They are
read in your browser and kept in its storage; nothing is uploaded. (On Brave,
put Shields down for importing and playing, or the images come out "farbled".)

What's there, in brief: the whole of Civilization's rules as far as we know them
from v474.05, with Civ 5-style notifications for the choices that can wait and a
modern interface over the top. You can set a game up seat by seat (human or
computer, civilization and leader or Random, which AI plays a computer seat),
watch a game with no human player as any of its civilizations or the whole map,
pausing it between turns, play on Earth at three sizes with all of the
original's civilizations and the world's, save and load (the file remembers who
played each seat, and lets you reassign them on loading), read a Civilopedia,
and see what changed in each release from the version in the corner of the menu.
The AI is simple but plays the whole game, including war, diplomacy, barbarians,
pollution, the space race and conquest. Open problems and ideas are the
[issues](https://github.com/civ-clone/web-renderer/issues).

## Running and changing it

[`docs/quick-start.md`](./docs/quick-start.md) is the place to start: how to run
the game locally (Node 24, pnpm, `npm run build`, any static server), how the
code is laid out, how to run the tests, and how to make and ship a change to one
of the engine packages with `./tools/civ`.

In short:

```bash
git clone https://github.com/civ-clone/web-renderer.git
cd web-renderer
pnpm install --frozen-lockfile
npm run build        # or build:dev, or watch
docker compose up    # serves on http://127.0.0.1:8080; or any static server
npm test             # about five minutes
```

The rest of [`docs/`](./docs/README.md) describes the implementation: the
architecture, the worker and the page, how data flows between them, the asset
system, the build and release, the AI arena, and the dated performance and
memory reviews.

Commit messages on `main` are the game's release notes, shown to players, so
each commit body says what a player will notice; `CLAUDE.md` has the rule and
`generate-changelog.mjs` applies it.

## Third-party libraries

- [esbuild](https://esbuild.github.io/) for the build, with
  [esbuild-sass-plugin](https://github.com/glromeo/esbuild-sass-plugin) for the styles
- [TypeScript](https://www.typescriptlang.org/) throughout
- [i18next](https://www.i18next.com/) for the text
- [idb](https://github.com/jakearchibald/idb) for `IndexedDB`
- [marked](https://marked.js.org/) for the release notes
- [linkedom](https://github.com/WebReflection/linkedom) for the UI tests
- [Prettier](https://prettier.io/) to keep it readable

### Images

- [Icons courtesy of feather icons](https://github.com/feathericons/feather)
- [Main menu background photo created by kjpargeter - www.freepik.com](https://www.pexels.com/photo/galaxy-digital-wallpaper-957085/)
