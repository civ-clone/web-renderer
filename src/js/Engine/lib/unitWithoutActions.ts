import {
  AdditionalDataRegistry,
  instance as additionalDataRegistryInstance,
} from '@civ-clone/core-data-object/AdditionalDataRegistry';
import DataObject from '@civ-clone/core-data-object/DataObject';
import Unit from '@civ-clone/core-unit/Unit';
import generateInheritance from '@civ-clone/core-data-object/lib/generateInheritance';

// What a stand-in reports as its class, so that `toPlainObject` finds no additional data for it: see below.
class UnitWithoutActions {}

const omitted = ['actions', 'actionsForNeighbours'],
  standIns: WeakMap<Unit, Unit> = new WeakMap(),
  isStandIn: WeakSet<Unit> = new WeakSet();

// A unit serialises as this stand-in without `actions` and `actionsForNeighbours` (#323). The UI only reads them for
//  its active unit, and they cost the unit's action rules on nine tiles, so a patch carrying all of a late game's units
//  ran them over a hundred times and sent the result for each one.
//
// `toPlainObject` calls `value[key]()` for each of `value.keys()`, so the stand-in only has to answer `keys()`
//  differently, but what each key reads has to come from the unit itself, not the stand-in. The improvements a unit
//  has (veteran, fortified) are looked up by the unit, and its attack and defence by the rules that read them, and the
//  stand-in is a different object: through it, every unit would lose them. So each key the stand-in keeps calls the
//  unit's own method, and its additional data, which `toPlainObject` would otherwise hand the stand-in, is worked out
//  from the unit and sent as keys. The stand-in reports a class with no additional data, and `_` and `__` as keys
//  give it the unit's class back, as `UnknownUnit` does. Its id is the unit's, so the UI updates the unit in place.
export const unitWithoutActions = (
  unit: Unit,
  additionalDataRegistry: AdditionalDataRegistry = additionalDataRegistryInstance
): Unit => {
  const existing = standIns.get(unit);

  if (existing) {
    return existing;
  }

  const keys = (unit.keys() as string[]).filter(
      (key) => !omitted.includes(key)
    ),
    additionalData = additionalDataRegistry.getByType(unit.sourceClass()),
    value = (read: () => unknown) => ({ value: read });

  const standIn: Unit = Object.create(unit, {
    keys: value(() => [
      '_',
      '__',
      ...keys,
      ...additionalData.map((additionalData) => additionalData.key()),
    ]),
    sourceClass: value(() => UnitWithoutActions),
    _: value(() => unit.sourceClass().name),
    __: value(() => generateInheritance(unit as unknown as DataObject)),
    ...Object.fromEntries(
      keys.map((key) => [
        key,
        value(() => {
          const property = (unit as any)[key];

          return property instanceof Function ? property.call(unit) : property;
        }),
      ])
    ),
    ...Object.fromEntries(
      additionalData.map((additionalData) => [
        additionalData.key(),
        value(() => additionalData.data(unit)),
      ])
    ),
  });

  standIns.set(unit, standIn);
  isStandIn.add(standIn);

  return standIn;
};

// A filter sees every object `toPlainObject` walks, the stand-in included when it is the object being serialised, and
//  the stand-in is still a `Unit`.
export const isUnitWithoutActions = (unit: Unit): boolean =>
  isStandIn.has(unit);

export default unitWithoutActions;
