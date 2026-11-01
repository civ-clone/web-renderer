import {
  CivilopediaEntry,
  CivilopediaKind,
} from '../../Engine/lib/civilopedia';
import {
  EntriesByKey,
  classLink,
  entryName,
  escape,
  subjectLine,
  targetLine,
  whereHtml,
} from './lib/requirements';
import CivilopediaRequest from '../../Engine/Requests/Civilopedia';
import { RequirementData } from '../../Engine/lib/requirements';
import Requirements from '../../Engine/Requests/Requirements';
import Transport from '../Transport';
import FilterableWindow from './FilterableWindow';
import { h } from '../lib/html';
import { s } from '@dom111/element';
import { t } from 'i18next';

// The Civilopedia (#183): an entry for everything the game knows, each saying what it needs, what it leads to, what
//  makes it obsolete, what replaces it and what makes it work better, linked to one another. Civ1 grouped its entries
//  the same way, but every line here comes from the engine's data (#37), so a plugin's units and advances have entries
//  with no change here, and there is no descriptive text. Icons wait for #64.

export interface CivilopediaData {
  entries: EntriesByKey;
  requirements: Map<string, RequirementData>;
}

// The entries are definitions, the same for the whole page, so they are asked for once per transport: the plugins, and
//  so the ruleset, are loaded once per page, and the costs are those before any city or difficulty changes them.
const loaded = new WeakMap<Transport, Promise<CivilopediaData>>();

export const loadCivilopedia = (
  transport: Transport
): Promise<CivilopediaData> => {
  if (!loaded.has(transport)) {
    // The answers typed here: `tsconfig.json`, which checks this file through `ChoiceHandler`, sees them as `any`.
    const request = Promise.all([
      transport.request(new CivilopediaRequest()),
      transport.request(new Requirements()),
    ]).then(
      ([entries, requirements]: [CivilopediaEntry[], RequirementData[]]) => ({
        entries: new Map(entries.map((entry) => [entry.key, entry])),
        requirements: new Map(
          requirements.map((requirement) => [requirement.id, requirement])
        ),
      })
    );

    // A failure is asked again next time, not kept.
    request.catch(() => loaded.delete(transport));

    loaded.set(transport, request);
  }

  return loaded.get(transport)!;
};

// Civ1's order (advances, improvements, units, terrain), with what it showed elsewhere in between.
const sections: CivilopediaKind[] = [
  'advance',
  'improvement',
  'wonder',
  'unit',
  'government',
  'spaceship',
  'tileImprovement',
  'terrain',
];

// The order a page lists an entry's requirements in, each line saying its relation ("Needs", "Obsolete with"). A
//  relation a plugin adds comes after these.
const relations: string[] = [
  'requires',
  'excludedBy',
  'obsoletedBy',
  'replacedBy',
  'enhancedBy',
];

const rank = (requirement: RequirementData): number => {
  const index = relations.indexOf(requirement.relation);

  return index === -1 ? relations.length : index;
};

const inOrder = (requirements: RequirementData[]): RequirementData[] =>
  // `sort` is stable, so entries keep the order they were added in within a relation.
  [...requirements].sort((a, b) => rank(a) - rank(b));

const byName = (a: CivilopediaEntry, b: CivilopediaEntry): number =>
  entryName(a).localeCompare(entryName(b));

const section = (heading: string, lines: string[]): string =>
  lines.length === 0
    ? ''
    : `<section><h4>${heading}</h4><ul>${lines
        .map((line) => `<li>${line}</li>`)
        .join('')}</ul></section>`;

const unique = (lines: string[]): string[] => Array.from(new Set(lines));

/** An entry's page, as HTML. */
export const entryHtml = (
  entry: CivilopediaEntry,
  { entries, requirements }: CivilopediaData
): string => {
  const about = entry.requires
      .map((id) => requirements.get(id))
      .filter((requirement): requirement is RequirementData => !!requirement),
    leadsTo = entry.leadsTo
      .map((id) => requirements.get(id))
      .filter((requirement): requirement is RequirementData => !!requirement),
    // A terrain is no requirement's target: tile improvements name it among the terrains they go on.
    goesHere = Array.from(requirements.values()).filter(
      (requirement) => requirement.where?.includes(entry.key) ?? false
    ),
    facts = [
      ...(entry.stats === null
        ? []
        : [
            t('Civilopedia.stats', {
              attack: entry.stats.attack,
              defense: entry.stats.defence,
              movement: entry.stats.movement,
            }),
          ]),
      ...(entry.cost === null
        ? []
        : [t('Civilopedia.cost', { cost: entry.cost })]),
    ];

  const lines = [
    facts.length === 0 ? '' : `<p class="entry-facts">${facts.join(' · ')}</p>`,
    section(
      t('Civilopedia.heading.subject'),
      unique(
        inOrder(about)
          .flatMap((requirement) => [
            subjectLine(requirement, entries),
            whereHtml(requirement, entries),
          ])
          .filter((line): line is string => line !== null)
      )
    ),
    section(
      t('Civilopedia.heading.target'),
      unique(
        inOrder(leadsTo).map((requirement) => targetLine(requirement, entries))
      )
    ),
    section(
      t('Civilopedia.heading.goes-here'),
      unique(
        goesHere.map((requirement) => classLink(requirement.subject, entries))
      )
    ),
  ].join('');

  return [
    `<h3 class="entry-name">${escape(entryName(entry))}</h3>`,
    `<p class="entry-kind">${t(`Civilopedia.kind.${entry.kind}`)}</p>`,
    lines === '' ? `<p>${t('Civilopedia.nothing-known')}</p>` : lines,
  ].join('');
};

/** The index: each section's entries, by name. */
export const indexHtml = ({ entries }: CivilopediaData): string =>
  sections
    .map((kind) => {
      const inSection = Array.from(entries.values())
        .filter((entry) => entry.kind === kind)
        .sort(byName);

      return inSection.length === 0
        ? ''
        : `<section class="index-section"><h4>${t(
            `Civilopedia.section.${kind}`
          )}</h4><ul>${inSection
            .map((entry) => `<li>${classLink(entry.key, entries)}</li>`)
            .join('')}</ul></section>`;
    })
    .join('');

// The one open, which the menu, the `?` key and a Can't build window's links reuse rather than piling up another.
let open: Civilopedia | null = null;

export class Civilopedia extends FilterableWindow {
  #data: CivilopediaData | null = null;
  #entry: HTMLElement = s('<article class="entry"></article>');
  #pending: string | null = null;
  #history: string[] = [];
  #index: HTMLElement = s('<nav class="index"></nav>');

  // `key` opens the window at that entry, by its save key (`RailroadAdvance`).
  constructor(transport: Transport, key: string | null = null) {
    super(t('Civilopedia.title'), s(`<p>${t('Civilopedia.loading')}</p>`), {
      classes: 'civilopedia',
      groupSelector: '.index-section',
      rowSelector: '.index li',
    });

    open = this;
    this.#pending = key;

    this.on('close', () => {
      if (open === this) {
        open = null;
      }
    });

    loadCivilopedia(transport).then(
      (data) => {
        this.#data = data;

        this.#index.innerHTML = indexHtml(data);

        super.update(
          s('<div class="civilopedia-panes"></div>', this.#index, this.#entry)
        );

        h(this.element(), {
          click: (event: Event) => {
            const link = (event.target as HTMLElement).closest?.(
              'a.civilopedia-link, button.back'
            ) as HTMLElement | null;

            if (!link) {
              return;
            }

            event.preventDefault();

            if (link.matches('button.back')) {
              this.back();

              return;
            }

            this.show(link.dataset.key!);
          },
        });

        if (this.#pending === null) {
          this.back();
        } else {
          this.show(this.#pending);
        }
      },
      () => super.update(s(`<p>${t('Civilopedia.failed')}</p>`))
    );
  }

  /** The open Civilopedia, at the entry with save key `key` when there is one, or a new one. */
  static open(transport: Transport, key: string | null = null): Civilopedia {
    if (open === null || !open.element().isConnected) {
      return new Civilopedia(transport, key);
    }

    if (key !== null) {
      open.show(key);
    }

    open.element().focus();

    return open;
  }

  /** Shows the entry with save key `key`, remembering the one shown before for Back. */
  show(key: string, remember: boolean = true): void {
    if (!this.#data) {
      // Still loading: shown once it has.
      this.#pending = key;

      return;
    }

    const entry = this.#data.entries.get(key);

    if (!entry) {
      return;
    }

    const current = this.#entry.dataset.key;

    if (remember && current && current !== key) {
      this.#history.push(current);
    }

    this.#entry.dataset.key = key;
    this.#entry.innerHTML = `<button class="btn-quiet back">${t(
      'Civilopedia.back'
    )}</button>${entryHtml(entry, this.#data)}`;

    // On a narrow screen the entry takes the index's place; Back returns to it.
    this.element().classList.add('showing-entry');
    this.#entry.scrollTop = 0;
  }

  /** The entry shown before this one, or the index when there is none. */
  back(): void {
    const previous = this.#history.pop();

    if (previous) {
      this.show(previous, false);

      return;
    }

    delete this.#entry.dataset.key;
    this.#entry.innerHTML = `<p class="choose">${t('Civilopedia.choose')}</p>`;
    this.element().classList.remove('showing-entry');
  }

  // Which entry is shown, by save key, or `null` for the index alone.
  shown(): string | null {
    return this.#entry.dataset.key ?? null;
  }
}

export default Civilopedia;
