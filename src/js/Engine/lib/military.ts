// The Military report (F2, #405), after v474.05's Military Advisor (`Overlay_14.cs` `F14_0000_03ad_MilitaryReport`
//  and `F14_0000_061f`): our units by type, how many we have and are building, and how many we have lost. Worked out
//  here so the report knows no rules (#274): a unit's numbers come from the ruleset, and what counts as a loss is the
//  ruleset's (`UnitLossRegistry`). Only our own: without the cheat, v474.05 shows no one else's losses.

import { UnitStats, unitStats } from './civilopedia';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';
import { AvailableCityBuildItemsRegistry } from '@civ-clone/core-city-build/AvailableCityBuildItemsRegistry';
import { CityBuildRegistry } from '@civ-clone/core-city-build/CityBuildRegistry';
import { CityRegistry } from '@civ-clone/core-city/CityRegistry';
import Player from '@civ-clone/core-player/Player';
import { RuleRegistry } from '@civ-clone/core-rule/RuleRegistry';
import Unit from '@civ-clone/core-unit/Unit';
import { UnitLossRegistry } from '@civ-clone/core-unit/UnitLossRegistry';
import { UnitRegistry } from '@civ-clone/core-unit/UnitRegistry';

export type MilitaryStatusRow = {
  // The class name, as the unit's strings are keyed (`unit:<name>.name`).
  unit: string;
  // Its Civilopedia entry's key, for the report to open (#744).
  key: string;
  stats: UnitStats;
  active: number;
  inProduction: number;
};

export type MilitaryLossRow = {
  unit: string;
  key: string;
  lost: number;
};

export type MilitaryReport = {
  // Each type we have or are building.
  status: MilitaryStatusRow[];
  // Each type we have lost.
  losses: MilitaryLossRow[];
};

export type MilitaryDependencies = {
  availableCityBuildItems: Pick<AvailableCityBuildItemsRegistry, 'entries'>;
  cities: Pick<CityRegistry, 'getByPlayer'>;
  cityBuilds: Pick<CityBuildRegistry, 'getBy'>;
  rules: RuleRegistry;
  unitLosses: Pick<UnitLossRegistry, 'getByPlayer'>;
  units: Pick<UnitRegistry, 'getByPlayer'>;
};

type UnitType = typeof Unit;

const count = (types: UnitType[]): Map<UnitType, number> =>
  types.reduce(
    (counts, UnitType) => counts.set(UnitType, (counts.get(UnitType) ?? 0) + 1),
    new Map<UnitType, number>()
  );

/** `player`'s military, each type in the order a city's build list has it, then any other by name. */
export const militaryReport = (
  player: Player,
  {
    availableCityBuildItems,
    cities,
    cityBuilds,
    rules,
    unitLosses,
    units,
  }: MilitaryDependencies
): MilitaryReport => {
  const buildOrder = (availableCityBuildItems.entries() as Function[]).filter(
      (Item) => Item.prototype instanceof Unit
    ) as UnitType[],
    inOrder = (types: Iterable<UnitType>): UnitType[] =>
      Array.from(types).sort((a, b) => {
        const [aIndex, bIndex] = [a, b].map((Type) => {
          const index = buildOrder.indexOf(Type);

          return index === -1 ? buildOrder.length : index;
        });

        return aIndex - bIndex || a.name.localeCompare(b.name);
      }),
    active = count(
      units.getByPlayer(player).map((unit) => unit.sourceClass() as UnitType)
    ),
    inProduction = count(
      cities
        .getByPlayer(player)
        .flatMap((city) => cityBuilds.getBy('city', city))
        .map((cityBuild) => cityBuild.building()?.item())
        .filter(
          (Item): Item is UnitType =>
            typeof Item === 'function' && Item.prototype instanceof Unit
        )
    ),
    losses = unitLosses
      .getByPlayer(player)
      .filter((unitLoss) => unitLoss.count() > 0);

  return {
    status: inOrder(new Set([...active.keys(), ...inProduction.keys()])).map(
      (UnitType) => ({
        unit: UnitType.name,
        key: typeNameOf(UnitType),
        stats: unitStats(UnitType, rules),
        active: active.get(UnitType) ?? 0,
        inProduction: inProduction.get(UnitType) ?? 0,
      })
    ),
    losses: inOrder(losses.map((unitLoss) => unitLoss.unit())).map(
      (UnitType) => ({
        unit: UnitType.name,
        key: typeNameOf(UnitType),
        lost: losses.find((unitLoss) => unitLoss.unit() === UnitType)!.count(),
      })
    ),
  };
};

export default militaryReport;
