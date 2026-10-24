# Contributing

Thanks for looking. [`docs/quick-start.md`](./docs/quick-start.md) is the guide:
running the game locally, where the code is, the checks to run, and how a
change to one of the engine packages is tested here and shipped with
`./tools/civ`.

The short version for a change to this repository:

1. Branch from `main`, make the change, and run `npm run prettier:format`,
   `npm run ts:compile` and the suites it touches (`npm test` runs everything,
   in about five minutes).
2. Write the commit message for a player: the bodies of the commits on `main`
   are the release notes shown in the game, one bullet per paragraph, with
   issue references inline ("…stopped working (closes #46)."). Implementation
   detail belongs in the pull request. `CLAUDE.md` has the rule.
3. Text shown to players goes in `translations/local/en.ts`, with a British
   spelling in `en-GB.ts` where the two differ.
4. Open a pull request against `main`. CI runs `npm run prettier:check` and
   `npm test`; merging deploys to [civ.one](https://civ.one).

For a change to an engine package, see the quick start's
[Change the engine](./docs/quick-start.md#change-the-engine): the package has
its own repository and `master` branch, and the renderer is where it is tested.
Problems and ideas go to this repository's
[issues](https://github.com/civ-clone/web-renderer/issues) whichever package
they turn out to belong to.
