import { BuildItem, CityBuild } from '../types';
import ChoiceWindow, { ChoiceFact, ChoiceRow } from './ChoiceWindow';
import { ActionWindowActions } from './ActionWindow';
import CityBuildUnavailableWindow from './CityBuildUnavailableWindow';
import Transport from '../Transport';
import Unit from './Unit';
import entryDetails from './lib/choiceDetails';
import {
  getAutoLabel,
  getClearedLabel,
  getLabelForBuildable,
  toggleAuto,
} from './lib/cityBuild';
import { instance as localeProvider } from '../LocaleProvider';
import { s } from '@dom111/element';
import { t } from 'i18next';
import { turnsLeft } from './lib/cityYields';

type onCompleteHandler = (hasSelected: boolean) => void;

// A unit's attack, defence and movement, as the unit card shows them (#743).
const unitFacts = (stats: NonNullable<BuildItem['stats']>): ChoiceFact[] =>
  (
    [
      ['attack', 'stat-attack', stats.attack],
      ['defence', 'stat-defence', stats.defence],
      ['movement', 'stat-moves', stats.movement],
    ] as const
  ).map(([name, glyph, value]) => ({
    glyph,
    label: t(`ChoiceWindow.Build.${name}`),
    value: localeProvider.number(value),
  }));

/** One thing the city can build, as a row: its sprite where it's a unit, its numbers, its cost and how long it takes. */
export const buildRow = (
  cityBuild: CityBuild,
  buildItem: BuildItem
): ChoiceRow => {
  const item = getLabelForBuildable(buildItem),
    turns = turnsLeft(
      { ...cityBuild, ...buildItem } as unknown as CityBuild,
      cityBuild.city.yields,
      'Production'
    );

  return {
    value: buildItem.item._,
    label: item,
    ...(buildItem.group
      ? { group: t(`ChoiceWindow.Build.group.${buildItem.group}`) as string }
      : {}),
    ...(buildItem.group === 'unit'
      ? {
          sprite: () =>
            new Unit(
              {
                _: buildItem.item._,
                player: cityBuild.city.player,
                improvements: [],
                busy: null,
              } as unknown as ConstructorParameters<typeof Unit>[0],
              1
            ).element(),
        }
      : {}),
    facts: [
      ...(buildItem.stats ? unitFacts(buildItem.stats) : []),
      {
        label: t('ChoiceWindow.Build.cost'),
        value: t('ChoiceWindow.Build.shields', {
          count: buildItem.cost.value,
        }),
      },
      {
        label: t('ChoiceWindow.Build.turns'),
        value: t('Progress.turns', { count: turns }),
      },
    ],
    primary: t('ChoiceWindow.Build.build', {
      item,
      interpolation: { escapeValue: false },
    }),
  };
};

/**
 * What a city builds, under the new interface (#745): what it can build in the engine's order, under each section's
 *  heading (#432), with a unit's numbers (#381), each item's cost and turns, and its Civilopedia entry beside the list
 *  (#183). What it's building now is chosen as it opens. Auto (#194) and Can't build… (#183) are beside the primary.
 */
export class CityBuildChoice extends ChoiceWindow {
  #onComplete: onCompleteHandler;

  constructor(
    cityBuild: CityBuild,
    // What the city can build is not part of `cityBuild` (#324): the opener fetches it with a `CityBuildAvailable`.
    available: BuildItem[],
    transport: Transport,
    onComplete: onCompleteHandler = () => {},
    additionalActions: ActionWindowActions = {}
  ) {
    const cleared = getClearedLabel(cityBuild),
      intro = cleared === null ? null : s('<p class="build-cleared"></p>');

    if (intro !== null) {
      intro.textContent = cleared;
    }

    super(
      t('Actions.CityBuildSelectionWindow.title', {
        city: cityBuild.city,
      }),
      available.map((buildItem) => buildRow(cityBuild, buildItem)),
      (chosen) => {
        transport.send('action', {
          name: cityBuild.building === null ? 'CityBuild' : 'ChangeProduction',
          id: cityBuild.id,
          chosen,
        });

        this.#onComplete(true);
      },
      {
        // `city-build` for the window's eyebrow.
        classes: ['city-build'],
        // Starting a build is worth seeing, and the window also offers the city's own screen.
        autoChooseSingle: false,
        chosen: cityBuild.building?.item._ ?? null,
        intro,
        describe: (row) =>
          entryDetails(transport, row.value, [
            'unit',
            'improvement',
            'wonder',
            'spaceship',
          ]),
        actions: {
          ...additionalActions,
          auto: {
            label: getAutoLabel(cityBuild),
            action: (window) => {
              toggleAuto(cityBuild, transport);

              window.close();
              this.#onComplete(true);
            },
          },
          // What the city can't build, and why (#183). The list stays open behind it.
          unavailable: {
            label: t('City.Build.unavailable'),
            action: () => {
              new CityBuildUnavailableWindow(cityBuild, transport);
            },
          },
        },
      }
    );

    this.#onComplete = onComplete;
  }
}

export default CityBuildChoice;
