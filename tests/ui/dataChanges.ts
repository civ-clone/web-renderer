// Which watchers wake for a change (#344). Patches go through the shipped
// `applyDataPatches`, the data is rebuilt by a real `IncrementalReconstituter`,
// and each rebuild is `collect`ed as `GameState`'s update does it: the ids the
// patches changed plus the ids the rebuild filled, or `null` for a rebuild of
// everything. A "render" is a `notify`. Checks that a watcher wakes for a
// changed id, for a child id its getter reads live, for a late ref arriving at
// what it watches and for a full rebuild; not for unrelated
// ids; that it is told which ids changed; once per render however many rebuilds
// came before it; and that unwatching or watching during a render is honoured.
// Then the same for a watcher on the module's shared `instance`, as the city
// screen, the reports and the unit stack window use it: added with no
// `document` (this runs in Node), woken by a change with the new
// data, following its ids as they are when read, and stopped by unwatching.

import DataChanges, {
  instance as sharedChanges,
} from '../../src/js/UI/lib/DataChanges';
import IncrementalReconstituter from '../../src/js/UI/lib/IncrementalReconstituter';
import applyDataPatches from '../../src/js/UI/lib/applyDataPatches';
import { ObjectMap, PlainObject } from '../../src/js/UI/lib/reconstituteData';
import { DataPatch, GameData } from '../../src/js/UI/types';

const failures: string[] = [];
let checks = 0,
  finished = false;

const check = (description: string, passed: boolean): void => {
  checks++;

  if (!passed) {
    failures.push(description);
  }
};

// A suite that stops before its checks would otherwise exit 0 (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      `FAIL data-changes: stopped after ${checks} checks, before the end\n`
    );
    process.exitCode = 1;
  }
});

// A ref to an id the map does not hold yet is logged by the rebuild; here it is
// expected. Errors a watcher throws are logged too.
const logged: unknown[] = [];

console.error = (error: unknown) => logged.push(error);

const ref = (id: string) => ({ '#ref': id });

const unit = (id: string, moves = 1): PlainObject => ({
  _: 'Unit',
  id,
  moves,
});

// A player with two cities, one of them with a unit, and a treasury.
const objectMap: ObjectMap = {
  hierarchy: { player: ref('Player-1') },
  objects: {
    'Player-1': {
      _: 'Player',
      id: 'Player-1',
      cities: [ref('City-1'), ref('City-2')],
      units: [ref('Unit-1'), ref('Unit-3')],
      treasury: ref('Treasury-1'),
    },
    'City-1': {
      _: 'City',
      id: 'City-1',
      name: 'Rome',
      units: [ref('Unit-1')],
    },
    'City-2': {
      _: 'City',
      id: 'City-2',
      name: 'Veii',
      units: [],
    },
    'Unit-1': unit('Unit-1'),
    'Unit-3': unit('Unit-3'),
    'Treasury-1': { _: 'Treasury', id: 'Treasury-1', value: 10 },
    // In the map, but nothing built refers to it: removing it refills nothing.
    'Unit-9': unit('Unit-9'),
  },
};

const reconstituter = new IncrementalReconstituter(),
  dataChanges = new DataChanges();

let data = reconstituter.rebuild(objectMap, null) as GameData;

// The last update's changed ids and filled ids, to say where a wake came from.
let lastChanged = new Set<string>(),
  lastFilled: ReadonlySet<string> = new Set();

// As `GameState`'s update does: rebuild, then collect.
const update = (patches: DataPatch[], rebuildAll = false): void => {
  const changedIds = new Set<string>();

  applyDataPatches(objectMap, patches, {
    changed: (id) => changedIds.add(id),
  });

  const changed = rebuildAll ? null : changedIds;

  data = reconstituter.rebuild(objectMap, changed) as GameData;

  const collected =
    changed === null ? null : [...changed, ...reconstituter.filledIds()];

  dataChanges.collect(collected);
  // Where `GameState` collects, for the shared watcher at the end.
  sharedChanges.collect(collected);

  lastChanged = changedIds;
  lastFilled = reconstituter.filledIds();
};

const render = (): void => {
  dataChanges.notify(data);
  sharedChanges.notify(data);
};

const replace = (id: string, hierarchy: PlainObject, objects = {}) => ({
  [id]: { type: 'update' as const, value: { hierarchy, objects } },
});

// Counts each watcher's wakes since the last `reset`.
const wakes = new Map<string, number>(),
  order: string[] = [];

const reset = (): void => {
  wakes.clear();
  order.length = 0;
};

const watch = (name: string, ids: () => Iterable<string>) =>
  dataChanges.watch(ids, () => {
    wakes.set(name, (wakes.get(name) ?? 0) + 1);
    order.push(name);
  });

const woke = (name: string): number => wakes.get(name) ?? 0;

const city = (id: string): any =>
  data.player.cities.find((city: any) => city.id === id);

// The city as a window holds it: refilled in place, so its units are current.
const rome = city('City-1');

watch('rome', () => ['City-1']);
watch('veii', () => ['City-2']);
watch('treasury', () => ['Treasury-1']);
watch('rome and its units', () => [
  rome.id,
  ...rome.units.map((unit: any) => unit.id),
]);
watch('unit 3', () => ['Unit-3']);
watch('unit 9', () => ['Unit-9']);

// A changed id.
reset();
update([replace('City-1', { ...objectMap.objects['City-1'], name: 'Roma' })]);
render();

check('a watcher wakes for its changed id', woke('rome') === 1);
check(
  'and so does another watching it, in registration order',
  woke('rome and its units') === 1 && order.join() === 'rome,rome and its units'
);
check(
  `watchers of unrelated ids do not wake (${[...wakes.keys()].join()})`,
  woke('veii') === 0 && woke('treasury') === 0 && woke('unit 3') === 0
);

// Nothing collected since: nobody wakes.
reset();
render();

check('a render with nothing changed wakes nobody', wakes.size === 0);

// A new unit in the city, then a change to that unit alone.
check(
  'the city has one unit before',
  rome.units.length === 1 && rome.units[0].id === 'Unit-1'
);

update([
  replace(
    'City-1',
    {
      ...objectMap.objects['City-1'],
      units: [ref('Unit-1'), ref('Unit-2')],
    },
    { 'Unit-2': unit('Unit-2') }
  ),
]);
render();
reset();
update([replace('Unit-2', unit('Unit-2', 0))]);
render();

check(
  `a watcher reading its city's units live wakes when the new unit changes (${[
    ...wakes.keys(),
  ].join()})`,
  woke('rome and its units') === 1 && rome.units[1].moves === 0
);
check('one watching the city alone does not', woke('rome') === 0);

// A ref to a unit not sent yet, then the unit on its own.
update([
  replace('City-2', {
    ...objectMap.objects['City-2'],
    units: [ref('Unit-7')],
  }),
]);
render();
reset();
update([
  {
    'Unit-7': {
      type: 'add',
      value: { hierarchy: unit('Unit-7'), objects: {} },
    },
  },
]);
render();

check(
  'the owner of a late ref wakes when it arrives',
  woke('veii') === 1 && city('City-2').units[0]?.id === 'Unit-7'
);
check(
  'through filledIds, not the patch',
  !lastChanged.has('City-2') && lastFilled.has('City-2')
);

// A rebuild of everything.
reset();
update([], true);
render();

check(
  `a full rebuild wakes every watcher (${[...wakes.keys()].join()})`,
  ['rome', 'veii', 'treasury', 'rome and its units', 'unit 3', 'unit 9'].every(
    (name) => woke(name) === 1
  )
);

// A watcher is told what changed, to tell one of its ids from another: the ids since the last render, or `null` after
//  a rebuild of everything.
{
  const told: Array<string[] | null> = [],
    unwatch = dataChanges.watch(
      () => ['Treasury-1'],
      (_data, changed) => told.push(changed === null ? null : [...changed])
    );

  update([replace('Treasury-1', { ...objectMap.objects['Treasury-1'] })]);
  render();
  update([], true);
  render();
  unwatch();

  check(
    `a watcher is told the ids that changed, or null for everything (${JSON.stringify(
      told
    )})`,
    JSON.stringify(told) === '[["Treasury-1"],null]'
  );
}

// Patch after patch, as during the player's turn, then one render.
reset();
update([replace('City-1', { ...objectMap.objects['City-1'], name: 'Rome' })]);
update([replace('Treasury-1', { ...objectMap.objects['Treasury-1'] })]);
update([replace('City-1', { ...objectMap.objects['City-1'], name: 'Roma' })]);
update([replace('City-1', { ...objectMap.objects['City-1'], name: 'Rome' })]);
render();

check(
  'a watcher runs once per render however many rebuilds came before it',
  woke('rome') === 1 && woke('rome and its units') === 1
);
check(
  'and the changes of every rebuild are kept, not only the last',
  woke('treasury') === 1
);

// A full rebuild among incremental ones still wakes everyone.
reset();
update([replace('City-1', { ...objectMap.objects['City-1'] })]);
update([], true);
update([replace('City-1', { ...objectMap.objects['City-1'] })]);
render();

check(
  'a full rebuild followed by others still wakes everyone',
  woke('veii') === 1 && woke('unit 3') === 1 && woke('rome') === 1
);

// Unwatching and watching during a render, on a fresh instance so the order is
// plain.
{
  const changes = new DataChanges(),
    ran: string[] = [];

  let unwatchB: () => void = () => {},
    addedC = false;

  changes.watch(
    () => ['City-1'],
    () => {
      ran.push('a');

      unwatchB();

      if (!addedC) {
        addedC = true;

        changes.watch(
          () => ['City-1'],
          () => ran.push('c')
        );
      }
    }
  );
  unwatchB = changes.watch(
    () => ['City-1'],
    () => ran.push('b')
  );
  changes.watch(
    () => ['City-1'],
    () => ran.push('d')
  );

  changes.collect(['City-1']);
  changes.notify(data);

  check(
    `a watcher removed by an earlier one in the same render is skipped, one added waits (${ran.join()})`,
    ran.join() === 'a,d'
  );

  ran.length = 0;
  changes.collect(['City-1']);
  changes.notify(data);

  check(
    `the one added runs at the next render, after the others (${ran.join()})`,
    ran.join() === 'a,d,c'
  );

  // What a watcher's own work collects, as the arrival window's `close`
  //  rebuilding does, is for the next render.
  const late = new DataChanges(),
    seen: string[] = [];

  late.watch(
    () => ['City-1'],
    () => {
      seen.push('city');
      late.collect(['Unit-1']);
    }
  );
  late.watch(
    () => ['Unit-1'],
    () => seen.push('unit')
  );

  late.collect(['City-1']);
  late.notify(data);

  check(
    `what is collected during a render waits for the next (${seen.join()})`,
    seen.join() === 'city'
  );

  late.notify(data);

  check(
    `and wakes its watcher then (${seen.join()})`,
    seen.join() === 'city,unit'
  );

  // A watcher that throws is reported, and the others still run, as
  //  `document` listeners do.
  const throwing = new DataChanges(),
    after: string[] = [];

  throwing.watch(
    () => ['City-1'],
    () => {
      throw new Error('a broken window');
    }
  );
  throwing.watch(
    () => ['City-1'],
    () => after.push('next')
  );

  logged.length = 0;
  throwing.collect(['City-1']);
  throwing.notify(data);

  check(
    'a watcher that throws does not stop the others, and is logged',
    after.join() === 'next' &&
      logged.some(
        (error) => error instanceof Error && error.message === 'a broken window'
      )
  );

  // Unwatching twice, or after a render, changes nothing else.
  const twice = new DataChanges(),
    ranTwice: string[] = [];

  const unwatchFirst = twice.watch(
    () => ['City-1'],
    () => ranTwice.push('first')
  );

  twice.watch(
    () => ['City-1'],
    () => ranTwice.push('second')
  );

  unwatchFirst();
  unwatchFirst();

  twice.collect(['City-1']);
  twice.notify(data);

  check(
    `unwatching twice removes only that watcher (${ranTwice.join()})`,
    ranTwice.join() === 'second'
  );
}

// A watcher on the shared `instance`, as the city screen, the reports and the
//  unit stack window use it.
{
  const received: GameData[] = [],
    ids = ['City-1'];

  let unwatch: (() => void) | null = null;

  try {
    unwatch = sharedChanges.watch(
      () => ids,
      (data) => received.push(data)
    );
  } catch (error) {
    logged.push(error);
  }

  check(
    'a shared watcher can be added with no document and no game',
    unwatch !== null
  );

  update([replace('City-1', { ...objectMap.objects['City-1'], name: 'Roma' })]);
  render();

  check(
    `a shared watcher wakes for its changed id, with the new data (${received.length})`,
    received.length === 1 &&
      received[0] === data &&
      received[0].player.cities[0].name === 'Roma'
  );

  received.length = 0;
  update([replace('City-2', { ...objectMap.objects['City-2'], name: 'Vei' })]);
  render();

  check('but not for an unrelated id', received.length === 0);

  ids.splice(0, ids.length, 'City-2', 'Unit-1');

  update([replace('City-1', { ...objectMap.objects['City-1'], name: 'Rome' })]);
  render();

  check(
    'with its ids changed, its old id no longer wakes it',
    received.length === 0
  );

  update([replace('City-2', { ...objectMap.objects['City-2'], name: 'Veii' })]);
  render();

  check(
    `and the new one does, on the next change (${received.length})`,
    received.length === 1
  );

  received.length = 0;
  update([replace('Unit-1', { ...objectMap.objects['Unit-1'] })]);
  render();

  check(
    `a shared watcher wakes for its other id (${received.length})`,
    received.length === 1
  );

  received.length = 0;
  unwatch!();
  update([replace('City-2', { ...objectMap.objects['City-2'], name: 'Vei' })]);
  render();
  update([], true);
  render();

  check(
    `unwatching stops it, even for a full rebuild (${received.length})`,
    received.length === 0
  );

  unwatch!();

  check('and unwatching twice is harmless', received.length === 0);
}

finished = true;

if (failures.length > 0) {
  process.stderr.write(
    `FAIL data-changes (${failures.length} of ${checks} checks)\n  ${failures
      .slice(0, 20)
      .join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS data-changes (${checks} checks)\n`);
