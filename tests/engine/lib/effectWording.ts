// What the Civilopedia's effects (#1196) need wording for, as the page looks it up (`packages/reports/components/lib/
//  effects.ts`), checked against the en translations' source: each effect's wording, its scope's, and the name of each
//  class it names that has no entry of its own (a yield, a unit type, a trait), which would otherwise show its class
//  name ("GoldYield").

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CivilopediaEffectValue,
  CivilopediaEntry,
} from '@civ-clone/ui-protocol/civilopedia';
import { RequirementData } from '@civ-clone/ui-protocol/requirements';

const translations = (): string =>
  readFileSync(
    join(process.cwd(), 'packages/reports/translations/en.ts'),
    'utf8'
  );

const has = (source: string, key: string): boolean =>
  source.includes(`'${key}'`);

// Each effect's wording: its type and string fields, bar `scope`, and `_negative` below 0, under `squares.` for a tile
//  improvement's effect on the squares it's on (#1272). A plural or a `_zero` the page adds itself.
const effectKey = (effect: CivilopediaEntry['effects'][number]): string =>
  [
    `Civilopedia.effect.${effect.squares === undefined ? '' : 'squares.'}${
      effect.type
    }`,
    ...Object.entries(effect)
      .filter(
        ([field, value]) =>
          field !== 'type' && field !== 'scope' && typeof value === 'string'
      )
      .map(([, value]) => value),
    ...(typeof effect.value === 'number' && effect.value < 0
      ? ['negative']
      : []),
  ].join('_');

type Named = { class: string; name: string; entry?: boolean };

const classes = (value: CivilopediaEffectValue): Named[] => {
  if (value === null || typeof value !== 'object') {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(classes);
  }

  return typeof value.class === 'string' && typeof value.name === 'string'
    ? [value as Named]
    : Object.values(value).flatMap(classes);
};

/** What `entries`' effects need wording for and have none, in en, by the keys the page would look up. */
export const missingWording = (
  entries: CivilopediaEntry[]
): {
  effects: string[];
  scopes: string[];
  classes: string[];
  squares: string[];
} => {
  const source = translations(),
    keys = new Set(entries.map(({ key }) => key)),
    effects = entries.flatMap(({ effects }) => effects),
    unique = (items: string[]): string[] => Array.from(new Set(items)).sort();

  return {
    effects: unique(effects.map(effectKey)).filter(
      (key) =>
        !has(source, key) &&
        !(has(source, `${key}_one`) && has(source, `${key}_other`))
    ),
    scopes: unique(
      effects.flatMap(({ scope }) =>
        typeof scope === 'string' ? [`Civilopedia.effect.scope.${scope}`] : []
      )
    ).filter((key) => !has(source, key)),
    classes: unique(
      effects
        .flatMap((effect) =>
          Object.entries(effect)
            .filter(([field]) => field !== 'type' && field !== 'squares')
            .flatMap(([, value]) => classes(value))
        )
        .filter(({ class: key, entry }) => entry === false || !keys.has(key))
        .filter(
          ({ class: key, name }) =>
            !has(source, `Civilopedia.class.${key}`) &&
            !has(source, `Civilopedia.class.${name}`)
        )
        .map(({ class: key }) => key)
    ),
    // The squares an effect is on with no entry of their own (a base class, `Land`) are said as squares, not by the
    //  class's own wording, which can mean something else ("land units").
    squares: unique(
      effects
        .flatMap(({ squares }) => classes(squares ?? null))
        .filter(({ class: key, entry }) => entry === false || !keys.has(key))
        .filter(
          ({ class: key, name }) =>
            !has(source, `Civilopedia.square.${key}`) &&
            !has(source, `Civilopedia.square.${name}`)
        )
        .map(({ class: key }) => key)
    ),
  };
};

/**
 * The conditions `requirements` name with no wording in en (#1317), by the keys `conditionText` looks up: the whole id,
 *  then the id without its package, `:` as `.`. Without either the page shows the id itself.
 */
export const missingConditions = (
  requirements: RequirementData[]
): string[] => {
  const source = translations();

  return Array.from(
    new Set(
      requirements.flatMap(({ targets }) =>
        targets.flatMap((target) =>
          'condition' in target ? [target.condition] : []
        )
      )
    )
  )
    .filter(
      (id) =>
        !has(source, `Civilopedia.condition.${id.replace(/:/g, '.')}`) &&
        !has(
          source,
          `Civilopedia.condition.${id
            .replace(/^[^:]*:/, '')
            .replace(/:/g, '.')}`
        )
    )
    .sort();
};

export default missingWording;
