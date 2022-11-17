# web-renderer

## Current state

The game is currently reasonably playable. You can perform almost all actions available in the game engine.

The AI is relatively primitive, but it does do stuff and will attack you and try to capture your cities, etc. I'm
working on the modular version of the [`simple-ai-client`](https://github.com/civ-clone/simple-ai-client)
([`simple-ai-strategy-client`](https://github.com/civ-clone/simple-ai-strategy-client)) which will (hopefully!) mean
that adding new functionality (added via other plugins for example) is possible and that the existing mechanisms can be
somewhat refined in the process.

## Generating assets

To be able to see anything you need asset data. This can currently only be generated from the original game's files
(`TER257.PIC` and `SP257.PIC`) through the UI, select `Import Assets` at the main menu. This will be your only option
when first navigating to the game.

I'm looking at adding the ability to add asset-packs and a mechanism for managing these, so they can also be plugins,
and I'd like to collate some open-source/royalty free image to make a default pack that doesn't necessitate the original
game.

__NOTE__: If generating the assets on Brave,
[be aware that the data might get "farbled"](https://brave.com/privacy-updates/4-fingerprinting-defenses-2.0/#2-fingerprinting-protections-20-farbling-for-great-good)
and not look quite correct. Ensure you put shields down for importing the assets and when playing, or at least disable
the fingerprinting protection.

## Known issues

- Some `Civilization`'s colours are terrible.
- Sometimes the map portal doesn't re-center correctly.
- Sometimes the `AdjustTradeRates` slider widget doesn't quite work as expected.
- The game slows down in the later stages when rebuilding the transferred data.

## TODO

- Split out the UI functions into separate packages
- Add the concept of asset-packs so that open source tilesets can be used
- i18n + l10n

See also the wider `TODO`s:

- All of the above `Known issues`
- Continue to build the modular AI (see [`core-strategy`](https://github.com/civ-clone/core-strategy),
  [`simple-ai-strategy-client`](https://github.com/civ-clone/simple-ai-strategy-client) and
  [`base-strategy-build-city`](https://github.com/civ-clone/base-strategy-build-city) for details.)
- Everything in [`TODO.md` in the parent repo](https://github.com/civ-clone/civ-clone/blob/master/TODO.md)

## Third-party libraries used

- [idb](https://github.com/jakearchibald/idb) for abstracting `IndexedDb` interactions.
- [esbuild](https://esbuild.github.io/) for the build process
- [TypeScript](https://www.typescriptlang.org/) for the whole project
- [prettier](https://prettier.io/) to help make the code readable...

### Images

- [Icons courtesy of feather icons](https://github.com/feathericons/feather)
- [Main menu background photo created by kjpargeter - www.freepik.com](https://www.pexels.com/photo/galaxy-digital-wallpaper-957085/)

