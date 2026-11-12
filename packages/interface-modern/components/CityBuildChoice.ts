import { BuildItem, CityBuild } from '@civ-clone/ui-protocol/types';
import ChoiceWindow, {
  ChoiceFact,
  ChoiceRow,
} from '@civ-clone/ui-component-choice-window/ChoiceWindow';
import { ActionWindowActions } from '@civ-clone/ui-component-window/ActionWindow';
import CityBuildUnavailableWindow from '@civ-clone/ui-reports/components/CityBuildUnavailableWindow';
import Transport from '@civ-clone/ui-client/Transport';
import Unit from '@civ-clone/ui-hud/components/Unit';
import buildingIcon from '@civ-clone/ui-assets/components/lib/buildingIcon';
import entryDetails from '@civ-clone/ui-hud/components/lib/choiceDetails';
import {
  editQueue,
  getAutoLabel,
  getClearedLabel,
  getLabelForBuildable,
  heldText,
  toggleAuto,
} from '@civ-clone/ui-client/components/lib/cityBuild';
import { offeredHold } from '@civ-clone/ui-client/lib/cityTurns';
import { instance as localeProvider } from '@civ-clone/ui-platform/LocaleProvider';
import { s } from '@dom111/element';
import { t } from 'i18next';
import {
  turnsLeft,
  yieldIcon,
} from '@civ-clone/ui-city/components/lib/cityYields';

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

/**
 * One thing the city can build, as a row: its sprite where it's a unit, or its icon where it's an improvement or a Wonder
 *  (#64), its numbers, its cost and how long it takes. One a rule would hold says so under its name before it is chosen
 *  (#970), as the city screen does for its build: beside its turns, or, for the build the city is already waiting on,
 *  paid for, in their place.
 */
export const buildRow = (
  cityBuild: CityBuild,
  buildItem: BuildItem
): ChoiceRow => {
  const item = getLabelForBuildable(buildItem),
    turns = turnsLeft(
      { ...cityBuild, ...buildItem } as unknown as CityBuild,
      cityBuild.city.yields,
      'Production'
    ),
    hold = offeredHold(cityBuild, buildItem);

  return {
    value: buildItem.item._,
    label: item,
    meta: hold ? heldText(hold) : null,
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
      : buildItem.group === 'improvement' || buildItem.group === 'wonder'
      ? {
          sprite: () =>
            buildingIcon(buildItem.item._, buildItem.group === 'wonder'),
        }
      : {}),
    facts: [
      ...(buildItem.stats ? unitFacts(buildItem.stats) : []),
      {
        icon: () => yieldIcon('Production'),
        label: t('ChoiceWindow.Build.cost'),
        value: localeProvider.number(buildItem.cost.value),
      },
      ...(hold?.now
        ? []
        : [
            {
              label: t('ChoiceWindow.turns'),
              value: t('Progress.turns', { count: turns }),
            },
          ]),
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
 *  (#183). What it's building now is chosen as it opens. Add to queue (#774), Auto (#194) and Can't build… (#183)
 *  are beside the primary.
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
      // What would hold each item, for the pane beside the list (#970).
      holds = new Map(
        available.map((buildItem) => [
          buildItem.item._,
          offeredHold(cityBuild, buildItem),
        ])
      ),
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
        // Its Civilopedia entry, after what would hold it (#970), which is there at once.
        describe: (row) => {
          const details = entryDetails(transport, row.value, [
              'unit',
              'improvement',
              'wonder',
              'spaceship',
            ]),
            hold = holds.get(row.value) ?? null;

          if (hold === null) {
            return details;
          }

          const note = s('<p class="held-note"></p>'),
            pane = s('<div class="build-details"></div>', note);

          note.textContent = heldText(hold);
          details.then((entry) => entry && pane.append(entry));

          return pane;
        },
        actions: {
          ...additionalActions,
          // What's chosen, after what the city is building now (#774). Building nothing, choosing starts it.
          ...(cityBuild.building === null
            ? {}
            : {
                queue: {
                  label: t('ChoiceWindow.Build.queue'),
                  action: (window) => {
                    const chosen = (window as ChoiceWindow).chosen();

                    if (chosen === null) {
                      return;
                    }

                    editQueue(cityBuild, transport, { op: 'add', chosen });

                    window.close();
                    this.#onComplete(true);
                  },
                },
              }),
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
