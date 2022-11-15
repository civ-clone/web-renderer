export type PlainObject = {
  [key: string]: any;
};

export type ObjectStore = {
  [key: string]: PlainObject;
};

export type ObjectMap = {
  hierarchy: PlainObject;
  objects: ObjectStore;
};

export const reconstituteData = (
  { hierarchy, objects }: ObjectMap,
  orphanIds: string[] | null = null
): PlainObject => {
  const seenObjects: Map<PlainObject, PlainObject> = new Map();

  if (orphanIds) {
    Object.keys(objects).forEach((id) => orphanIds.push(id));
  }

  const getReferences = (value: any): PlainObject => {
    if (seenObjects.has(value)) {
      return seenObjects.get(value)!;
    }

    if (Array.isArray(value)) {
      const updated: any[] = [];

      seenObjects.set(value, updated);

      value.forEach((value) => updated.push(getReferences(value)));

      return updated;
    }

    if (value && value['#ref']) {
      if (orphanIds) {
        orphanIds.splice(orphanIds.indexOf(value['#ref']), 1);
      }

      if (!(value['#ref'] in objects)) {
        throw new TypeError(`missing ${value['#ref']}`);
      }

      const updated = getReferences(objects[value['#ref']]);

      seenObjects.set(value, updated);

      return updated;
    }

    if (value instanceof Object) {
      const updated: PlainObject = {};

      seenObjects.set(value, updated);

      Object.entries(value).forEach(([key, childValue]) => {
        updated[key] = getReferences(childValue);
      });

      return updated;
    }

    return value;
  };

  return getReferences(hierarchy);
};

export default reconstituteData;
