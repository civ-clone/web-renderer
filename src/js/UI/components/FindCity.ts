import ChoiceWindow, { ChoiceRow } from './ChoiceWindow';
import { City, Tile } from '../types';
import { cityName } from './lib/city';
import { playerColours } from '../lib/renderUnit';
import { s } from '@dom111/element';
import { t } from 'i18next';

// Find City (#346): every city on the squares the player holds, their own and the rivals' they've seen, by name. What
//  the map already knows, so nothing is asked of the engine (#274).

const swatch = (city: City): Node => {
  const element = s<HTMLElement>(
      '<span class="ui-civ-swatch" aria-hidden="true"></span>'
    ),
    [first, second] = playerColours(city.player);

  element.style.setProperty('--swatch-first', first);
  element.style.setProperty('--swatch-second', second ?? first);

  return element;
};

/** A row for each city on `tiles`, by name, the owner under it so that two cities of one name can be told apart. */
export const findCityRows = (tiles: Tile[]): ChoiceRow[] =>
  tiles
    .filter((tile) => tile.city)
    .map((tile): ChoiceRow => {
      const city = tile.city as City;

      return {
        value: tile.id,
        label: cityName(city),
        sprite: () => swatch(city),
        meta: t('Generic.civilization-name.nation-start', {
          civilization: city.player.civilization._,
        }),
        facts: [
          {
            label: t('ReportTable.CityStatus.size'),
            value: t('City.size', { size: city.growth.size }),
          },
        ],
        primary: t('Actions.ShowOnMap.label'),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

/** Opens the list, in either interface: the classic one has no list that can be typed in. */
export const openFindCity = (
  tiles: Tile[],
  show: (tile: Tile) => void
): ChoiceWindow => {
  const rows = findCityRows(tiles);

  return new ChoiceWindow(
    t('FindCity.title'),
    rows,
    (id) => {
      const tile = tiles.find((candidate) => candidate.id === id);

      if (tile) {
        show(tile);
      }
    },
    {
      autoChooseSingle: false,
      classes: ['find-city'],
      intro: rows.length === 0 ? s(`<p>${t('FindCity.no-cities')}</p>`) : null,
      typeAhead: true,
    }
  );
};

export default openFindCity;
