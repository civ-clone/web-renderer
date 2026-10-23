// Requirement entries (#37) in words, for the civilopedia and the build list's Can't build window (#183). Only what the
//  engine sends is read: an entry's relation, targets, mode, range and terrains, and each civilopedia entry's kind.
//  Nothing here decides whether a requirement is met.

import {
  CivilopediaEntry,
  CivilopediaKind,
} from '../../../Engine/lib/civilopedia';
import {
  RequirementData,
  RequirementTargetData,
} from '../../../Engine/lib/requirements';
import { advanceName } from './advances';
import { t } from 'i18next';

export type EntriesByKey = Map<string, CivilopediaEntry>;

// Each kind's name, from the namespace the rest of the game names it from.
const names: { [kind in CivilopediaKind]: (name: string) => string } = {
  advance: (name) => advanceName(name),
  unit: (name) => t(`${name}.name`, { defaultValue: name, ns: 'unit' }),
  improvement: (name) =>
    t(`Improvement.${name}.name`, { defaultValue: name, ns: 'city' }),
  wonder: (name) => t(`${name}.name`, { defaultValue: name, ns: 'wonder' }),
  government: (name) =>
    t(`${name}.name`, { defaultValue: name, ns: 'government' }),
  spaceship: (name) =>
    t(`${name}.name`, { defaultValue: name, ns: 'spaceship' }),
  tileImprovement: (name) =>
    t(`Improvement.${name}.name`, { defaultValue: name, ns: 'world' }),
  terrain: (name) => t(`${name}.name`, { defaultValue: name, ns: 'world' }),
};

export const entryName = (entry: CivilopediaEntry): string =>
  names[entry.kind](entry.name);

// A class with no entry of its own is a base class some entries are about (`Naval`, `CityImprovement`).
export const className = (key: string, entries: EntriesByKey): string => {
  const entry = entries.get(key);

  return entry
    ? entryName(entry)
    : t(`Civilopedia.class.${key}`, { defaultValue: key });
};

export const escape = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// A class as a link to its entry, or as plain text when it has none.
export const classLink = (key: string, entries: EntriesByKey): string =>
  entries.has(key)
    ? `<a href="#" class="civilopedia-link" data-key="${escape(key)}">${escape(
        className(key, entries)
      )}</a>`
    : escape(className(key, entries));

// A condition a rule decides (`civ1-unit:coastal-city`). i18next reads `:` as a namespace, so the key has `.` instead.
export const conditionText = (id: string): string =>
  t(`Civilopedia.condition.${id.replace(/:/g, '.')}`, { defaultValue: id });

const targetHtml = (
  target: RequirementTargetData,
  entries: EntriesByKey
): string =>
  'class' in target
    ? classLink(target.class, entries)
    : escape(conditionText(target.condition));

const list = (items: string[]): string =>
  items.length < 2
    ? items.join('')
    : t('Civilopedia.list', {
        items: items.slice(0, -1).join(', '),
        last: items[items.length - 1],
        interpolation: { escapeValue: false },
      });

/**
 * An entry as its subject reads it, as HTML ("Needs <a>Gunpowder</a>"), or `null` when it says nothing: an entry with
 *  no targets says only where its subject goes, which `whereHtml` gives.
 */
export const subjectLine = (
  requirement: RequirementData,
  entries: EntriesByKey
): string | null => {
  if (requirement.targets.length === 0) {
    return null;
  }

  const targets = requirement.targets.map((target) =>
      targetHtml(target, entries)
    ),
    // A relation a plugin adds, with no wording of its own, reads as a requirement.
    line = t(
      [
        `Civilopedia.subject.${requirement.relation}`,
        'Civilopedia.subject.requires',
      ],
      {
        context: requirement.mode === 'any' && targets.length > 1 ? 'any' : '',
        targets:
          requirement.mode === 'any' && targets.length > 1
            ? targets.join(', ')
            : list(targets),
        interpolation: { escapeValue: false },
      }
    );

  // Whose Wonder or advance counts: anyone's, not only the player's own.
  return requirement.range === 'world'
    ? t(
        [
          `Civilopedia.world.${requirement.relation}`,
          'Civilopedia.world.other',
        ],
        { line, interpolation: { escapeValue: false } }
      )
    : line;
};

/** Where an entry's subject goes ("Can be built on Desert, Grassland and Hills"), or `null` for anywhere. */
export const whereHtml = (
  requirement: RequirementData,
  entries: EntriesByKey
): string | null =>
  requirement.where === null
    ? null
    : t('Civilopedia.where', {
        terrains: list(
          requirement.where.map((terrain) => classLink(terrain, entries))
        ),
        interpolation: { escapeValue: false },
      });

/** An entry as one of its targets reads it ("Allows <a>Musketmen</a>"). */
export const targetLine = (
  requirement: RequirementData,
  entries: EntriesByKey
): string =>
  t(
    [
      `Civilopedia.target.${requirement.relation}`,
      'Civilopedia.target.requires',
    ],
    {
      subject: classLink(requirement.subject, entries),
      interpolation: { escapeValue: false },
    }
  );
