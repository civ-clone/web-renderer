// What keeps the unit stack window current (#344). The window opened on a stack watches the ids of the units it was
// opened with through the shared `DataChanges` instance: it redraws on the render after one of them changes, showing
// those still in the player's list, does nothing for a unit it doesn't show, closes once none of its units are left,
// and stops watching when it closes. Clicking a unit chooses it, waking it first if it is asleep, and closes the
// window (#482). Each unit is a row: its name and state, and the city that supports it, with no city line for a
// free unit (#694).
// The real `UnitSelectionWindow` is built under linkedom, with a canvas context that draws nothing. Patches go through
// the shipped `applyDataPatches` and a real `IncrementalReconstituter`, and each rebuild is collected into the shared
// `DataChanges` instance as `GameState` does; a "render" is a `notify`.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import './lib/dom';

import i18next from 'i18next';
import i18nOptions from '../../src/js/UI/app/i18nOptions';
import { DataPatch, GameData, Unit } from '../../src/js/UI/types';
import { ObjectMap, PlainObject } from '../../src/js/UI/lib/reconstituteData';
import IncrementalReconstituter from '../../src/js/UI/lib/IncrementalReconstituter';
import Transport from '../../src/js/UI/Transport';
import UnitSelectionWindow from '../../src/js/UI/components/UnitSelectionWindow';
import applyDataPatches from '../../src/js/UI/lib/applyDataPatches';
import { instance as dataChanges } from '../../src/js/UI/lib/DataChanges';

const failures: string[] = [];
let checks = 0,
  finished = false;

// A suite that stops before its checks would otherwise exit 0 (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      `FAIL unitSelectionWindow: stopped after ${checks} checks, before the end\n`
    );
    process.exitCode = 1;
  }
});

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

// The unit sprites aren't loaded, which is logged.
const logged: unknown[] = [];

console.error = (error: unknown) => logged.push(error);

// linkedom has no canvas context: one that draws nothing, and reads back no pixels.
(globalThis as any).HTMLCanvasElement.prototype.getContext = () =>
  new Proxy(
    { getImageData: () => ({ data: [] }) } as { [key: string]: unknown },
    {
      get: (target, key: string) => (key in target ? target[key] : () => {}),
      set: (target, key: string, value) => {
        target[key] = value;

        return true;
      },
    }
  );

i18next.init({ lng: 'en', resources: {}, initImmediate: false } as any);

const ref = (id: string) => ({ '#ref': id }),
  unit = (id: string, moves = 1): PlainObject => ({
    _: 'Warrior',
    id,
    active: false,
    busy: null,
    improvements: [],
    moves,
    player: ref('Player-1'),
  });

// A player with three units: a stack of two, and one elsewhere.
const objectMap: ObjectMap = {
  hierarchy: { player: ref('Player-1') },
  objects: {
    'Player-1': {
      _: 'Player',
      id: 'Player-1',
      civilization: ref('Civilization-1'),
      units: [ref('Unit-1'), ref('Unit-2'), ref('Unit-3')],
    },
    'Civilization-1': {
      _: 'Civilization',
      id: 'Civilization-1',
      attributes: [{ name: 'colors', value: ['#ffffff', '#000000'] }],
    },
    'Unit-1': unit('Unit-1'),
    'Unit-2': unit('Unit-2'),
    'Unit-3': unit('Unit-3'),
  },
};

const reconstituter = new IncrementalReconstituter();

let data = reconstituter.rebuild(objectMap, null) as GameData;

// As `GameState`'s update does: rebuild, then collect.
const update = (patches: DataPatch[], rebuildAll = false): void => {
    const changedIds = new Set<string>();

    applyDataPatches(objectMap, patches, {
      changed: (id) => changedIds.add(id),
    });

    const changed = rebuildAll ? null : changedIds;

    data = reconstituter.rebuild(objectMap, changed) as GameData;

    dataChanges.collect(
      changed === null ? null : [...changed, ...reconstituter.filledIds()]
    );
  },
  render = (): void => dataChanges.notify(data),
  move = (id: string) => ({
    [id]: {
      type: 'update' as const,
      value: {
        hierarchy: (objectMap.objects[id] = {
          ...objectMap.objects[id],
          moves: (objectMap.objects[id].moves as number) - 1,
        }),
        objects: {},
      },
    },
  }),
  // A unit lost, as the worker sends it (#459): once more, marked destroyed, then gone from the player's list.
  lose = (id: string): DataPatch[] => {
    const units = (objectMap.objects['Player-1'].units as PlainObject[]).filter(
      (unit) => unit['#ref'] !== id
    );

    objectMap.objects['Player-1'].units = units;

    return [
      {
        [id]: {
          type: 'update' as const,
          value: {
            hierarchy: { ...objectMap.objects[id], destroyed: true },
            objects: {},
          },
        },
      },
      {
        'Player-1': {
          type: 'update' as const,
          index: 'units',
          value: { hierarchy: units, objects: {} },
        },
      },
    ];
  };

const transport = { send: () => {} } as unknown as Transport;

// Opens the window on `ids`, counting its redraws and the units each one showed.
const open = (ids: string[]) => {
  const units = data.player.units.filter((unit: Unit) => ids.includes(unit.id)),
    window = new UnitSelectionWindow(units, transport),
    redraws: number[] = [],
    update = window.update.bind(window);
  let closes = 0;

  window.on('close', () => closes++);

  window.update = (content: string | Node): void => {
    redraws.push((content as HTMLElement).querySelectorAll('canvas').length);

    update(content);
  };

  return {
    window,
    redraws,
    isOpen: () => window.element().isConnected,
    // A window that closes itself through `Window#close` rather than its own `close` leaves its watcher behind, and a
    //  later wake closes it again.
    closes: () => closes,
  };
};

const stack = open(['Unit-1', 'Unit-2']);

expect(
  'the stack window opens showing its two units',
  stack.window.element().querySelectorAll('canvas').length,
  2
);

update([move('Unit-3')]);
render();

expect(
  'a unit it does not show changing does not redraw it',
  stack.redraws,
  []
);

update([move('Unit-1')]);
render();

expect(
  'one of its units changing redraws it on the next render, with both units',
  stack.redraws,
  [2]
);

update([move('Unit-1'), move('Unit-2')]);
update([move('Unit-2')]);
render();

expect(
  'once per render, however many of its units changed',
  stack.redraws,
  [2, 2]
);

update(lose('Unit-2'));
render();

expect(
  'one of its units lost redraws it with the one left',
  stack.redraws,
  [2, 2, 1]
);

update([], true);
render();

expect('a rebuild of everything redraws it', stack.redraws, [2, 2, 1, 1]);

stack.window.close();

update([move('Unit-1')]);
render();
update([], true);
render();

expect(
  'closed, it watches nothing more, even for a rebuild of everything',
  [stack.isOpen(), stack.redraws, stack.closes()],
  [false, [2, 2, 1, 1], 1]
);

// A window whose units are all lost closes itself, and stops watching.
const last = open(['Unit-3']);

expect('a window on the last unit opens', last.isOpen(), true);

update(lose('Unit-3'));
render();

expect(
  'losing every unit it shows closes it, without a redraw',
  [last.isOpen(), last.redraws],
  [false, []]
);

update([move('Unit-1')]);
render();
update([], true);
render();

expect(
  'and then it watches nothing more: it is not closed again',
  [last.redraws, last.closes()],
  [[], 1]
);

// Clicking a unit chooses it, awake or not, and closes the window (#482).
const sent: Array<{ name: string; id: string }> = [],
  chosen: string[] = [],
  clicking = new UnitSelectionWindow(
    data.player.units,
    {
      send: (_: string, action: any) => sent.push(action),
    } as unknown as Transport,
    (unit: Unit) => chosen.push(unit.id)
  ),
  click = (window: UnitSelectionWindow, index: number): void => {
    (
      window.element().querySelectorAll('.unit-row')[index] as HTMLElement
    ).click();
  };

objectMap.objects['Unit-1'].active = true;
data = reconstituter.rebuild(objectMap, null) as GameData;

const awake = new UnitSelectionWindow(
  data.player.units,
  {
    send: (_: string, action: any) => sent.push(action),
  } as unknown as Transport,
  (unit: Unit) => chosen.push(unit.id)
);

click(awake, 0);

expect(
  'clicking an awake unit chooses it, without waking it',
  [chosen, sent],
  [['Unit-1'], []]
);
expect('and closes the window', awake.element().isConnected, false);

click(clicking, 0);

expect(
  'clicking a sleeping unit wakes it and chooses it',
  [chosen, sent],
  [['Unit-1', 'Unit-1'], [{ name: 'InactiveUnit', id: 'Unit-1' }]]
);
expect('and closes the window too', clicking.element().isConnected, false);

// Each unit is a row (#694): its name and state, then the city that supports it, or no city line for a free unit.
const rowText = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('../../translations/local/en');
  await import('../../translations/civ1-unit/en');
  await import('../../translations/civ1-city/en');

  const rome = {
      name: 'Roma',
      originalPlayer: { civilization: { _: 'Roman' } },
    },
    plain = (fields: { [key: string]: unknown }): Unit =>
      ({
        _: 'Musketman',
        id: 'Unit-9',
        active: false,
        busy: null,
        city: rome,
        improvements: [],
        player: data.player,
        ...fields,
      } as unknown as Unit),
    rows = (units: Unit[]) =>
      Array.from(
        new UnitSelectionWindow(units, transport)
          .element()
          .querySelectorAll('.unit-row')
      ).map((row) => ({
        label: row.querySelector('.label')?.textContent,
        city: row.querySelector('.city')?.textContent ?? null,
        icon: row.querySelectorAll('canvas').length,
      }));

  expect(
    'a row names the unit and its state, and the city that supports it',
    rows([
      plain({
        busy: { _: 'Fortifying' },
        improvements: [{ _: 'Fortified' }, { _: 'Veteran' }],
      }),
    ]),
    [
      {
        label: 'Musketman (Fortifying, Fortified, Veteran)',
        city: 'Roma',
        icon: 1,
      },
    ]
  );
  // Once fortified, the engine sends both a `Fortified` activity and the `Fortified` improvement.
  expect(
    'a fortified veteran says Fortified once',
    rows([
      plain({
        busy: { _: 'Fortified' },
        improvements: [{ _: 'Fortified' }, { _: 'Veteran' }],
      }),
    ]),
    [{ label: 'Musketman (Fortified, Veteran)', city: 'Roma', icon: 1 }]
  );
  expect(
    'a state is said once, however many times it comes',
    rows([plain({ improvements: [{ _: 'Fortified' }, { _: 'Fortified' }] })]),
    [{ label: 'Musketman (Fortified)', city: 'Roma', icon: 1 }]
  );
  expect(
    'an activity with nothing else is the state',
    rows([plain({ _: 'Settlers', busy: { _: 'BuildingRoad' } })]),
    [{ label: 'Settlers (Building road)', city: 'Roma', icon: 1 }]
  );
  expect(
    'a unit doing nothing in particular has no brackets',
    rows([plain({})]),
    [{ label: 'Musketman', city: 'Roma', icon: 1 }]
  );
  expect(
    'a free unit has no city line, and no placeholder for one',
    rows([plain({ _: 'Warrior', city: null })]),
    [{ label: 'Warrior', city: null, icon: 1 }]
  );
  expect(
    'a name is shown as written, not escaped',
    rows([plain({ _: "Rock & Roll's", city: null })]),
    [{ label: "Rock & Roll's", city: null, icon: 1 }]
  );

  const window = new UnitSelectionWindow([plain({})], transport);

  expect(
    'a row is a button, so the keyboard reaches it',
    window.element().querySelector('.unit-row')?.tagName,
    'BUTTON'
  );

  window.close();
};

rowText()
  .then(() => {
    expect(
      'nothing but the missing sprites was logged',
      logged.filter((error) => !String(error).startsWith('Missing image:')),
      []
    );

    finished = true;

    if (failures.length > 0) {
      process.stderr.write(
        `FAIL unitSelectionWindow (${
          failures.length
        } of ${checks} checks)\n  ${failures.slice(0, 20).join('\n  ')}\n`
      );
      process.exit(1);
    }

    process.stdout.write(`PASS unitSelectionWindow (${checks} checks)\n`);
  })
  .catch((error) => {
    process.stderr.write(`FAIL unitSelectionWindow: ${error.stack ?? error}\n`);
    process.exit(1);
  });
