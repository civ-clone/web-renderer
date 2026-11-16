// The civ2-enhanced set (M2d, #1007): loaded, it registers civ2-enhanced's three rule sets beneath its own, each on to
//  start with, and the game setup can switch each off and on again (`ruleSets` request), each named and described
//  in our own words (`translations/civ2-enhanced`).

// Must stay first: seeds `Math.random` before any engine module evaluates.
import './lib/seed';
import '@civ-clone/ui-worker-client/Game';
import i18next from 'i18next';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';
import pluginSets from '../../src/js/pluginSets';
import { pluginsFrom } from '@civ-clone/ui-worker-client/Plugins';
import {
  ruleSetDescription,
  ruleSetName,
} from '@civ-clone/ui-menus/lib/ruleSetControls';
import { ruleSetsData } from '@civ-clone/ui-worker-client/lib/ruleSets';

const failures: string[] = [];
let checks = 0,
  finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  const [a, e] = [actual, expected].map((value) => JSON.stringify(value));

  if (a !== e) {
    failures.push(`${description}\n    expected: ${e}\n    actual:   ${a}`);
  }
};

process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      'FAIL civ2EnhancedSets: stopped before the checks ran\n'
    );
    process.exitCode = 1;
  }
});

const ENHANCED = [
  'civ2-enhanced:attitude-drift',
  'civ2-enhanced:border-intruders',
  'civ2-enhanced:treaty-breaking',
];

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('../../translations/civ2-enhanced/en');

  await pluginsFrom(pluginSets)
    .sets.find(({ id }) => id === 'civ2-enhanced')!
    .load();

  const nodes = (list: any[]): any[] =>
      list.flatMap((node) => [node, ...nodes(node.members ?? [])]),
    on = (answer: any): string[] =>
      nodes(answer.sets)
        .filter(({ id, state }) => ENHANCED.includes(id) && state === 'on')
        .map(({ id }) => id)
        .sort(),
    first = ruleSetsData(null);

  expect(
    'civ2-enhanced’s three rule sets are offered, each on to start with',
    [
      ENHANCED.every((id) =>
        first.sets.some((set: any) => JSON.stringify(set).includes(id))
      ),
      on(first),
    ],
    [true, ENHANCED]
  );

  let choices = first.choices;

  for (const id of ENHANCED) {
    const off = ruleSetsData({ choices, change: { id, value: false } });

    expect(`${id} can be switched off`, on(off).includes(id), false);

    choices = ruleSetsData({
      choices: off.choices,
      change: { id, value: true },
    }).choices;

    expect(`and on again`, on(ruleSetsData({ choices })).includes(id), true);
  }

  expect(
    'each is named and described in our own words',
    ['civ2-enhanced', ...ENHANCED].map((id) => [
      ruleSetName(id) !== id,
      ruleSetDescription(id) !== '',
    ]),
    [
      [true, true],
      [true, true],
      [true, true],
      [true, true],
    ]
  );

  finished = true;
};

run().then(
  () => {
    if (failures.length > 0) {
      process.stderr.write(
        `FAIL civ2EnhancedSets (${
          failures.length
        } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
      );
      process.exit(1);
    }

    process.stdout.write(`PASS civ2EnhancedSets (${checks} checks)\n`);
    process.exit(0);
  },
  (error) => {
    process.stderr.write(`FAIL civ2EnhancedSets: ${error?.stack ?? error}\n`);
    process.exit(1);
  }
);
