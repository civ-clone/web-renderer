import { City, Player } from '@civ-clone/ui-protocol/types';
import { Element, s } from '@dom111/element';
import i18next, { TOptions, t } from 'i18next';
import {
  buildTurns,
  turnsText,
} from '@civ-clone/ui-city/components/lib/cityYields';
import DataChanges, {
  instance as dataChanges,
} from '@civ-clone/ui-client/lib/DataChanges';
import watchPlayer, { cityRowIds } from './lib/watchPlayer';
import Portal from '@civ-clone/ui-map/components/Portal';
import { cityName } from '@civ-clone/ui-client/components/lib/city';
import { getLabelForBuildable } from '@civ-clone/ui-client/components/lib/cityBuild';
import { reduceKnownYield } from '@civ-clone/ui-client/lib/yieldMap';

// Every string here is set as text, not markup, so i18next's HTML escaping would show a name with `&` or `'` in it as
//  `&amp;` or `&#39;` (#704).
const text = (key: string, options: TOptions = {}): string =>
  t(key, { ...options, interpolation: { escapeValue: false } });

// The rows shown before "Show all".
export const citiesShown = 5;

type CityRow = {
  city: City;
  // `null` with nothing to build.
  turns: number | null;
  disorder: boolean;
  starving: boolean;
};

// Nothing to build first, then the soonest done. A build that never finishes (no production to spare: 0 turns, as
//  `turnsLeft` says `Never`) goes last. The sort is stable, so cities otherwise keep the player's order.
const sortKey = ({ turns }: CityRow): number =>
  turns === null ? -1 : turns === 0 ? Infinity : turns;

export const cityRows = (player: Player): CityRow[] => {
  // The engine's own signal, the cities it asks the player to deal with (#274), not a rule worked out here.
  const disorder = new Set(
    player.actions
      .filter((action) => action._ === 'CivilDisorder')
      .map((action) => (action.value as City).id)
  );

  return player.cities
    .map((city) => ({
      city,
      turns: city.build.building ? buildTurns(city) : null,
      disorder: disorder.has(city.id),
      // Short of food, as the city screen's growth counts it: its food after upkeep comes to less than nothing.
      starving: reduceKnownYield(city.yields, 'Food') < 0,
    }))
    .sort((a, b) => sortKey(a) - sortKey(b));
};

// Everything a row shows, and the language it's said in: two lists with the same one look the same.
const shown = (rows: CityRow[], showAll: boolean): string =>
  JSON.stringify([
    i18next.language,
    showAll,
    rows.length,
    ...(showAll ? rows : rows.slice(0, citiesShown)).map(
      ({ city, turns, disorder, starving }) => [
        city.id,
        cityName(city),
        turns === null ? null : getLabelForBuildable(city.build.building),
        turns === null ? null : turnsText(turns),
        disorder,
        starving,
      ]
    ),
  ]);

const flag = (className: string, label: string): HTMLElement => {
  const element = s(`<span class="flag ${className}"></span>`);

  element.textContent = label;

  return element;
};

/**
 * The player's cities in the sidebar (#700): what each is building and how many turns are left, the soonest first, and
 *  those with nothing to build before them. A city in disorder or starving is flagged. Five at first, the rest behind
 *  "Show all". A row opens its city.
 *
 * It follows the cities, their builds and their growth through `DataChanges` (#344), as the reports do, rather than
 *  being rebuilt every render. Most of what wakes it changes nothing it shows (a unit moving beside a city has the
 *  city sent again), so it is drawn again only when a row would read differently (#851).
 */
export class CitiesList extends Element {
  #player: Player;
  #portal: Pick<Portal, 'openCity'>;
  // What the list last drew, as `shown` says it.
  #shown: string | null = null;
  #showAll = false;
  #unwatch: () => void;

  constructor(
    element: HTMLElement,
    player: Player,
    portal: Pick<Portal, 'openCity'>,
    changes: DataChanges = dataChanges
  ) {
    super(element);

    this.#player = player;
    this.#portal = portal;
    this.#unwatch = watchPlayer(
      player,
      cityRowIds,
      (player) => {
        this.#player = player;

        this.build();
      },
      changes
    );

    this.build();
  }

  build(): void {
    // The row the keyboard is on, to put it back there once the list is rebuilt.
    const focused = (
        this.element().contains(document.activeElement)
          ? (document.activeElement as HTMLElement)
          : null
      )?.dataset.city,
      rows = cityRows(this.#player),
      shownNow = shown(rows, this.#showAll);

    if (shownNow === this.#shown) {
      return;
    }

    this.#shown = shownNow;

    this.empty();

    if (rows.length === 0) {
      const empty = s('<p class="empty"></p>');

      empty.textContent = text('CitiesList.empty');

      this.append(empty);

      return;
    }

    const list = s('<ul class="cities-list"></ul>');

    list.append(
      ...(this.#showAll ? rows : rows.slice(0, citiesShown)).map((row) =>
        this.#row(row)
      )
    );

    this.append(list);

    if (focused) {
      Array.from(list.querySelectorAll<HTMLElement>('[data-city]'))
        .find((row) => row.dataset.city === focused)
        ?.focus();
    }

    if (rows.length > citiesShown) {
      const more = s<HTMLButtonElement>(
        '<button type="button" class="btn-bare show-all"></button>'
      );

      more.textContent = text(
        this.#showAll ? 'CitiesList.show-fewer' : 'CitiesList.show-all',
        { count: rows.length }
      );
      more.setAttribute('aria-expanded', this.#showAll ? 'true' : 'false');
      more.addEventListener('click', () => {
        this.#showAll = !this.#showAll;

        this.build();

        // Rebuilt, so the button the keyboard was on is a new one.
        (
          this.element().querySelector('.show-all') as HTMLElement | null
        )?.focus();
      });

      this.append(more);
    }
  }

  dispose(): void {
    this.#unwatch();
  }

  #row({ city, turns, disorder, starving }: CityRow): HTMLElement {
    const item = s('<li></li>'),
      button = s<HTMLButtonElement>(
        '<button type="button" class="btn-bare city-row"><span class="name"></span><span class="build"><span class="item"></span><span class="turns"></span></span></button>'
      );

    button.dataset.city = city.id;
    button.querySelector('.name')!.textContent = cityName(city);

    if (turns === null) {
      button.classList.add('no-build');
      const build = button.querySelector('.build')!;

      build.textContent = '';
      build.append(flag('no-build', text('CitiesList.no-build')));
    } else {
      button.querySelector('.item')!.textContent = getLabelForBuildable(
        city.build.building
      );
      button.querySelector('.turns')!.textContent = turnsText(turns);
    }

    if (disorder || starving) {
      const flags = s('<span class="flags"></span>');

      if (disorder) {
        button.classList.add('disorder');
        flags.append(flag('disorder', text('CitiesList.disorder')));
      }

      if (starving) {
        button.classList.add('starving');
        flags.append(flag('starving', text('CitiesList.starving')));
      }

      button.append(flags);
    }

    // The city as the page holds it when the row is clicked: the row can outlast the object it was drawn from.
    button.addEventListener('click', () =>
      this.#portal.openCity(
        this.#player.cities.find(({ id }) => id === city.id) ?? city
      )
    );

    item.append(button);

    return item;
  }
}

export default CitiesList;
