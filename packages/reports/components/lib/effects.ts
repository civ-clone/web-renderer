// What an entry does (#1196), in words: each effect the rules describe is said by its `type`, from the translation
//  `Civilopedia.effect.<type>`, so a plugin's effect needs only its wording, and the page knows no rules. The string
//  fields pick the wording's context (`yield_percent` with `of: 'base'` is `Civilopedia.effect.yield_percent_base`),
//  and a negative `value` adds `_negative`, a `value` of 0 `_zero`. Only `_zero` falls back to the wording without
//  it ("Upkeep: 0 gold a turn"): a missing context is never read as another, so a negative value is never said as
//  a positive one, and an effect with no wording for its context is left out, and logged once. The fields that
//  qualify an effect (`needs`, `replaces`, `from`…) each add a clause of their own.
import {
  CivilopediaEffect,
  CivilopediaEffectValue,
} from '@civ-clone/ui-protocol/civilopedia';
import { EntriesByKey, classLink } from './requirements';
import i18next, { t } from 'i18next';
import { escape } from '@civ-clone/ui-widgets/lib/html';

// The fields a clause says, in the order they're said. `scope` (where it acts: `player`, every city of its owner;
//  `continent`, its owner's cities on its continent; none, its own city) is said last, by its own wording.
export const clauses: string[] = [
  'per',
  'inCitiesWith',
  'needs',
  'with',
  'replaces',
  'notWith',
  'against',
  'except',
  'notFor',
  'from',
  'until',
];

const isClass = (
  value: CivilopediaEffectValue
): value is { class: string; name: string; entry?: boolean } =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  typeof (value as { class?: unknown }).class === 'string';

const list = (items: string[], key: string): string =>
  items.length < 2
    ? items.join('')
    : t(key, {
        items: items.slice(0, -1).join(', '),
        last: items[items.length - 1],
        interpolation: { escapeValue: false },
      });

// A field as words: a class as a link to its entry, a list of them as "a, b and c" (or "a or b", for what it needs
//  one of), a number or word as it is.
const said = (
  value: CivilopediaEffectValue,
  entries: EntriesByKey,
  listKey: string = 'Civilopedia.list'
): string | null => {
  if (value === null) {
    return null;
  }

  // A class with no entry (a yield, a trait) by its own wording, under its save key or its class name, which
  //  differ for some (`GoldYield`, `Gold`), and otherwise by its class name.
  if (isClass(value)) {
    return value.entry !== false && entries.has(value.class)
      ? classLink(value.class, entries)
      : escape(
          t(
            [
              `Civilopedia.class.${value.class}`,
              `Civilopedia.class.${value.name}`,
            ],
            {
              defaultValue: value.name,
            }
          )
        );
  }

  if (Array.isArray(value)) {
    const items = value
      .map((item) => said(item, entries))
      .filter((item): item is string => item !== null && item !== '');

    return items.length === 0 ? null : list(items, listKey);
  }

  return typeof value === 'object' ? null : escape(String(value));
};

const warned = new Set<string>();

/** An effect as one line of HTML, or `null` when there's no wording for its type. */
export const effectLine = (
  effect: CivilopediaEffect,
  entries: EntriesByKey
): string | null => {
  const value = typeof effect.value === 'number' ? effect.value : null,
    words = Object.entries(effect)
      .filter(
        ([field, fieldValue]) =>
          field !== 'type' &&
          field !== 'scope' &&
          typeof fieldValue === 'string'
      )
      .map(([, fieldValue]) => fieldValue as string),
    sign = value !== null && value < 0 ? ['negative'] : [],
    base = `Civilopedia.effect.${[effect.type, ...words].join('_')}`,
    // The wording with its whole context first; without `_zero` only if there's none for 0.
    whole = [base, ...sign, ...(value === 0 ? ['zero'] : [])].join('_'),
    keys = value === 0 ? [whole, base] : [whole],
    count = value === null ? undefined : Math.abs(value);

  // A wording may exist only with its plural (`content_one`), so it's looked for as it would be said.
  if (!keys.some((key) => i18next.exists(key, { count }))) {
    if (!warned.has(whole)) {
      warned.add(whole);

      console.warn(`Civilopedia: no wording for the effect '${whole}'.`);
    }

    return null;
  }

  // The fields as interpolation values only, so none can be read as one of `t`'s own options (`ns`, `count`…).
  const replace = Object.fromEntries(
      Object.entries(effect)
        .filter(
          ([field]) =>
            field !== 'type' && field !== 'scope' && !clauses.includes(field)
        )
        .map(([field, fieldValue]) => [field, said(fieldValue, entries) ?? ''])
    ),
    main = t(keys, {
      replace: {
        ...replace,
        ...(value === null
          ? {}
          : {
              value: Math.abs(value),
              count,
              percent: Math.round(Math.abs(value) * 100),
            }),
      },
      count,
      interpolation: { escapeValue: false },
    }),
    // A clause may say the scope with it ("in all your cities with a Temple", `clause.inCitiesWith_player`), and
    //  then the scope isn't said again.
    scoped = (field: string): string | undefined =>
      typeof effect.scope === 'string'
        ? [`Civilopedia.effect.clause.${field}_${effect.scope}`].find((key) =>
            i18next.exists(key)
          )
        : undefined,
    scopeSaid = clauses.some(
      (field) => effect[field] !== undefined && scoped(field) !== undefined
    ),
    qualified = clauses
      .map((field) => {
        const targets = said(
          effect[field] ?? null,
          entries,
          field === 'needs' || field === 'notWith' || field === 'inCitiesWith'
            ? 'Civilopedia.list_or'
            : 'Civilopedia.list'
        );

        return targets === null
          ? null
          : t(
              scoped(field) ??
                [
                  // A type may word a clause its own way (`clause.notFor_defence_multiplier`).
                  `Civilopedia.effect.clause.${field}_${effect.type}`,
                  `Civilopedia.effect.clause.${field}`,
                ].find((key) => i18next.exists(key))!,
              {
                targets,
                interpolation: { escapeValue: false },
              }
            );
      })
      .filter((clause): clause is string => clause !== null),
    // A type may word its scope its own way (`scope.player_unit_movement`), or not at all (an empty wording).
    scopeKey =
      typeof effect.scope === 'string'
        ? [
            `Civilopedia.effect.scope.${effect.scope}_${effect.type}`,
            `Civilopedia.effect.scope.${effect.scope}`,
          ].find((key) => i18next.exists(key))
        : undefined;

  // A scope with no wording would read as the effect's own city, so it's said to be missing.
  if (typeof effect.scope === 'string' && scopeKey === undefined) {
    const missing = `Civilopedia.effect.scope.${effect.scope}`;

    if (!warned.has(missing)) {
      warned.add(missing);

      console.warn(`Civilopedia: no wording for the scope '${missing}'.`);
    }
  }

  const scope =
    scopeSaid || scopeKey === undefined || t(scopeKey) === ''
      ? []
      : [t(scopeKey)];

  return [main, ...qualified, ...scope].join(', ');
};

// What a city pays for an entry, said after what it does.
const last: string[] = ['upkeep'];

const rank = ({ type }: CivilopediaEffect): number =>
  last.includes(type) ? 1 : 0;

/**
 * An entry's effects, as lines of HTML, its upkeep last. The same line from two rules (a rule set that describes what
 *  it takes the place of, alongside the rule it replaces) is said once.
 */
export const effectLines = (
  effects: CivilopediaEffect[],
  entries: EntriesByKey
): string[] =>
  Array.from(
    new Set(
      // `sort` is stable, so the rest keep the rules' order.
      [...effects]
        .sort((a, b) => rank(a) - rank(b))
        .map((effect) => effectLine(effect, entries))
        .filter((line): line is string => line !== null)
    )
  );
