// What an entry does (#1196), in words: each effect the rules describe is said by its `type`, from the translation
//  `Civilopedia.effect.<type>`, so a plugin's effect needs only its wording, and the page knows no rules. The string
//  fields pick the wording's context (`yield_percent` with `of: 'base'` is `Civilopedia.effect.yield_percent_base`),
//  a negative `value` adds `_negative` and a `value` of 0 `_zero` (each falling back to the wording without it), and
//  the fields that qualify an effect (`needs`, `replaces`, `from`…) each add a clause of their own. An effect with no wording is left out, and logged once.
import {
  CivilopediaEffect,
  CivilopediaEffectValue,
} from '@civ-clone/ui-protocol/civilopedia';
import { EntriesByKey, classLink } from './requirements';
import i18next, { t } from 'i18next';
import { escape } from '@civ-clone/ui-widgets/lib/html';

// The fields a clause says, in the order they're said.
export const clauses: string[] = [
  'needs',
  'with',
  'replaces',
  'notWith',
  'except',
  'from',
  'until',
];

const isClass = (
  value: CivilopediaEffectValue
): value is { class: string; name: string } =>
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
    return entries.has(value.class)
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

  return typeof value === 'object' ? null : String(value);
};

const warned = new Set<string>();

/** An effect as one line of HTML, or `null` when there's no wording for its type. */
export const effectLine = (
  effect: CivilopediaEffect,
  entries: EntriesByKey
): string | null => {
  const key = `Civilopedia.effect.${effect.type}`,
    value = typeof effect.value === 'number' ? effect.value : null,
    context = [
      ...Object.entries(effect)
        .filter(
          ([field, fieldValue]) =>
            field !== 'type' && typeof fieldValue === 'string'
        )
        .map(([, fieldValue]) => fieldValue as string),
      ...(value !== null && value < 0 ? ['negative'] : []),
      ...(value === 0 ? ['zero'] : []),
    ].join('_'),
    count = value === null ? undefined : Math.abs(value);

  // A wording may exist only with its context or plural (`content_one`), so it's looked for as it would be said.
  if (!i18next.exists(key, { context, count })) {
    if (!warned.has(effect.type)) {
      warned.add(effect.type);

      console.warn(`Civilopedia: no wording for the effect '${effect.type}'.`);
    }

    return null;
  }

  const fields = Object.fromEntries(
      Object.entries(effect)
        .filter(([field]) => field !== 'type' && !clauses.includes(field))
        .map(([field, fieldValue]) => [field, said(fieldValue, entries) ?? ''])
    ),
    main = t(key, {
      ...fields,
      ...(value === null
        ? {}
        : {
            value: Math.abs(value),
            count,
            percent: Math.round(Math.abs(value) * 100),
          }),
      context,
      interpolation: { escapeValue: false },
    }),
    qualified = clauses
      .map((field) => {
        const targets = said(
          effect[field] ?? null,
          entries,
          field === 'needs' || field === 'notWith'
            ? 'Civilopedia.list_or'
            : 'Civilopedia.list'
        );

        return targets === null
          ? null
          : t(`Civilopedia.effect.clause.${field}`, {
              targets,
              interpolation: { escapeValue: false },
            });
      })
      .filter((clause): clause is string => clause !== null);

  return [main, ...qualified].join(', ');
};

// What a city pays for an entry, said after what it does.
const last: string[] = ['upkeep'];

const rank = ({ type }: CivilopediaEffect): number =>
  last.includes(type) ? 1 : 0;

/** An entry's effects, as lines of HTML, each said once, its upkeep last. */
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
