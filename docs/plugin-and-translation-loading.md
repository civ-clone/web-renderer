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
  - one static import per package,
  - then an import of the rule set's worker rules, the package `package.json`'s `civ-clone.rules` names (#865), and
  - an exported `plugins` manifest: package name to installed version, sorted by name.

Observed behavior:

- Generated imports are absolute filesystem paths.
- Plugin side effects are expected to self-register with core registries when imported.
- The manifest is for saved games. `engine.registerPlugins(plugins)` hands it to the engine, `core-save-game` writes
  it into every save and refuses to write one with an empty manifest, and loading compares it with the manifest in the
  file: a save that needs a plugin this build lacks is refused, and differing versions are reported as drift.

## Runtime plugin activation

The worker client knows no ruleset of its own (#825). civ.one's worker entry, `src/js/backend.ts`, imports the
`plugins` manifest statically, so the plugin modules run, and register their rules, as soon as the worker script loads,
and hands `Game` a `Plugins` (`packages/worker-client/Plugins.ts`): the manifest, and `load`, which imports them.
`Game` and `restoreGame` take everything plugin-related from it, so another build or a test can hand in other rules.
Suites hand in civ.one's with `tests/engine/lib/plugins.ts`.

What the worker client needs that only one rule set has, it asks of that rule set's worker rules (#865,
`packages/worker-client/workerRules.ts`): its own player actions and their handlers, the classes a save can name,
whether a city is in civil disorder, choosing an Auto city's build, citizens' moods, the conquest bonus, the
difficulty's level, the final rating and famous leader, and which units need fuel. civ.one's are Civ1's,
`@civ-clone/ui-rules-civ1` (`packages/rules-civ1`), which also registers Civ1's AdditionalData (`anarchyTurns`,
`civilDisorderDeclared`, a terrain's `defence` and `movementCost`). The plugin list imports it after the plugins, and
it hands itself in with `setWorkerRules`. The client asks for them only once a game is under way; an engine suite
that never imports the plugin list imports `@civ-clone/ui-rules-civ1` itself.

In `Game.start()` (a new game):

- Registers `engine:start` handlers that call `engine.registerPlugins(plugins)` and register the save-game classes
  (`registerClasses`, `registerDiplomacyClasses`), then create the players and their clients.
- Calls `engine.start()`.
- Imports `../plugins` again; once that resolves, emits `plugins:load:end` for engine lifecycle progression.

In `Game.load(file)` (a saved game):

- Imports `../plugins` and then calls `loadGame`, which registers the manifest itself. `engine.start()` is never
  called, so `engine:start` never fires and the rules that build a world and place settlers do not run.

Because the plugins' rules close over the singleton registries, a game cannot be loaded over one in progress. Loading
reloads the page and hands the save to a fresh worker (see `packages/menus/lib/savedGame.ts`).

## Rule sets

A plugin can group its rules into **rule sets**, which a new game can switch on or off (#158). The engine's `core-rule` has the model (`RuleSet`, `RuleSetRegistry`); a game's are in `defaultGame.ruleSets`.

- **civ.one's sets** are `civ1-unit:obsolescence` (units go obsolete) and `civ1-enhanced` (#954), which holds the rules where play departs from the original game, each a set beneath it that supersedes the Civ1 rule it replaces: switched off, the original runs. Their names are in `translations/civ1-unit` and `translations/civ1-enhanced`.
- **A plugin registers a set** in its `registerRules(game)`: `game.ruleSets.register(new RuleSet('civ1-unit:obsolescence', ...ruleIds))`. Members are rule ids, or other sets, so sets nest.
- **A set can replace another package's rules** (#954) without that package knowing: `new RuleSet('civ1-enhanced:hydro-plant-site', { supersedes: ['civ1-city-improvement:city/build/hydro-plant-site'] }, 'civ1-enhanced:city/build/hydro-plant-site')`. While the set is in force (on, and not beneath an alternative that isn't chosen) nothing it supersedes runs; switched off, the original is back. It names rules or sets (a set meaning every rule beneath it), and it carries through: a set that replaces one that replaced a third keeps the third off too. A set that supersedes is switched like any other, so it can sit under a parent ("Enhanced rules") whose checkbox switches it with the rest. What is superseded keeps its setting and isn't saved: it is worked out from the sets.
- **A choice between alternatives** is a set with `{ exclusive: true }`: exactly one member is in force, its `default` until another is chosen. For three or more equals; for an enhanced rule against the Civ1 one, `supersedes` is simpler. A choice that more than one package adds members to should name its `default`, or which comes first depends on the order they load in.
- **A set belongs to no package.** Any plugin may declare a set by id, and every declaration of one id is one set: their members and what they supersede together, in the order they arrive, and their options (`exclusive`, `enabled`, `default`) where they state them. So a plugin adds to another plugin's set by declaring it again with its members, or with `game.ruleSets.extend(id, ...members)`, whichever of the two loads first. Merging never replaces anything: only `supersedes` does.
- **The worker validates them** (`ruleSets.validate()`) once the plugins are in, and every problem goes to the page with the sets. The setup window shows each in the Rules section:

  | Kind                                                     | What it means                                                                                                                                                                                              | The setup window                                                                                                                                                    |
  | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `conflict`                                               | two sets in force supersede the same rule, and neither supersedes or holds the other                                                                                                                       | an error naming both sets, that they can't both be on; both rows marked. Start is held until the player switches one off                                            |
  | `cycle`, `duplicate-id`, `option-conflict`, `no-default` | a package's mistake: a set inside or superseding itself, a set id that is also a rule id, two declarations stating an option differently, a choice with members from several declarations and no `default` | one error, that the rule sets can't be used as they are, with the rules' own message for each beneath it. Start is held: the player can't fix it, the package must  |
  | `unknown-member`, `unknown-superseded`                   | a set names, or supersedes, an id nothing registered: often a package that isn't loaded                                                                                                                    | a quiet note that the set refers to a rule or rule set that isn't loaded. It holds nothing: the set works without it, and the id is switched as usual if it arrives |

  A rule or set that another has replaced just now says "replaced by" that set beside its name. The worker is the backstop: a game is not started with a problem that blocks, and a save whose sets, as it chose them, have one is not loaded (the player is told why); a save whose sets only name something not loaded is loaded, and the console says what.

- **The page works none of it out.** It asks `ruleSets` for the tree and its problems (`packages/worker-client/lib/ruleSets.ts`), and for each change the player makes asks again with the choices so far and the change; `packages/menus/lib/ruleSetControls.ts` draws the answer in both interfaces' setup. It never decides what conflicts or what replaces what. The choices go with `setOptions` as `ruleSets`, are applied as the game starts, and are fixed from then on. A save records them and a load puts them back (`core-save-game`).
- **Names** are translations in the `ruleset` namespace, keyed by the id with `:` and `/` as `.`: `civ1-unit.obsolescence.name`, and an optional `.description`. A set without one shows its id. A rule inside a plain set is drawn only if it has a name; the alternatives of a choice always are. The setup's own words about the sets (the problems, "replaced by") are under `RuleSets.` in the same namespace, in `packages/menus/translations`.

## Translation loading strategy

`buildTranslationList.js` (`npm run build:generate-translations-ts`):

- Scans `translations/*/*.ts`, one directory per engine package (`civ1-unit`, `civ1-science`, ...), and
  `packages/*/translations/*.ts`, each frontend package's own strings (#825), with a file per language (`en.ts`, and
  `en-GB.ts` where British English differs). A string goes in the package that shows it; one that several show goes
  in the package they all build on.
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
