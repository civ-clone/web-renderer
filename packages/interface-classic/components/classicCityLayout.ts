import {
  City as CityData,
  CityImprovement,
  CityImprovementMaintenanceGold,
  Specialist,
  SpendCost,
  Unit as UnitData,
  Yield,
} from '@civ-clone/ui-protocol/types';
import {
  CityLayout,
  renderBuildProgress,
  renderTradeRoutes,
} from '@civ-clone/ui-city/components/City';
import {
  getAutoLabel,
  getLabelForBuildable,
  getLabelForBuildableEntity,
  toggleAuto,
} from '@civ-clone/ui-client/components/lib/cityBuild';
import {
  renderFigures,
  renderPopulation,
  turnsLeft,
  yieldImages,
} from '@civ-clone/ui-city/components/lib/cityYields';
import {
  renderMap,
  renderYields,
} from '@civ-clone/ui-city/components/lib/cityParts';
import Portal from '@civ-clone/ui-map/components/Portal';
import SupportedUnit from '@civ-clone/ui-hud/components/SupportedUnit';
import Transport from '@civ-clone/ui-client/Transport';
import Unit from '@civ-clone/ui-hud/components/Unit';
import UnitSelectionWindow from './UnitSelectionWindow';
import { h } from '@civ-clone/ui-widgets/lib/html';
import instanceOf from '@civ-clone/ui-client/lib/instanceOf';
import { instance as localeProvider } from '@civ-clone/ui-platform/LocaleProvider';
import { reduceKnownYield } from '@civ-clone/ui-client/lib/yieldMap';
import progressBar from '@civ-clone/ui-component-progress-bar/ProgressBar';
import { s } from '@dom111/element';
import { t } from 'i18next';

// The classic interface's city screen (#746, #861): the page the `cityScreen` slot is filled with.
const renderBuild = (
    city: CityData,
    chooseProduction: () => void,
    completeProduction: (spendCost: SpendCost) => void,
    readOnly: boolean,
    toggleAutoProduction: () => void
  ): HTMLElement =>
    s(
      `<div class="build"></div>`,
      s(
        `<header></header>`,
        city.build.building && instanceOf(city.build.building.item, 'Unit')
          ? new Unit({
              ...city.build.building.item,
              player: city.player,
              improvements: [],
              busy: null,
            })
          : (t('City.Build.title', {
              item: getLabelForBuildable(city.build.building),
            }) as string),
        city.build.auto
          ? s(`<span class="auto">${t('City.Build.auto-marker')}</span>`)
          : ''
      ),
      ...renderBuildProgress(city),
      readOnly
        ? ''
        : s(
            '<div class="build-actions"></div>',
            h(
              s(
                `<button class="btn-secondary">${t(
                  city.build.building
                    ? 'City.Build.change'
                    : 'City.Build.choose'
                )}</button>`
              ),
              {
                click() {
                  chooseProduction();
                },
              }
            ),
            h(
              s(
                `<button class="btn-secondary auto">${getAutoLabel(
                  city.build
                )}</button>`
              ),
              {
                click() {
                  toggleAutoProduction();
                },
              }
            ),
            ...city.build.spendCost.map((spendCost) =>
              h(
                s(
                  `<button class="btn-secondary buy" data-resource="${
                    spendCost.resource._
                  }">${t('City.Build.buy-with', {
                    spendCost,
                  })}</button>`
                ),
                {
                  click() {
                    completeProduction(spendCost);
                  },
                }
              )
            )
          )
    ),
  // The food stored towards the next size (#686).
  renderGrowth = (city: CityData): Node => {
    const perTurn = reduceKnownYield(city.yields, 'Food');

    return s(
      `<div class="growth"><header><span>${t(
        'City.Growth.title'
      )}</span><span class="size">${t('City.Growth.size', {
        size: localeProvider.number(city.growth.size),
      })}</span></header></div>`,
      progressBar({
        group: 'Food',
        stored: city.growth.progress.value,
        capacity: city.growth.cost.value,
        perTurn,
      }),
      renderFigures(
        'Food',
        city.growth,
        perTurn,
        turnsLeft(city.growth, city.yields, 'Food')
      )
    );
  },
  renderImprovements = (
    city: CityData,
    sellImprovement: (
      improvement: CityImprovement,
      saleValue: SpendCost
    ) => void,
    readOnly: boolean
  ): Node => {
    return s(
      `<div class="improvements"></div>`,
      s(
        `<div></div>`,
        ...city.improvements.map((improvement) => {
          const [saleValue] = readOnly
            ? []
            : (improvement.saleValue ?? []).filter(
                (saleValue) => saleValue.resource._ === 'Gold'
              );

          return s(
            '<div class="improvement"></div>',
            s(
              '<span class="name"></span>',
              s(`<span>${getLabelForBuildableEntity(improvement)}</span>`),
              ...city.yields
                .filter(
                  (
                    cityYield: Yield | CityImprovementMaintenanceGold
                  ): cityYield is CityImprovementMaintenanceGold =>
                    cityYield._ === 'CityImprovementMaintenanceGold' &&
                    (cityYield as CityImprovementMaintenanceGold)
                      .cityImprovement.id === improvement.id
                )
                .flatMap((cityYield) => yieldImages(cityYield, true))
            ),
            // Selling it (#31), from a button of its own (#684). The confirmation says what it fetches.
            saleValue
              ? h(
                  s(
                    `<button class="btn-danger sell">${t(
                      'City.SellImprovement.sell'
                    )}</button>`
                  ),
                  {
                    click() {
                      sellImprovement(improvement, saleValue);
                    },
                  }
                )
              : ''
          );
        })
      )
    );
  },
  renderGarrisonedUnits = (
    city: CityData,
    portal: Portal,
    transport: Transport,
    readOnly: boolean
  ): Node => {
    return h(
      s(
        `<div class="garrisoned-units"><header>${t(
          'City.GarrisonedUnits.title'
        )}</header></div>`,
        s(
          '<div class="units"></div>',
          ...city.tile.units.map((unit) => new Unit(unit).element())
        )
      ),
      {
        click() {
          const cityPlayerUnits = city.tile.units.filter(
            (unit: UnitData) => unit.player.id === city.player.id
          );

          if (readOnly || cityPlayerUnits.length === 0) {
            return;
          }

          // The unit chosen is made the active one, as it is from the map (#482).
          new UnitSelectionWindow(cityPlayerUnits, transport, (unit) =>
            portal.emit('activate-unit', unit)
          );
        },
      }
    );
  },
  renderSupportedUnits = (city: CityData): Node => {
    return s(
      `<div class="supported-units"><header>${t(
        'City.SupportedUnits.title'
      )}</header></div>`,
      s(
        '<div class="units"></div>',
        ...city.units.map((unit) => new SupportedUnit(city, unit))
      )
    );
  },
  cityDetails = (
    city: CityData,
    portal: Portal,
    transport: Transport,
    chooseProduction: () => void,
    completeProduction: (spendCost: SpendCost) => void,
    sellImprovement: (
      improvement: CityImprovement,
      saleValue: SpendCost
    ) => void,
    changeSpecialist: (specialist: Specialist) => void,
    readOnly: boolean,
    cityActions: Node | string = ''
  ) => {
    return s(
      '<div class="city-screen"></div>',
      s(
        '<div class="top-row"></div>',
        s(
          '<div class="yield-details"></div>',
          renderPopulation(
            city,
            undefined,
            readOnly ? undefined : changeSpecialist
          ),
          renderYields(city),
          renderSupportedUnits(city)
        ),
        renderMap(portal, city, transport, readOnly),
        renderImprovements(city, sellImprovement, readOnly)
      ),
      s(
        '<div class="bottom-row"></div>',
        renderGrowth(city),
        s(
          '<div class="tabbed-details"></div>',
          // TODO: add a tab bar
          s(
            '<div class="info"></div>',
            renderGarrisonedUnits(city, portal, transport, readOnly),
            renderTradeRoutes(city)
          )
        ),
        renderBuild(city, chooseProduction, completeProduction, readOnly, () =>
          toggleAuto(city.build, transport)
        )
      ),
      cityActions
    );
  },
  // The player's other cities, either side of this one (#678), and renaming it (#676). With one city there is nowhere
  //  to step to, and the buttons do nothing: the list is read when one is pressed, as a city can be gained or lost
  //  while the screen is open.
  renderCityActions = (step: (by: number) => void, rename: () => void): Node =>
    s(
      '<div class="city-actions"></div>',
      h(
        s(
          `<button class="btn-secondary previous">${t(
            'City.previous'
          )}</button>`
        ),
        {
          click: () => step(-1),
        }
      ),
      h(
        s(`<button class="btn-secondary rename">${t('City.rename')}</button>`),
        {
          click: () => rename(),
        }
      ),
      h(s(`<button class="btn-secondary next">${t('City.next')}</button>`), {
        click: () => step(1),
      })
    );

/** The classic city screen: a page over the map, the yields and improvements beside the map, the meters below. */
export const classicCityLayout: CityLayout = {
  render: (city, context) =>
    cityDetails(
      city,
      context.portal,
      context.transport,
      context.chooseProduction,
      context.completeProduction,
      context.sellImprovement,
      context.changeSpecialist,
      context.readOnly,
      context.readOnly ? '' : renderCityActions(context.step, context.rename)
    ),
  window: {
    canResize: true,
    canMaximise: true,
    classes: 'city-screen-window',
    size: 'maximised',
  },
};

export default classicCityLayout;
