import { ObjectMap, PlainObject } from './reconstituteData';

const walkValue = (
  value: any,
  objects: ObjectMap['objects'],
  reachableIds: Set<string>,
  seen: WeakSet<PlainObject>
): void => {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (seen.has(value)) {
    return;
  }

  seen.add(value);

  if ('#ref' in value && typeof value['#ref'] === 'string') {
    const ref = value['#ref'];

    if (reachableIds.has(ref)) {
      return;
    }

    reachableIds.add(ref);

    if (ref in objects) {
      walkValue(objects[ref], objects, reachableIds, seen);
    }

    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => walkValue(entry, objects, reachableIds, seen));

    return;
  }

  Object.values(value).forEach((entry) =>
    walkValue(entry, objects, reachableIds, seen)
  );
};

// Returns the ids it removed, so that state built from the map can drop them
//  too.
export const pruneObjectMap = ({ hierarchy, objects }: ObjectMap): string[] => {
  const reachableIds = new Set<string>(),
    seen = new WeakSet<PlainObject>();

  walkValue(hierarchy, objects, reachableIds, seen);

  const removedIds: string[] = [];

  Object.keys(objects).forEach((id) => {
    if (reachableIds.has(id)) {
      return;
    }

    delete objects[id];
    removedIds.push(id);
  });

  return removedIds;
};

export default pruneObjectMap;
