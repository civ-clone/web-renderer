// A new game can switch rule sets (#158): named groups of rules, registered by the plugins in `game.ruleSets`. The
//  first is "units go obsolete", `civ1-unit:obsolescence`, over the thirteen rules that stop a city building a unit
//  once its player knows a later advance. This checks what the setup is told and what switching does, with the plugins
//  the game is built with: that the page is answered from the rules and keeps nothing here between askings, that a game
//  started with the set off lets a city go on building Warriors after Gunpowder, that a save carries the choice and a
//  load puts it back, and that the civilopedia stops saying a unit goes obsolete in a game where it doesn't. And, with
//  sets of its own in rules of its own (#954), that what is wrong with the sets goes to the page with each answer, and
//  that a game is not started or loaded under sets with a problem that blocks. With the plugins again, the enhanced
//  rules (`civ1-enhanced`, #954, #959, #960): where play departs from the original, each of the twelve a set that a game
//  can switch back, as it starts (all but the three new variants on, which is play as it has been: the Hydro Plant on
//  its own square, SDI Defense sparing its city, defectors staying veteran), switched, started, saved and loaded.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import './lib/seed';

import { Musketman, Warrior } from '@civ-clone/civ1-unit/Units';
import {
  applyRuleSets,
  checkSavedRuleSets,
  ruleSetsData,
} from '@civ-clone/ui-worker-client/lib/ruleSets';
import Rule from '@civ-clone/core-rule/Rule';
import RuleSet from '@civ-clone/core-rule/RuleSet';
import RuleSetRegistry from '@civ-clone/core-rule/RuleSetRegistry';
import { defaultGame, defaultSlots } from '@civ-clone/core-game/defaultGame';
import {
  BARBARIAN_CITY_BUILDS,
  BARBARIAN_LEADER_RANSOM,
  BARBARIAN_UPRISINGS,
  CAPTURED_CITY_BUILD,
  DEFECTORS_STAY_VETERAN,
  ENHANCED,
  EVEN_ADVANCE_STEALING,
  HYDRO_PLANT_SITE,
  OBSOLETE_BUILDS,
  POLLUTION_IN_EVERY_CITY,
  SDI_DEFENSE_SPARES_CITIES,
  SETTLERS_WAIT_FOR_SIZE_TWO,
  UNITED_NATIONS_STOPS_COMPUTER_WARS,
} from '@civ-clone/civ1-enhanced/RuleSets';
import {
  HYDRO_PLANT_SITE_RULE as CIV1_HYDRO_PLANT_SITE_RULE,
  POLLUTION_RULE as CIV1_POLLUTION_RULE,
} from '@civ-clone/civ1-city-improvement/RuleIds';
import {
  CLEAR_CAPTURED_BUILD_RULE,
  HALVE_CITIES_RULE,
  HYDRO_PLANT_SITE_RULE,
  KEEP_VETERAN_RULE,
  LAND_UPRISING_RULE,
  POLLUTION_RULE,
  RAIDERS_ONLY_RULE,
  RANSOM_RULE,
  REVALIDATE_BUILDS_RULE,
  SETTLERS_WAIT_RULE,
  STEAL_RULE,
  UNITED_NATIONS_PACIFIED_RULE,
} from '@civ-clone/civ1-enhanced/RuleIds';
import {
  CHIEFTAIN_SETTLERS_RULE as CIV1_CHIEFTAIN_SETTLERS_RULE,
  HALVE_CITIES_RULE as CIV1_HALVE_CITIES_RULE,
  START_AFRESH_RULE as CIV1_START_AFRESH_RULE,
  STEAL_RULE as CIV1_STEAL_RULE,
} from '@civ-clone/civ1-unit/RuleIds';
import { UNITED_NATIONS_PACIFIED_RULE as CIV1_UNITED_NATIONS_PACIFIED_RULE } from '@civ-clone/civ1-wonder/RuleIds';
import {
  LAND_UPRISING_RULE as CIV1_LAND_UPRISING_RULE,
  RAIDERS_ONLY_RULE as CIV1_RAIDERS_ONLY_RULE,
  RANSOM_RULE as CIV1_RANSOM_RULE,
} from '@civ-clone/civ1-barbarians/RuleIds';
import Build from '@civ-clone/core-city-build/Rules/Build';
import { KEEP_BUILD_RULE as CIV1_KEEP_BUILD_RULE } from '@civ-clone/civ1-city/RuleIds';
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

// What is wrong with the sets (#954), with sets and rules made here, in a registry of their own: two sets that replace
//  the same rule, a set that names a rule that isn't loaded, and, apart, a set two packages declare differently.
const problems = (): void => {
  const rules = new RuleRegistry(),
    ruleSets = RuleSetRegistry.of(rules),
    kinds = (answer: { problems: { kind: string; blocking: boolean }[] }) =>
      answer.problems.map(({ kind, blocking }) => `${kind} ${blocking}`);

  [
    'test:original',
    'test:a/replacement',
    'test:b/replacement',
    'test:orphan/rule',
  ].forEach((id) => rules.register(new Rule(id)));

  ruleSets.register(
    new RuleSet('test:base', 'test:original'),
    new RuleSet(
      'test:a',
      { supersedes: ['test:original'] },
      'test:a/replacement'
    ),
    new RuleSet(
      'test:b',
      { supersedes: ['test:original'] },
      'test:b/replacement'
    ),
    new RuleSet('test:orphan', 'test:orphan/rule', 'test:not-loaded')
  );

  const both = ruleSetsData(null, false, ruleSets),
    conflict = both.problems.find(({ kind }) => kind === 'conflict');

  expect(
    'two sets on that replace the same rule are a conflict that blocks, about both, and the set naming a rule that is not loaded is said and does not block; the page is answered all the same',
    [kinds(both).sort(), conflict?.ids, typeof conflict?.message],
    [['conflict true', 'unknown-member false'], ['test:a', 'test:b'], 'string']
  );

  const one = ruleSetsData(
    { choices: both.choices, change: { id: 'test:b', value: false } },
    false,
    ruleSets
  );

  expect(
    'with one of them switched off the conflict is gone, the orphan is still said, and the rule replaced says by what',
    [
      kinds(one),
      one.problems[0]?.ids,
      find(one.sets, 'test:original')?.supersededBy,
      find(one.sets, 'test:original')?.active,
      find(one.sets, 'test:a')?.supersedes,
    ],
    [
      ['unknown-member false'],
      ['test:orphan', 'test:not-loaded'],
      ['test:a'],
      false,
      ['test:original'],
    ]
  );

  expect(
    'and switched back on, the conflict is back: nothing is kept between askings',
    kinds(
      ruleSetsData(
        { choices: one.choices, change: { id: 'test:b', value: true } },
        false,
        ruleSets
      )
    ).sort(),
    ['conflict true', 'unknown-member false']
  );

  expect(
    'a game is not started under the two, and is under one, the orphan notwithstanding',
    [
      throws(() => applyRuleSets([], ruleSets)),
      throws(() => applyRuleSets(one.choices, ruleSets)),
    ],
    ['Error', null]
  );

  expect(
    'nor is a save loaded that chose the two, while one that chose one is, with the orphan to say',
    [
      throws(() => checkSavedRuleSets([], ruleSets)),
      throws(() => checkSavedRuleSets(undefined, ruleSets)),
      checkSavedRuleSets(one.choices, ruleSets).map(({ kind }) => kind),
    ],
    ['Error', 'Error', ['unknown-member']]
  );

  ruleSets.dispose();

  // A package's mistake: two declarations of one set that disagree on whether it starts on.
  const mistaken = new RuleRegistry(),
    mistakes = RuleSetRegistry.of(mistaken);

  mistaken.register(new Rule('test:mistake/rule'));
  mistakes.register(
    new RuleSet('test:mistake', { enabled: true }, 'test:mistake/rule'),
    new RuleSet('test:mistake', { enabled: false })
  );

  const mistake = ruleSetsData(null, false, mistakes);

  expect(
    "a package's mistake is answered, not thrown, and blocks: no game starts, and no save loads, under it",
    [
      kinds(mistake),
      mistake.sets.map(({ id }) => id),
      throws(() => applyRuleSets([], mistakes)),
      throws(() => checkSavedRuleSets([], mistakes)),
    ],
    [['option-conflict true'], ['test:mistake'], 'Error', 'Error']
  );

  mistakes.dispose();
};

const check = async (): Promise<void> => {
  problems();

  const { rules, ruleSets } = defaultGame,
    // The units' entries, and not the Wonders', which go obsolete by rules of their own.
    obsolete = (): string[] =>
      requirementsData()
        .map(({ id }) => id)
        .filter((id) => id.startsWith('civ1-unit:city/build/obsolete/'));

  expect(
    "the plugins' sets name only rules and sets that are registered, and nothing is wrong with them",
    [throws(() => ruleSets.check()), ruleSets.validate()],
    [null, []]
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

  // --- the enhanced rules (#954) -------------------------------------------------------------------------------------
  // Each set beneath them, in the order the setup draws them, with its enhanced rule and the original it replaces (none
  //  for the obsolete build dropped, which is a rule added to the original's).
  const sets: [string, string, string | null][] = [
      [HYDRO_PLANT_SITE, HYDRO_PLANT_SITE_RULE, CIV1_HYDRO_PLANT_SITE_RULE],
      [BARBARIAN_LEADER_RANSOM, RANSOM_RULE, CIV1_RANSOM_RULE],
      [OBSOLETE_BUILDS, REVALIDATE_BUILDS_RULE, null],
      [CAPTURED_CITY_BUILD, CLEAR_CAPTURED_BUILD_RULE, CIV1_KEEP_BUILD_RULE],
      [POLLUTION_IN_EVERY_CITY, POLLUTION_RULE, CIV1_POLLUTION_RULE],
      [BARBARIAN_CITY_BUILDS, RAIDERS_ONLY_RULE, CIV1_RAIDERS_ONLY_RULE],
      [BARBARIAN_UPRISINGS, LAND_UPRISING_RULE, CIV1_LAND_UPRISING_RULE],
      [
        UNITED_NATIONS_STOPS_COMPUTER_WARS,
        UNITED_NATIONS_PACIFIED_RULE,
        CIV1_UNITED_NATIONS_PACIFIED_RULE,
      ],
      [EVEN_ADVANCE_STEALING, STEAL_RULE, CIV1_STEAL_RULE],
      [SDI_DEFENSE_SPARES_CITIES, HALVE_CITIES_RULE, CIV1_HALVE_CITIES_RULE],
      [DEFECTORS_STAY_VETERAN, KEEP_VETERAN_RULE, CIV1_START_AFRESH_RULE],
      [
        SETTLERS_WAIT_FOR_SIZE_TWO,
        SETTLERS_WAIT_RULE,
        CIV1_CHIEFTAIN_SETTLERS_RULE,
      ],
    ],
    // The new variants, each off to start with.
    startsOff = [
      HYDRO_PLANT_SITE,
      SDI_DEFENSE_SPARES_CITIES,
      DEFECTORS_STAY_VETERAN,
    ],
    // As the game has been played: every one on but the new variants.
    asPlayed = sets.map(([id]) => id).filter((id) => !startsOff.includes(id)),
    // Which of the rules they switch run, enhanced and original.
    running = (): string[] =>
      sets
        .flatMap(([, enhanced, original]) => [enhanced, original])
        .filter(
          (id): id is string =>
            id !== null && (rules.getById(id)?.enabled() ?? false)
        ),
    // Which of them should run with `on` the sets in force: each one's enhanced rule, or else its original.
    inForce = (on: string[]): string[] =>
      sets.flatMap(([id, enhanced, original]) =>
        on.includes(id) ? [enhanced] : original === null ? [] : [original]
      ),
    // How the setup should draw each set with `on` the sets in force.
    drawn = (on: string[]): string[] =>
      sets.map(([id]) => `${id} ${on.includes(id) ? 'on' : 'off'}`),
    enhanced = (nodes: RuleSetNode[]): unknown => {
      const node = find(nodes, ENHANCED);

      return [
        node?.kind,
        node?.state,
        node?.switchable,
        node?.members.map(({ id, state }) => `${id} ${state}`),
      ];
    },
    asStarted = ruleSetsData(null);

  expect(
    'the enhanced rules are a set the setup is told of, mixed: the three new variants off, the other nine on, as the game has been played; nothing is chosen, and nothing is wrong',
    [enhanced(asStarted.sets), asStarted.choices, asStarted.problems],
    [['set', 'mixed', true, drawn(asPlayed)], [], []]
  );
  expect(
    "and so the originals of the three variants run, and each other enhanced rule in place of the original's",
    running(),
    inForce(asPlayed)
  );
  expect(
    'each that replaces an original rule says so',
    sets.map(([id]) => find(asStarted.sets, id)?.supersedes ?? []),
    sets.map(([, , original]) => (original === null ? [] : [original]))
  );

  const switched = (
    change: { id: string; value: boolean },
    choices = asStarted.choices
  ) => {
    const answer = ruleSetsData({ choices, change });

    return {
      answer,
      seen: [enhanced(answer.sets), answer.choices, answer.problems, running()],
    };
  };

  // Each that starts off, ticked alone: its rule runs in place of the original, and only that one.
  startsOff.forEach((id: string): void => {
    const on = [...asPlayed, id];

    expect(
      `${id} ticked: the set is on, and its rule runs in place of the original`,
      switched({ id, value: true }).seen,
      [
        ['set', 'mixed', true, drawn(on)],
        [{ id, value: true }],
        [],
        inForce(on),
      ]
    );
  });

  // Each that starts on, unticked alone: the parent mixed, the choice that one, and its original running again.
  asPlayed.forEach((id: string): void => {
    const on = asPlayed.filter((other) => other !== id);

    expect(
      `${id} unticked: the original's rule runs again, and only that one`,
      switched({ id, value: false }).seen,
      [
        ['set', 'mixed', true, drawn(on)],
        [{ id, value: false }],
        [],
        inForce(on),
      ]
    );
  });

  const allOff = switched({ id: ENHANCED, value: false });

  expect(
    'the enhanced rules unticked as one: every one off, and the original rules run',
    allOff.seen,
    [
      ['set', 'off', true, drawn([])],
      // The shortest list that says so: the three variants start off.
      asPlayed.map((id) => ({ id, value: false })),
      [],
      inForce([]),
    ]
  );
  expect(
    'and ticked again as one: every one on, the three variants too',
    switched({ id: ENHANCED, value: true }, allOff.answer.choices).seen,
    [
      ['set', 'on', true, drawn(sets.map(([id]) => id))],
      startsOff.map((id) => ({ id, value: true })),
      [],
      inForce(sets.map(([id]) => id)),
    ]
  );
  expect(
    '(and asked with nothing, they are as they start)',
    [enhanced(ruleSetsData(null).sets), running()],
    [['set', 'mixed', true, drawn(asPlayed)], inForce(asPlayed)]
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

  // --- the enhanced rules started, saved and loaded (#954) ------------------------------------------------------
  // The Hydro Plant's and the SDI Defense's ticked, and all but the obsolete build and defectors otherwise as they
  //  start unticked.
  const enhancedChoices = [
      { id: HYDRO_PLANT_SITE, value: true },
      { id: BARBARIAN_LEADER_RANSOM, value: false },
      { id: CAPTURED_CITY_BUILD, value: false },
      { id: POLLUTION_IN_EVERY_CITY, value: false },
      { id: BARBARIAN_CITY_BUILDS, value: false },
      { id: BARBARIAN_UPRISINGS, value: false },
      { id: UNITED_NATIONS_STOPS_COMPUTER_WARS, value: false },
      { id: EVEN_ADVANCE_STEALING, value: false },
      { id: SDI_DEFENSE_SPARES_CITIES, value: true },
      { id: SETTLERS_WAIT_FOR_SIZE_TWO, value: false },
    ],
    enhancedOn = [HYDRO_PLANT_SITE, OBSOLETE_BUILDS, SDI_DEFENSE_SPARES_CITIES];

  // What the civilopedia and the build-refusal window are told a Hydro Plant needs where it stands (#954): the
  //  conditions of its requirements in force, as the worker sends them when asked.
  const hydroSite = (): string[] =>
    requirementsData()
      .filter(
        ({ subject, relation }) =>
          subject === 'HydroPlant' && relation === 'requires'
      )
      .flatMap(({ targets }) =>
        targets.flatMap((target) =>
          'condition' in target ? [target.condition] : []
        )
      );

  applyRuleSets([]);

  const defaultSite = hydroSite();

  applyRuleSets(enhancedChoices);

  const startedRunning = running(),
    startedSite = hydroSite(),
    enhancedFile = save(defaultGame, { name: 'enhanced', createdAt: 0 });

  ruleSets.reset();

  const resetRunning = running(),
    resetSite = hydroSite();

  hydrate(enhancedFile, loaded);

  expect(
    'a Hydro Plant needs Mountains or a River next to the city as the game starts, and on or next to it in a game started with the enhanced site, or loaded from one: one or the other, never both',
    [defaultSite, startedSite, resetSite, hydroSite()],
    [
      ['civ1-city-improvement:mountains-or-river-nearby'],
      ['civ1-enhanced:mountains-or-river-on-or-nearby'],
      ['civ1-city-improvement:mountains-or-river-nearby'],
      ['civ1-enhanced:mountains-or-river-on-or-nearby'],
    ]
  );

  expect(
    'a game started with the Hydro Plant on its own square, SDI Defense sparing its city, and the original ransom, captured build, pollution, Barbarian builds and uprisings, United Nations, stealing and Settlers saves them, and loads under them again',
    [
      startedRunning,
      enhancedFile.ruleSets,
      resetRunning,
      running(),
      ruleSets.choices(),
    ],
    [
      inForce(enhancedOn),
      { choices: enhancedChoices },
      inForce(asPlayed),
      inForce(enhancedOn),
      enhancedChoices,
    ]
  );

  ruleSets.reset();

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

  // --- the obsolete build dropped (#693, #954) -------------------------------------------------------------------
  // A city of a player who doesn't know Gunpowder, building Warriors, in a game started with `choices`: what it is
  //  building once Gunpowder is discovered.
  const buildingAfterGunpowder = async (
    choices: { id: string; value: boolean }[]
  ): Promise<string | null> => {
    applyRuleSets(choices);

    const ownRules = new RuleRegistry(),
      ownCity = await setUpCity({ ruleRegistry: ownRules }),
      ownResearch = new PlayerResearch(
        ownCity.player(),
        defaultGame.advances,
        rules
      ),
      ownBuild = new CityBuild(
        ownCity,
        defaultGame.availableCityBuildItems,
        ownRules
      );

    ownRules.register(...rules.get(Build));
    defaultGame.playerResearch.register(ownResearch);
    defaultGame.cities.register(ownCity);
    defaultGame.cityBuilds.register(ownBuild);
    ownBuild.build(Warrior);
    ownResearch.addAdvance(Gunpowder);

    const building = ownBuild.building()?.item().name ?? null;

    defaultGame.cityBuilds.unregister(ownBuild);
    defaultGame.cities.unregister(ownCity);
    defaultGame.playerResearch.unregister(ownResearch);

    return building;
  };

  expect(
    'a city building Warriors when its player discovers Gunpowder stops building them, as the game is by default; with the obsolete build unticked, or the enhanced rules, it goes on',
    [
      await buildingAfterGunpowder([]),
      await buildingAfterGunpowder([{ id: OBSOLETE_BUILDS, value: false }]),
      await buildingAfterGunpowder([{ id: ENHANCED, value: false }]),
    ],
    [null, 'Warrior', 'Warrior']
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
