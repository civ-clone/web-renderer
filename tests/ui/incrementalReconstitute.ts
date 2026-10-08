// The live game data is rebuilt only where a patch changed it (#322), by
// refilling each changed id's object in place (#327). Applies a few hundred
// seeded-random patches, of every kind the `gameDataPatch` handler receives, to
// a synthetic object map with shared refs, lists of refs, inline objects
// holding refs, refs to ids not yet sent and a cycle, and checks after each
// update that:
//
// - the result is deep-equal to a fresh `reconstituteData` of the same map,
// - every id is the very object it was before, changed or not, and so is the
//   root,
// - after a prune, nothing the map dropped is still held.
//
// Then, one at a time: a changed list is the same array with new contents, an
// id that arrives after something referred to it is found there, a removed id
// is let go of, and an id whose object becomes a list is rebuilt as one.

import {
  ObjectMap,
  PlainObject,
  reconstituteData,
} from '../../src/js/UI/lib/reconstituteData';
import IncrementalReconstituter from '../../src/js/UI/lib/IncrementalReconstituter';
import pruneObjectMap from '../../src/js/UI/lib/pruneObjectMap';

const failures: string[] = [];
let checks = 0;

const check = (description: string, passed: boolean) => {
  checks++;

  if (!passed) {
    failures.push(description);
  }
};

// Missing refs and unusable index paths are logged by both rebuilds and by the
// handler; here they are expected.
console.error = () => {};
console.warn = () => {};

// mulberry32: the same patches on every run.
let seed = 322;

const random = (): number => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;

  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);

  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const int = (max: number): number => Math.floor(random() * max),
  chance = (p: number): boolean => random() < p,
  pick = <T>(items: T[]): T => items[int(items.length)];

let nextId = 0;

const newId = (): string => `Thing-${nextId++}`;

const objectMap: ObjectMap = {
  hierarchy: {},
  objects: {},
};

const ref = (id: string) => ({ '#ref': id });

const idNumber = (id: string): number => Number(id.split('-')[1]);

// Mostly ids the map holds, now and then one it does not, which a list leaves
// out and a field resolves to `undefined`. Most refs point at older ids, so
// that a change does not reach everything; the rest make cycles.
const someRef = (owner: string, extraIds: string[] = []) => {
  if (chance(0.03)) {
    return ref(`Ghost-${int(5)}`);
  }

  const ids = [...Object.keys(objectMap.objects), ...extraIds],
    older = ids.filter((id) => idNumber(id) < idNumber(owner));

  return ref(pick(older.length > 0 && chance(0.95) ? older : ids));
};

const makeThing = (id: string, extraIds: string[] = []): PlainObject => ({
  _: 'Thing',
  id,
  n: int(100),
  ref: chance(0.7) ? someRef(id, extraIds) : null,
  list: new Array(int(4)).fill(0).map(() => someRef(id, extraIds)),
  inline: {
    a: chance(0.6) ? someRef(id, extraIds) : null,
    nested: [someRef(id, extraIds), { b: someRef(id, extraIds) }],
    flag: chance(0.5),
  },
});

// The initial map: a cycle, then things referring to each other and to it.
const [first, second] = [newId(), newId()];

objectMap.objects[first] = { ...makeThing(first, [second]), ref: ref(second) };
objectMap.objects[second] = { ...makeThing(second), ref: ref(first) };

for (let i = 0; i < 60; i++) {
  const id = newId();

  objectMap.objects[id] = makeThing(id);
}

objectMap.hierarchy = {
  game: ref(first),
  everything: Object.keys(objectMap.objects).map(ref),
  settings: { focus: ref(pick(Object.keys(objectMap.objects))) },
};

// As the `gameDataPatch` handler in `Renderer.ts` applies a patch and collects
// the ids it changed.
const pathToParts = (path: string) => path.replace(/]/g, '').split(/[.[]/),
  getPenultimateObject = (
    object: PlainObject,
    path: string
  ): [PlainObject, string | undefined] => {
    const parts = pathToParts(path),
      lastPart = parts.pop();

    const tmpObj = parts.reduce((tmpObj, part) => {
      if (!tmpObj || !(part in tmpObj)) {
        return null;
      }

      return tmpObj[part];
    }, object);

    return [tmpObj, lastPart];
  },
  setObjectPath = (object: PlainObject, path: string, value: any): void => {
    const [tmpObj, lastPart] = getPenultimateObject(object, path);

    if (!tmpObj || !lastPart) {
      console.warn(`unable to set ${path} of ${object} (${lastPart})`);
      return;
    }

    tmpObj[lastPart] = value;
  },
  removeObjectPath = (object: PlainObject, path: string): void => {
    const [tmpObj, lastPart] = getPenultimateObject(object, path);

    if (!tmpObj || !lastPart) {
      console.warn(`unable to set ${path} of ${object} (${lastPart})`);
      return;
    }

    if (Array.isArray(tmpObj) && /^\d+$/.test(lastPart)) {
      tmpObj.splice(parseInt(lastPart, 10), 1);

      return;
    }

    delete tmpObj[lastPart];
  };

type Patch = {
  [key: string]: {
    type: 'add' | 'update' | 'remove';
    index?: string | null;
    // A whole object, or for an index path whatever goes there.
    value?: { hierarchy: any; objects: PlainObject };
  };
};

const applyPatches = (patches: Patch[], changedIds: Set<string>): void =>
  patches.forEach((patch) =>
    Object.entries(patch).forEach(([key, { type, index, value }]) => {
      if (type === 'add' || type === 'update') {
        if (!value!.hierarchy) {
          console.error('No hierarchy');

          return;
        }

        if (index) {
          setObjectPath(objectMap.objects[key], index, value!.hierarchy);
        } else {
          objectMap.objects[key] = value!.hierarchy;
        }

        changedIds.add(key);

        Object.entries(value!.objects).forEach(([key, value]) => {
          objectMap.objects[key] = value;
          changedIds.add(key);
        });
      }

      if (type === 'remove') {
        changedIds.add(key);

        if (index) {
          removeObjectPath(objectMap.objects[key], index);

          return;
        }

        delete objectMap.objects[key];
      }
    })
  );

// A side-table of other objects, as a patch carries: replacements for ids the
// map holds and new ids, which may refer to each other.
const sideTable = (): PlainObject => {
  const ids = new Array(int(4))
      .fill(0)
      .map(() =>
        chance(0.5) && Object.keys(objectMap.objects).length > 0
          ? pick(Object.keys(objectMap.objects))
          : newId()
      ),
    objects: PlainObject = {};

  ids.forEach((id) => (objects[id] = makeThing(id, ids)));

  return objects;
};

const indexPaths = (key: string): string[] => {
  const object = objectMap.objects[key],
    paths = ['n', 'ref', 'inline.a', 'inline.nested[1].b', 'inline.nested[0]'];

  (object?.list ?? []).forEach((_: any, i: number) => paths.push(`list[${i}]`));

  return paths;
};

const randomPatch = (): Patch => {
  const ids = Object.keys(objectMap.objects),
    kind = int(6);

  // Replacing an id's object whole, or adding a new one.
  if (kind === 0) {
    const key = chance(0.7) && ids.length > 0 ? pick(ids) : newId(),
      objects = sideTable();

    return {
      [key]: {
        type: ids.includes(key) ? 'update' : 'add',
        value: {
          hierarchy: makeThing(key, Object.keys(objects)),
          objects,
        },
      },
    };
  }

  // Setting a value inside an id's object in place.
  if (kind === 1) {
    const key = pick(ids),
      objects = sideTable(),
      extraIds = Object.keys(objects);

    return {
      [key]: {
        type: 'update',
        index: pick(indexPaths(key)),
        value: {
          hierarchy: pick([
            () => someRef(key, extraIds),
            () => ({
              c: someRef(key, extraIds),
              d: [someRef(key, extraIds)],
            }),
            () => 1 + int(10),
            // Falsy: the handler reports it and changes nothing.
            () => 0,
          ])(),
          objects,
        },
      },
    };
  }

  // Removing a value inside an id's object.
  if (kind === 2) {
    const key = pick(ids);

    return {
      [key]: {
        type: 'remove',
        index: pick(indexPaths(key)),
      },
    };
  }

  // Removing an id, which something may still refer to.
  if (kind === 3) {
    return {
      [pick(ids)]: {
        type: 'remove',
      },
    };
  }

  // An id things may have referred to before the map held it, arriving on its
  // own: what referred to it has to find it now.
  if (kind === 4) {
    const key = `Ghost-${int(5)}`;

    return {
      [key]: {
        type: ids.includes(key) ? 'update' : 'add',
        value: {
          hierarchy: makeThing(key),
          objects: {},
        },
      },
    };
  }

  // Two at once, as one patch can carry.
  return { ...randomPatch(), ...randomPatch() };
};

// The rebuilt object for each id, found through the result itself: every
// thing carries its own id.
const objectsById = (root: any): Map<string, any> => {
  const byId = new Map<string, any>(),
    seen = new Set<any>();

  const walk = (value: any): void => {
    if (!value || typeof value !== 'object' || seen.has(value)) {
      return;
    }

    seen.add(value);

    if (value._ === 'Thing') {
      byId.set(value.id, value);
    }

    Object.values(value).forEach(walk);
  };

  walk(root);

  return byId;
};

// Structural equality that follows cycles, and requires the two graphs to share
// in the same places: one object on one side is one object on the other.
const deepEqual = (a: any, b: any, pairs = new Map<any, any>()): boolean => {
  if (a === b) {
    return true;
  }

  if (!(a instanceof Object) || !(b instanceof Object)) {
    return false;
  }

  if (pairs.has(a)) {
    return pairs.get(a) === b;
  }

  pairs.set(a, b);

  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }

  const aKeys = Object.keys(a),
    bKeys = Object.keys(b);

  return (
    aKeys.length === bKeys.length &&
    aKeys.every((key) => key in b && deepEqual(a[key], b[key], pairs))
  );
};

const reconstituter = new IncrementalReconstituter();

let result = reconstituter.rebuild(objectMap, null);

check(
  'the first, full rebuild matches reconstituteData',
  deepEqual(result, reconstituteData(objectMap))
);

check(
  'an empty changed set returns the same root, with nothing rebuilt',
  reconstituter.rebuild(objectMap, new Set()) === result
);

let kept = 0,
  refilled = 0,
  pruned = 0;

for (let step = 1; step <= 400; step++) {
  const before = objectsById(result),
    root = result,
    changedIds = new Set<string>();

  // Patches that arrive while waiting for the turn are coalesced into one
  // update.
  applyPatches(
    new Array(1 + int(3)).fill(0).map(() => randomPatch()),
    changedIds
  );

  result = reconstituter.rebuild(objectMap, changedIds);

  check(
    `step ${step}: the result matches reconstituteData`,
    deepEqual(result, reconstituteData(objectMap))
  );

  check(`step ${step}: the root is the same object`, result === root);

  objectsById(result).forEach((object, id) => {
    if (!before.has(id)) {
      return;
    }

    if (changedIds.has(id)) {
      refilled++;
    } else {
      kept++;
    }

    check(
      `step ${step}: ${id}${
        changedIds.has(id) ? ', which changed,' : ''
      } is the same object`,
      before.get(id) === object
    );
  });

  check(
    `step ${step}: with nothing changed since, the root is the same object`,
    reconstituter.rebuild(objectMap, []) === result
  );

  if (step % 25 === 0) {
    const removedIds = pruneObjectMap(objectMap);

    reconstituter.forget(removedIds);

    const tracked = reconstituter.trackedIds();

    pruned += removedIds.length;

    check(
      `step ${step}: after a prune, no pruned id is still held (${removedIds
        .filter((id) => tracked.has(id))
        .join(', ')})`,
      removedIds.every((id) => !tracked.has(id))
    );

    check(
      `step ${step}: a prune changes nothing in the result`,
      deepEqual(result, reconstituteData(objectMap))
    );
  }

  // Keep the map from shrinking to nothing as ids are removed.
  if (Object.keys(objectMap.objects).length < 30) {
    const id = newId();

    objectMap.objects[id] = makeThing(id);
    objectMap.hierarchy.everything.push(ref(id));
    result = reconstituter.rebuild(objectMap, null);
  }
}

// Without these, the checks above could pass on a map where nothing changes,
// nothing is shared or nothing is ever pruned.
check(`some ids were kept (${kept})`, kept > 1000);
check(`some ids were refilled (${refilled})`, refilled > 100);
check(`some ids were pruned (${pruned})`, pruned > 10);

// One at a time from here, each through the handler as above.
const update = (patch: Patch): Set<string> => {
  const changedIds = new Set<string>(),
    root = result;

  applyPatches([patch], changedIds);

  result = reconstituter.rebuild(objectMap, changedIds);

  check(
    `${Object.keys(patch).join()}: the result matches reconstituteData`,
    deepEqual(result, reconstituteData(objectMap))
  );
  check(
    `${Object.keys(patch).join()}: the root is the same object`,
    result === root
  );

  return changedIds;
};

const [a, b, c] = Object.keys(objectMap.objects);

// A list with an id of its own, as the player's lists are not, but a list can
// be.
objectMap.objects['List-0'] = [ref(a), ref(b)];
objectMap.hierarchy.list = ref('List-0');
result = reconstituter.rebuild(objectMap, null);

const list = result.list;

update({
  'List-0': {
    type: 'update',
    value: { hierarchy: [ref(c)], objects: {} },
  },
});

check('a changed list is the same array', result.list === list);
check(
  'with the new contents',
  list.length === 1 && list[0] === objectsById(result).get(c)
);
check(
  'and the last call says it filled it',
  reconstituter.refilled('List-0') && !reconstituter.refilled(a)
);

// Referred to before it was sent, then sent on its own.
const waiting = newId(),
  late = newId();

update({
  [waiting]: {
    type: 'add',
    value: {
      hierarchy: { ...makeThing(waiting), ref: ref(late), list: [ref(late)] },
      objects: {},
    },
  },
});

// Nothing refers to it yet: add it to the hierarchy's list in place.
update({
  'List-0': {
    type: 'update',
    value: { hierarchy: [ref(c), ref(waiting)], objects: {} },
  },
});

const waitingObject = objectsById(result).get(waiting);

check(
  'a ref to an id not sent yet is undefined, and left out of a list',
  waitingObject.ref === undefined && waitingObject.list.length === 0
);

update({
  [late]: {
    type: 'add',
    value: { hierarchy: makeThing(late), objects: {} },
  },
});

check(
  'once it is sent, what referred to it finds it, in the same object',
  objectsById(result).get(waiting) === waitingObject &&
    waitingObject.ref === objectsById(result).get(late) &&
    waitingObject.list[0] === waitingObject.ref
);

// Removed while something still refers to it.
update({
  [late]: {
    type: 'remove',
  },
});

check(
  'a removed id is let go of',
  !reconstituter.trackedIds().has(late) &&
    waitingObject.ref === undefined &&
    waitingObject.list.length === 0
);

// An object that becomes a list cannot be refilled as one.
update({
  [c]: {
    type: 'update',
    value: { hierarchy: [ref(waiting)], objects: {} },
  },
});

check(
  'an id whose object becomes a list is a list, wherever it is held',
  Array.isArray(result.list[0]) && result.list[0][0] === waitingObject
);

if (failures.length > 0) {
  process.stderr.write(
    `FAIL incremental-reconstitute (${
      failures.length
    } of ${checks} checks)\n  ${failures.slice(0, 20).join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(
  `PASS incremental-reconstitute (${checks} checks; ${kept} kept, ${refilled} refilled, ${pruned} pruned)\n`
);
