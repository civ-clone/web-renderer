// A new game can switch rule sets (#158): named groups of rules, registered by the plugins in `game.ruleSets`. The
//  first is "units go obsolete", `civ1-unit:obsolescence`, over the thirteen rules that stop a city building a unit
//  once its player knows a later advance. This checks what the setup is told and what switching does, with the plugins
//  the game is built with: that the page is answered from the rules and keeps nothing here between askings, that a game
//  started with the set off lets a city go on building Warriors after Gunpowder, that a save carries the choice and a
//  load puts it back, and that the civilopedia stops saying a unit goes obsolete in a game where it doesn't.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import './lib/seed';

import { Musketman, Warrior } from '@civ-clone/civ1-unit/Units';
import {
  applyRuleSets,
  ruleSetsData,
} from '@civ-clone/ui-worker-client/lib/ruleSets';
import { defaultGame, defaultSlots } from '@civ-clone/core-game/defaultGame';
import Build from '@civ-clone/core-city-build/Rules/Build';
import CityBuild from '@civ-clone/core-city-build/CityBuild';
import { Gunpowder } from '@civ-clone/civ1-science/Advances';
import { OBSOLESCENCE } from '@civ-clone/civ1-unit/RuleSets';
import PlayerResearch from '@civ-clone/core-science/PlayerResearch';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import { RuleSetNode } from '@civ-clone/ui-protocol/Requests/RuleSets';
import civilopediaData from '@civ-clone/ui-worker-client/lib/civilopedia';
import { gameForLoad } from '@civ-clone/core-save-game/gameForLoad';
import { hydrate } from '@civ-clone/core-save-game/hydrate';
import civOnePlugins from './lib/plugins';
import { registerClasses } from '@civ-clone/core-save-game/registerClasses';
import requirementsData from '@civ-clone/ui-worker-client/lib/requirements';
import { save } from '@civ-clone/core-save-game/save';
import setUpCity from '@civ-clone/civ1-city/tests/lib/setUpCity';

const failures: string[] = [];
let finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

const throws = (action: () => unknown): string | null => {
  try {
    action();

    return null;
  } catch (error) {
    return (error as Error).constructor.name;
  }
};

// A suite that stops before its checks would otherwise pass in silence (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write('FAIL ruleSets: stopped before its checks\n');
    process.exitCode = 1;
  }
});

const OFF = { id: OBSOLESCENCE, value: false },
  WARRIOR = 'civ1-unit:city/build/obsolete/Warrior';

const find = (sets: RuleSetNode[], id: string): RuleSetNode | null =>
  sets.reduce(
    (found: RuleSetNode | null, node) =>
      found ?? (node.id === id ? node : find(node.members, id)),
    null
  );

const check = async (): Promise<void> => {
  const { rules, ruleSets } = defaultGame,
    // The units' entries, and not the Wonders', which go obsolete by rules of their own.
    obsolete = (): string[] =>
      requirementsData()
        .map(({ id }) => id)
        .filter((id) => id.startsWith('civ1-unit:city/build/obsolete/'));

  expect(
    "the plugins' sets name only rules and sets that are registered",
    throws(() => ruleSets.check()),
    null
  );

  // --- what the setup is told ------------------------------------------------------------------------------------
  const start = ruleSetsData(null),
    set = find(start.sets, OBSOLESCENCE);

  expect(
    'units going obsolete is a set the setup is told of: on, a checkbox, over thirteen rules, nothing chosen',
    [
      set?.kind,
      set?.state,
      set?.switchable,
      set?.active,
      set?.members.length,
      set?.members.every(
        ({ kind, id }) =>
          kind === 'rule' && id.startsWith('civ1-unit:city/build/obsolete/')
      ),
      start.choices,
    ],
    ['set', 'on', true, true, 13, true, []]
  );

  const off = ruleSetsData({ choices: [], change: OFF });

  expect(
    'switched off, it is off with every rule beneath it, and that is one choice',
    [
      find(off.sets, OBSOLESCENCE)?.state,
      find(off.sets, OBSOLESCENCE)?.members.every(
        ({ state }) => state === 'off'
      ),
      off.choices,
      rules.getById(WARRIOR)?.enabled(),
    ],
    ['off', true, [OFF], false]
  );

  const mixed = ruleSetsData({
    choices: off.choices,
    change: { id: WARRIOR, value: true },
  });

  expect(
    'with one of its rules back on, it is mixed, and the choices say which',
    [
      find(mixed.sets, OBSOLESCENCE)?.state,
      mixed.choices.length,
      mixed.choices.some(({ id }) => id === OBSOLESCENCE),
    ],
    ['mixed', 12, false]
  );

  expect(
    'nothing is kept between one asking and the next: asked with nothing, the sets are as they start',
    [
      find(ruleSetsData(null).sets, OBSOLESCENCE)?.state,
      rules.getById(WARRIOR)?.enabled(),
    ],
    ['on', true]
  );

  expect(
    'a choice nothing answers to is left out, a change nothing answers to is refused, and so is a wrong shape',
    [
      ruleSetsData({ choices: [{ id: 'nothing:here', value: false }, OFF] })
        .choices,
      throws(() =>
        ruleSetsData({
          choices: [],
          change: { id: 'nothing:here', value: false },
        })
      ),
      throws(() => ruleSetsData({ choices: 'civ1-unit:obsolescence' } as any)),
      throws(() =>
        ruleSetsData({ choices: [], change: { id: OBSOLESCENCE } } as any)
      ),
    ],
    [[OFF], 'UnknownRuleSetError', 'TypeError', 'TypeError']
  );

  // --- a game started under them -----------------------------------------------------------------------------------
  expect(
    'a game does not start with a choice nothing answers to, or with choices that are not a list of them',
    [
      throws(() => applyRuleSets([{ id: 'nothing:here', value: false }])),
      throws(() => applyRuleSets({ [OBSOLESCENCE]: false })),
      throws(() => applyRuleSets([])),
    ],
    ['Error', 'TypeError', null]
  );

  applyRuleSets([OFF]);

  expect(
    'once a game is being played the sets are described and not switched',
    [
      find(
        ruleSetsData(
          { choices: [], change: { id: OBSOLESCENCE, value: true } },
          true
        ).sets,
        OBSOLESCENCE
      )?.state,
      rules.getById(WARRIOR)?.enabled(),
    ],
    ['off', false]
  );

  expect(
    'with it off, the civilopedia is told of no unit going obsolete or being replaced, and no entry names either',
    [
      obsolete(),
      requirementsData().filter(({ relation }) => relation === 'replacedBy')
        .length,
      civilopediaData()
        .flatMap(({ requires, leadsTo }) => [...requires, ...leadsTo])
        .filter((id) =>
          /^civ1-unit:(city\/build\/obsolete|unit\/replaced-by)\//.test(id)
        ),
      requirementsData().some(
        ({ id }) => id === 'civ1-unit:city/build/requires-advance/Musketman'
      ),
    ],
    [[], 0, [], true]
  );

  // --- saved and loaded --------------------------------------------------------------------------------------------
  defaultGame.engine.registerPlugins(civOnePlugins.manifest);
  registerClasses(defaultGame);

  const file = save(defaultGame, { name: 'rule sets', createdAt: 0 });

  expect('a save says what the game chose', file.ruleSets, { choices: [OFF] });

  // As a fresh worker is before it loads: the plugins in, nothing chosen.
  ruleSets.reset();

  expect(
    '(a fresh boot has units going obsolete, and being replaced)',
    [
      rules.getById(WARRIOR)?.enabled(),
      obsolete().length,
      requirementsData().filter(({ relation }) => relation === 'replacedBy')
        .length,
    ],
    [true, 13, 13]
  );

  const loaded = gameForLoad(defaultSlots);

  registerClasses(loaded, { collisions: [] });
  hydrate(file, loaded);

  expect(
    'and the game loaded from it is played under the same: the set is off again, and saved again as it was',
    [
      loaded.ruleSets === ruleSets,
      ruleSets.state(OBSOLESCENCE),
      rules.getById(WARRIOR)?.enabled(),
      save(loaded, { name: 'rule sets', createdAt: 0 }).ruleSets,
    ],
    [true, 'off', false, { choices: [OFF] }]
  );

  const { ruleSets: recorded, ...before } = file;

  hydrate(before, loaded);

  expect(
    'a save from before rule sets, which records none, is played with every set as it starts',
    [recorded, ruleSets.state(OBSOLESCENCE), rules.getById(WARRIOR)?.enabled()],
    [{ choices: [OFF] }, 'on', true]
  );

  // --- what it does to a city --------------------------------------------------------------------------------------
  // An inland city, with the build rules of every plugin, of a player who has Gunpowder.
  const cityRules = new RuleRegistry(),
    city = await setUpCity({ ruleRegistry: cityRules }),
    research = new PlayerResearch(city.player(), defaultGame.advances, rules),
    cityBuild = new CityBuild(
      city,
      defaultGame.availableCityBuildItems,
      cityRules
    ),
    buildable = (Item: Function): boolean =>
      cityBuild.available().some((BuildItem) => BuildItem.item() === Item);

  defaultGame.playerResearch.register(research);
  cityRules.register(...rules.get(Build));
  research.addAdvance(Gunpowder);

  expect(
    'as the game is by default, a city whose player has Gunpowder builds Musketmen and no more Warriors',
    [buildable(Musketman), buildable(Warrior)],
    [true, false]
  );

  applyRuleSets([OFF]);

  expect(
    'in a game started without units going obsolete, it builds Musketmen and Warriors still',
    [buildable(Musketman), buildable(Warrior)],
    [true, true]
  );

  ruleSets.reset();

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL ruleSets (${failures.length})\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(
    `PASS ruleSets (${ruleSets.entries().length} set(s), ${
      set?.members.length
    } rules in ${OBSOLESCENCE})\n`
  );
};

import('../../src/js/plugins').then(check).catch((error) => {
  process.stderr.write(`FAIL ruleSets: ${error?.stack ?? error}\n`);
  process.exit(1);
});
