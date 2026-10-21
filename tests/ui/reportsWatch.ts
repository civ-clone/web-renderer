// What keeps the City Status (F1), Happiness (F4), Trade (F5) and Science (F6) reports current (#344).
//
// Each report watches its player through `watchPlayer`, with the ids it shows of the player read live at each render:
// the City Status and Trade Report each city, its growth and its build (`cityRowIds`); the Happiness Report each city
// (`cityIds`); the Science Report the research and each city (`researchIds`). A report wakes when the player changes
// or any of those do, follows a city founded after it opened without re-subscribing, wakes on a rebuild of everything
// and still follows new cities after one, and stops when it closes.
// Patches go through the shipped `applyDataPatches` and a real `IncrementalReconstituter`, and each rebuild is
// collected into the shared `DataChanges` instance as `Renderer` does; a "render" is a `notify`.

import { DataPatch, GameData, Player } from '../../src/js/UI/types';
import { ObjectMap, PlainObject } from '../../src/js/UI/lib/reconstituteData';
import watchPlayer, {
  PlayerIds,
  cityIds,
  cityRowIds,
  researchIds,
} from '../../src/js/UI/components/lib/watchPlayer';
import IncrementalReconstituter from '../../src/js/UI/lib/IncrementalReconstituter';
import applyDataPatches from '../../src/js/UI/lib/applyDataPatches';
import { instance as dataChanges } from '../../src/js/UI/lib/DataChanges';

const failures: string[] = [];
let checks = 0,
  finished = false;

// A suite that stops before its checks would otherwise exit 0 (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      `FAIL reportsWatch: stopped after ${checks} checks, before the end\n`
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

const ref = (id: string) => ({ '#ref': id }),
  city = (n: number): { [id: string]: PlainObject } => ({
    [`City-${n}`]: {
      _: 'City',
      id: `City-${n}`,
      name: `City ${n}`,
      build: ref(`CityBuild-${n}`),
      growth: ref(`CityGrowth-${n}`),
      player: ref('Player-1'),
      units: [],
    },
    [`CityBuild-${n}`]: {
      _: 'CityBuild',
      id: `CityBuild-${n}`,
      building: null,
    },
    [`CityGrowth-${n}`]: { _: 'CityGrowth', id: `CityGrowth-${n}`, size: 1 },
  });

// A player with two cities, its research, and a unit none of the reports shows.
const objectMap: ObjectMap = {
  hierarchy: { player: ref('Player-1') },
  objects: {
    'Player-1': {
      _: 'Player',
      id: 'Player-1',
      actions: [],
      cities: [ref('City-1'), ref('City-2')],
      research: ref('Research-1'),
      treasuries: [],
      units: [ref('Unit-1')],
    },
    ...city(1),
    ...city(2),
    'Research-1': { _: 'PlayerResearch', id: 'Research-1', progress: 0 },
    'Unit-1': { _: 'Unit', id: 'Unit-1', moves: 1 },
  },
};

const reconstituter = new IncrementalReconstituter();

let data = reconstituter.rebuild(objectMap, null) as GameData;

// As `updateState` does: rebuild, then collect.
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
  replace = (id: string, changes: PlainObject) => ({
    [id]: {
      type: 'update' as const,
      value: {
        hierarchy: (objectMap.objects[id] = {
          ...objectMap.objects[id],
          ...changes,
        }),
        objects: {},
      },
    },
  }),
  // One of the player's keys on its own, as the client sends its cities or actions.
  replacePlayerKey = (
    key: string,
    hierarchy: unknown,
    objects: PlainObject = {}
  ) => ({
    'Player-1': {
      type: 'update' as const,
      index: key,
      value: { hierarchy, objects },
    },
  }),
  found = (n: number): void => {
    const cities = [
      ...(objectMap.objects['Player-1'].cities as PlainObject[]),
      ref(`City-${n}`),
    ];

    objectMap.objects['Player-1'].cities = cities;

    update([replacePlayerKey('cities', cities, city(n))]);
  };

// One watcher per kind of report, each counting the times it woke and keeping the player it was handed.
type Report = { woke: number; player: Player | null; unwatch: () => void };

const report = (ids: PlayerIds): Report => {
  const report: Report = { woke: 0, player: null, unwatch: () => {} };

  report.unwatch = watchPlayer(data.player, ids, (player) => {
    report.woke++;
    report.player = player;
  });

  return report;
};

const reports: { [name: string]: Report } = {
    'City Status/Trade': report(cityRowIds),
    Happiness: report(cityIds),
    Science: report(researchIds),
  },
  // What woke since the last call, per report.
  woken = (): { [name: string]: number } =>
    Object.fromEntries(
      Object.entries(reports).map(([name, report]) => {
        const woke = report.woke;

        report.woke = 0;

        return [name, woke];
      })
    ),
  all = (woke: number) => ({
    'City Status/Trade': woke,
    Happiness: woke,
    Science: woke,
  });

// The Happiness Report before #344's step 5: its ids came from the player it was opened with, every time.
let constructorPlayerWoke = 0;

const constructorPlayer = data.player,
  unwatchConstructorPlayer = dataChanges.watch(
    () => [constructorPlayer.id, ...cityIds(constructorPlayer)],
    () => constructorPlayerWoke++
  );

render();

expect('nothing wakes a report before anything changes', woken(), all(0));

update([replacePlayerKey('actions', [])]);
render();

expect('a change to the player wakes every report', woken(), all(1));
expect(
  'each is handed the player as the data holds it now',
  Object.values(reports).map(({ player }) => player === data.player),
  [true, true, true]
);

update([replace('City-2', { name: 'Veii' })]);
render();

expect(
  "a change to one of the player's cities wakes every report",
  woken(),
  all(1)
);

update([replace('CityGrowth-1', { size: 2 })]);
update([replace('CityBuild-1', { building: { _: 'Militia' } })]);
render();

expect(
  "a change to a city's growth and build wakes the City Status and Trade Report, once per render",
  woken(),
  { 'City Status/Trade': 1, Happiness: 0, Science: 0 }
);

update([replace('Research-1', { progress: 3 })]);
render();

expect('a change to the research wakes the Science Report', woken(), {
  'City Status/Trade': 0,
  Happiness: 0,
  Science: 1,
});

update([replace('Unit-1', { moves: 0 })]);
render();

expect('a change to something no report shows wakes none', woken(), all(0));

// Founded after the reports opened: the player changes, then the new city alone.
found(3);
render();
woken();
update([replace('City-3', { name: 'Antium' })]);
render();

expect(
  'a city founded after the watch began is followed without re-subscribing',
  woken(),
  all(1)
);

update([replace('CityBuild-3', { building: { _: 'Settlers' } })]);
render();

expect(
  'and so are its growth and build, by the City Status and Trade Report',
  woken(),
  { 'City Status/Trade': 1, Happiness: 0, Science: 0 }
);

update([], true);
render();

expect('a rebuild of everything wakes every report', woken(), all(1));
expect(
  'each is handed the rebuilt player',
  Object.values(reports).map(({ player }) => player === data.player),
  [true, true, true]
);

// After a rebuild of everything the player a report was opened with is stale, so its cities are read from the one
//  the data holds now.
constructorPlayerWoke = 0;
found(4);
render();
woken();
constructorPlayerWoke = 0;
update([replace('City-4', { name: 'Ostia' })]);
render();

expect(
  'a city founded after a rebuild of everything is followed too',
  woken(),
  all(1)
);
expect(
  'which ids read from the player a report was opened with, as the Happiness Report did, missed',
  constructorPlayerWoke,
  0
);

unwatchConstructorPlayer();

Object.values(reports).forEach(({ unwatch }) => unwatch());

update([replacePlayerKey('actions', [])]);
update([replace('City-1', { name: 'Roma' })]);
update([replace('Research-1', { progress: 5 })]);
render();
update([], true);
render();

expect(
  'nothing wakes a report once it has closed, not even a rebuild of everything',
  woken(),
  all(0)
);

finished = true;

if (failures.length) {
  process.stderr.write(
    `FAIL reportsWatch\n${failures
      .map((failure) => `  ${failure}`)
      .join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS reportsWatch (${checks} checks)`);
