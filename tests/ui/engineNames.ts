// Every class a game can send the page by name has that name in the page's own words, in `en`, under the key and in
//  the namespace the interface looks it up by: Civilization's and Civilization II's (M2a E2, #1008) units, advances,
//  improvements, Wonders, governments, civilizations and their leaders, difficulty levels, terrains, terrain features
//  (River among Civ2's) and tile improvements, and the units' actions. A name with no string is shown as its class name
//  ("AlpineTrooper"), which is what this stops. The page loads every package's text whatever the game, as here.
//
// The classes are taken from each rule set's own lists, by their class names, which are what the engine sends (a type
//  tag such as `FundamentalismAdvance` is a save's name for it, not the page's).

import i18next from 'i18next';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';

import * as Civ1Advances from '@civ-clone/civ1-science/Advances';
import * as Civ1Civilizations from '@civ-clone/civ1-civilization/Civilizations';
import * as Civ1Difficulties from '@civ-clone/civ1-difficulty/Difficulties';
import * as Civ1Governments from '@civ-clone/civ1-government/Governments';
import * as Civ1Improvements from '@civ-clone/civ1-city-improvement/CityImprovements';
import * as Civ1Leaders from '@civ-clone/civ1-civilization/Leaders';
import * as Civ1TerrainFeatures from '@civ-clone/civ1-world/TerrainFeatures';
import * as Civ1Terrains from '@civ-clone/civ1-world/Terrains';
import * as Civ1TileImprovements from '@civ-clone/civ1-world/TileImprovements';
import * as Civ1UnitActions from '@civ-clone/civ1-unit/Actions';
import * as Civ1Units from '@civ-clone/civ1-unit/Units';
import * as Civ1Wonders from '@civ-clone/civ1-wonder/Wonders';
import * as Civ2Advances from '@civ-clone/civ2-science/Advances';
import * as Civ2Civilizations from '@civ-clone/civ2-civilization/Civilizations';
import * as Civ2Difficulties from '@civ-clone/civ2-difficulty/Difficulties';
import * as Civ2Governments from '@civ-clone/civ2-government/Governments';
import * as Civ2Improvements from '@civ-clone/civ2-city-improvement/CityImprovements';
import * as Civ2Leaders from '@civ-clone/civ2-civilization/Leaders';
import * as Civ2TerrainFeatures from '@civ-clone/civ2-world/TerrainFeatures';
import * as Civ2Terrains from '@civ-clone/civ2-world/Terrains';
import * as Civ2TileImprovements from '@civ-clone/civ2-world/TileImprovements';
import * as Civ2UnitActions from '@civ-clone/civ2-unit/Actions';
import * as Civ2Units from '@civ-clone/civ2-unit/Units';
import * as Civ2Wonders from '@civ-clone/civ2-wonder/Wonders';
import * as WorldCivilizations from '@civ-clone/civ1-world-civilizations/Civilizations';
import * as WorldLeaders from '@civ-clone/civ1-world-civilizations/Leaders';

let finished = false;

process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write('FAIL engineNames: stopped before every check ran\n');
    process.exitCode = 1;
  }
});

type Classes = { [name: string]: unknown };

// What the interface looks each kind of class up by: a key made from the class's name, in a namespace.
const kinds: [string, string, (name: string) => string[], Classes[]][] = [
  ['unit', 'unit', (name) => [`${name}.name`], [Civ1Units, Civ2Units]],
  [
    'unit action',
    'unit',
    (name) => [`Action.${name}.name`],
    [Civ1UnitActions, Civ2UnitActions],
  ],
  [
    'advance',
    'science',
    (name) => [`${name}.name`],
    [Civ1Advances, Civ2Advances],
  ],
  [
    'improvement',
    'city',
    (name) => [`Improvement.${name}.name`],
    [Civ1Improvements, Civ2Improvements],
  ],
  ['Wonder', 'wonder', (name) => [`${name}.name`], [Civ1Wonders, Civ2Wonders]],
  [
    'government',
    'government',
    (name) => [`${name}.name`],
    [Civ1Governments, Civ2Governments],
  ],
  [
    'civilization',
    'civilization',
    (name) => [`${name}.name`, `${name}.nation`, `${name}.plural`],
    [Civ1Civilizations, WorldCivilizations, Civ2Civilizations],
  ],
  [
    'leader',
    'civilization',
    (name) => [`Leader.${name}.name`],
    [Civ1Leaders, WorldLeaders, Civ2Leaders],
  ],
  [
    'difficulty level',
    'difficulty',
    (name) => [`${name}.name`],
    [Civ1Difficulties, Civ2Difficulties],
  ],
  [
    'terrain',
    'world',
    (name) => [`${name}.name`],
    [Civ1Terrains, Civ2Terrains],
  ],
  [
    'terrain feature',
    'world',
    (name) => [`Feature.${name}.name`],
    [Civ1TerrainFeatures, Civ2TerrainFeatures],
  ],
  [
    'tile improvement',
    'world',
    (name) => [`Improvement.${name}.name`],
    [Civ1TileImprovements, Civ2TileImprovements],
  ],
];

(async () => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  // Every package's text, as the page imports it (`buildTranslationList.js`), once i18next can take it.
  await import('../../src/js/translations');

  const failures: string[] = [];
  let checks = 0;

  kinds.forEach(([kind, ns, keys, lists]) => {
    const names = [
      ...new Set(
        lists.flatMap((classes) =>
          Object.values(classes)
            .filter(
              (value): value is { name: string } => typeof value === 'function'
            )
            .map(({ name }) => name)
        )
      ),
    ].sort();

    if (names.length === 0) {
      failures.push(`${kind}: no classes found`);
    }

    names.forEach((name) =>
      keys(name).forEach((key) => {
        checks++;

        if (!i18next.exists(key, { ns, lng: 'en' })) {
          failures.push(`${kind} ${name}: no ${ns}:${key} in en`);
        }
      })
    );
  });

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL engineNames (${
        failures.length
      } of ${checks} names)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS engineNames (${checks} names)\n`);
  process.exit(0);
})().catch((error) => {
  process.stderr.write(`FAIL engineNames: ${error?.stack ?? error}\n`);
  process.exit(1);
});
