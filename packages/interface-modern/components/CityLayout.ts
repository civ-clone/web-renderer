import {
  City as CityData,
  CityImprovement,
  CityImprovementMaintenanceGold,
  Unit as UnitData,
  Yield,
} from '@civ-clone/ui-protocol/types';
import {
  CityLayout,
  CityScreenContext,
  renderBuildProgress,
  renderTradeRoutes,
} from '@civ-clone/ui-windows/components/City';
import {
  editQueue,
  getAutoLabel,
  getLabelForBuildable,
  getLabelForBuildableEntity,
} from '@civ-clone/ui-client/components/lib/cityBuild';
import {
  growthTurns,
  renderFigures,
  renderPopulation,
  turnsText,
  yieldIcon,
} from '@civ-clone/ui-windows/components/lib/cityYields';
import {
  renderMap,
  renderYields,
} from '@civ-clone/ui-windows/components/lib/cityParts';
import { growthLimitText } from '@civ-clone/ui-client/components/lib/city';
import buildingIcon from '@civ-clone/ui-assets/components/lib/buildingIcon';
import SupportedUnit from '@civ-clone/ui-windows/components/SupportedUnit';
import Unit from '@civ-clone/ui-windows/components/Unit';
import button from '@civ-clone/ui-component-button/button';
import { glyph } from '@civ-clone/ui-assets/lib/glyphs';
import { turnsLeft } from '@civ-clone/ui-client/lib/cityTurns';
import { h } from '@civ-clone/ui-widgets/lib/html';
import instanceOf from '@civ-clone/ui-client/lib/instanceOf';
import { instance as localeProvider } from '@civ-clone/ui-client/LocaleProvider';
import { openUnitSelection } from '@civ-clone/ui-windows/components/choices';
import progressBar from '@civ-clone/ui-component-progress-bar/ProgressBar';
import { reduceKnownYield } from '@civ-clone/ui-client/lib/yieldMap';
import { s } from '@dom111/element';
import { t } from 'i18next';
import unitLabel from '@civ-clone/ui-windows/lib/unitLabel';

// The city screen under the new interface (#746): a window over the map, with a strip across the top for the city's
//  size, growth and citizens, three columns below it (what the city makes, its map, what it's building and has built)
//  and a strip along the bottom for its units, with the way to the other cities in the window's footer.

const section = (heading: string, ...content: (Node | string)[]): HTMLElement =>
  s(
    `<section class="ui-city-section"><h3>${heading}</h3></section>`,
    ...content
  );

// The gold an improvement costs each turn, from the engine's upkeep yields for it.
const upkeepOf = (city: CityData, improvementId: string): number =>
  city.yields
    .filter(
      (
        cityYield: Yield | CityImprovementMaintenanceGold
      ): cityYield is CityImprovementMaintenanceGold =>
        cityYield._ === 'CityImprovementMaintenanceGold' &&
        (cityYield as CityImprovementMaintenanceGold).cityImprovement.id ===
          improvementId
    )
    .reduce((total, cityYield) => total + Math.abs(cityYield.value), 0);

// An amount of gold with its icon, the words for a screen reader.
const gold = (amount: number, label: string): HTMLElement => {
  const element = s(
      '<span class="ui-city-gold"><span class="visually-hidden"></span></span>'
    ),
    words = element.firstElementChild!;

  // Set as text, not markup: a translation is words.
  element.setAttribute('title', label);
  words.textContent = label;

  element.append(
    yieldIcon('Gold'),
    s(`<span aria-hidden="true">${localeProvider.number(amount)}</span>`)
  );

  return element;
};

// The size, the food towards the next, the garrison, and the citizens, whose specialists change on a click (#107).
const renderHeader = (
  city: CityData,
  { readOnly, changeSpecialist }: CityScreenContext
): HTMLElement => {
  const perTurn = reduceKnownYield(city.yields, 'Food'),
    garrison = city.tile.units.filter(
      (unit) => unit.player.id === city.player.id
    ).length;

  return s(
    '<header class="ui-city-header"></header>',
    s(
      '<div class="ui-city-growth"></div>',
      s(
        `<p class="ui-city-size">${t('City.Growth.size', {
          size: localeProvider.number(city.growth.size),
        })}<span class="ui-city-garrison">${t('CityWindow.garrison', {
          count: garrison,
        })}</span></p>`
      ),
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
        growthTurns(city),
        // Starving says more than the cap: the per-turn figure shows it.
        perTurn < 0 ? null : growthLimitText(city.growth)
      )
    ),
    s(
      '<div class="ui-city-citizens"></div>',
      renderPopulation(city, undefined, readOnly ? undefined : changeSpecialist)
    )
  );
};

const isWonder = (improvement: CityImprovement): boolean =>
  instanceOf(improvement, 'Wonder');

// A list of improvements, each with its upkeep, and Sell where it can be sold (#31, #684).
const renderImprovementList = (
  city: CityData,
  improvements: CityImprovement[],
  { readOnly, sellImprovement }: CityScreenContext
): HTMLElement =>
  s(
    '<ul class="ui-city-improvements"></ul>',
    ...improvements.map((improvement) => {
      const [saleValue] = readOnly
          ? []
          : (improvement.saleValue ?? []).filter(
              (saleValue) => saleValue.resource._ === 'Gold'
            ),
        upkeep = upkeepOf(city, improvement.id);

      return s(
        '<li class="ui-city-improvement"></li>',
        buildingIcon(improvement._, isWonder(improvement)),
        s(
          `<span class="name">${getLabelForBuildableEntity(improvement)}</span>`
        ),
        upkeep > 0
          ? gold(upkeep, t('CityWindow.upkeep', { count: upkeep }))
          : '',
        saleValue
          ? h(
              button(t('City.SellImprovement.sell'), {
                variant: 'danger',
                className: 'sell',
              }),
              {
                click: () => sellImprovement(improvement, saleValue),
              }
            )
          : ''
      );
    })
  );

// The upkeep a list of improvements comes to, where it comes to any.
const renderUpkeepTotal = (
  city: CityData,
  improvements: CityImprovement[]
): HTMLElement | '' => {
  const total = improvements.reduce(
    (sum, improvement) => sum + upkeepOf(city, improvement.id),
    0
  );

  return total > 0
    ? s(
        `<p class="ui-city-upkeep-total"><span>${t(
          'CityWindow.upkeep-total'
        )}</span></p>`,
        gold(total, t('CityWindow.upkeep', { count: total }))
      )
    : '';
};

// The city's improvements, then the upkeep they come to. Its Wonders are among them, as the engine sends them, and
//  have their own section below (#746).
const renderImprovements = (
  city: CityData,
  context: CityScreenContext
): HTMLElement => {
  const improvements = city.improvements.filter(
    (improvement) => !isWonder(improvement)
  );

  if (improvements.length === 0) {
    return section(
      t('CityWindow.improvements'),
      s(`<p class="ui-city-empty">${t('CityWindow.no-improvements')}</p>`)
    );
  }

  return section(
    t('CityWindow.improvements'),
    renderImprovementList(city, improvements, context),
    renderUpkeepTotal(city, improvements)
  );
};

// The city's Wonders, where it has any (#746), and their upkeep under rules that charge any.
const renderWonders = (
  city: CityData,
  context: CityScreenContext
): HTMLElement | '' => {
  const wonders = city.improvements.filter(isWonder);

  return wonders.length === 0
    ? ''
    : section(
        t('CityWindow.wonders'),
        renderImprovementList(city, wonders, context),
        renderUpkeepTotal(city, wonders)
      );
};

// A span of text, set as text: an item's name may have an apostrophe in it.
const textSpan = (className: string, text: string): HTMLElement => {
  const span = s(`<span class="${className}"></span>`);

  span.textContent = text;

  return span;
};

// What the city builds after its current item (#774), each with the turns it takes at the city's production now, from
//  nothing, as it starts once the one before it is done. Its own can be moved up or down, or removed.
const renderQueue = (
  city: CityData,
  { readOnly, transport }: CityScreenContext
): HTMLElement | '' => {
  const queue = city.build.queue ?? [],
    // The queue as the player sees it, sent with each edit, so a second click sent before the update changes nothing.
    queued = queue.map((buildItem) => buildItem.item._),
    iconButton = (
      name: 'chevron-up' | 'chevron-down' | 'close',
      label: string,
      edit: Parameters<typeof editQueue>[2]
    ): HTMLButtonElement => {
      const element = button(glyph(name), { variant: 'icon' });

      element.setAttribute('aria-label', label);
      element.title = label;

      return h(element, {
        click: () => editQueue(city.build, transport, edit),
      });
    };

  if (queue.length === 0) {
    return '';
  }

  return s(
    `<ol class="ui-city-queue" aria-label="${t('CityWindow.queue')}"></ol>`,
    ...queue.map((buildItem, index) => {
      const item = getLabelForBuildable(buildItem),
        turns = turnsLeft(
          {
            ...city.build,
            cost: buildItem.cost,
            progress: { ...city.build.progress, value: 0 },
          },
          city.yields,
          'Production'
        );

      return s(
        '<li class="ui-city-queued"></li>',
        instanceOf(buildItem.item, 'CityImprovement') ||
          instanceOf(buildItem.item, 'Wonder')
          ? buildingIcon(buildItem.item._, instanceOf(buildItem.item, 'Wonder'))
          : '',
        textSpan('name', t('CityWindow.then', { item })),
        s(`<span class="turns">${turnsText(turns)}</span>`),
        ...(readOnly
          ? []
          : [
              index > 0
                ? iconButton('chevron-up', t('CityWindow.queue-up', { item }), {
                    op: 'move',
                    index,
                    to: index - 1,
                    queued,
                  })
                : '',
              index < queue.length - 1
                ? iconButton(
                    'chevron-down',
                    t('CityWindow.queue-down', { item }),
                    { op: 'move', index, to: index + 1, queued }
                  )
                : '',
              iconButton('close', t('CityWindow.queue-remove', { item }), {
                op: 'remove',
                index,
                queued,
              }),
            ])
      );
    })
  );
};

// What the city is building: its picture, name, progress and figures, and the buttons for it (#687).
const renderProduction = (
  city: CityData,
  context: CityScreenContext
): HTMLElement => {
  const { readOnly, chooseProduction, completeProduction, toggleAuto } =
    context;

  const building = city.build.building,
    name = building
      ? (t('City.Build.title', {
          item: getLabelForBuildable(building),
        }) as string)
      : t('CityWindow.nothing');

  return s(
    `<section class="ui-city-production${
      building ? '' : ' nothing'
    }"></section>`,
    s(
      '<header></header>',
      building && instanceOf(building.item, 'Unit')
        ? new Unit({
            ...building.item,
            player: city.player,
            improvements: [],
            busy: null,
          }).element()
        : building &&
          (instanceOf(building.item, 'CityImprovement') ||
            instanceOf(building.item, 'Wonder'))
        ? buildingIcon(building.item._, instanceOf(building.item, 'Wonder'))
        : '',
      s(`<h3>${name}</h3>`),
      // A city on Auto chooses its own improvements (#194).
      city.build.auto
        ? s(`<span class="auto-marker">${t('City.Build.auto-marker')}</span>`)
        : ''
    ),
    ...renderBuildProgress(city),
    renderQueue(city, context),
    readOnly
      ? ''
      : s(
          '<div class="ui-city-production-actions"></div>',
          h(
            button(t(building ? 'City.Build.change' : 'City.Build.choose'), {
              variant: building ? 'secondary' : 'primary',
              hotkey: 'c',
            }),
            { click: () => chooseProduction() }
          ),
          // The price on the button, as the Buy confirmation says it (#713).
          ...city.build.spendCost.map((spendCost) =>
            h(
              button(
                t('CityWindow.buy', {
                  cost: spendCost.value,
                  resource: t(`${spendCost.resource._}.name`, {
                    defaultValue: spendCost.resource._,
                    ns: 'yield',
                  }),
                }),
                { className: 'buy', hotkey: 'b' }
              ),
              { click: () => completeProduction(spendCost) }
            )
          ),
          h(
            button(getAutoLabel(city.build), {
              variant: 'quiet',
              className: 'auto',
              hotkey: 'a',
            }),
            { click: () => toggleAuto() }
          )
        )
  );
};

// A unit's picture, named in its tooltip. One of the player's own units in the city is a button that makes it the
//  active unit, woken if it's fortified or sentried (#482).
const portrait = (
  content: Node,
  unit: UnitData,
  activate: ((unit: UnitData) => void) | null
): HTMLElement => {
  const label = unitLabel(unit),
    element =
      activate === null
        ? s('<span class="ui-city-unit"></span>', content)
        : h(
            s(
              '<button type="button" class="ui-city-unit btn-bare"></button>',
              content
            ),
            { click: () => activate(unit) }
          );

  element.setAttribute('title', label);
  element.setAttribute('aria-label', label);

  return element;
};

// The units in the city and those it supports.
const renderUnits = (
  city: CityData,
  { portal, transport, readOnly }: CityScreenContext
): HTMLElement => {
  const activate = (unit: UnitData) =>
    openUnitSelection([unit], transport, (chosen) =>
      portal.emit('activate-unit', chosen)
    );

  return s(
    '<div class="ui-city-units-strip"></div>',
    section(
      t('CityWindow.in-city', { count: city.tile.units.length }),
      s(
        '<div class="ui-city-units"></div>',
        ...city.tile.units.map((unit) =>
          portrait(
            new Unit(unit).element(),
            unit,
            readOnly || unit.player.id !== city.player.id ? null : activate
          )
        )
      )
    ),
    section(
      t('CityWindow.supported', { count: city.units.length }),
      s(
        '<div class="ui-city-units"></div>',
        ...city.units.map((unit) =>
          portrait(new SupportedUnit(city, unit).element(), unit, null)
        )
      )
    )
  );
};

// The other cities and renaming this one (#676, #678), as the window's own buttons: the chrome puts them in its footer.
const renderCityButtons = ({ step, rename }: CityScreenContext): HTMLElement =>
  s(
    '<footer></footer>',
    h(
      button(t('City.previous'), {
        className: 'previous',
        hotkey: 'ArrowLeft',
      }),
      {
        click: () => step(-1),
      }
    ),
    h(button(t('City.rename'), { className: 'rename' }), {
      click: () => rename(),
    }),
    h(button(t('City.next'), { className: 'next', hotkey: 'ArrowRight' }), {
      click: () => step(1),
    })
  );

// The city's map at twice the size it's drawn at (its canvas is drawn at the map's scale).
const renderDoubledMap = (
  city: CityData,
  { portal, transport, readOnly }: CityScreenContext
): Node => {
  const map = renderMap(portal, city, transport, readOnly),
    canvas = (map as HTMLElement).querySelector('canvas');

  if (canvas !== null) {
    canvas.style.width = `${(canvas.width / portal.scale()) * 2}px`;
  }

  return map;
};

/** The new city screen (#746), for `City`'s `layout`. */
export const cityLayout: CityLayout = {
  render: (city, context) =>
    s(
      '<div class="ui-city"></div>',
      renderHeader(city, context),
      s(
        '<div class="ui-city-columns"></div>',
        s(
          '<div class="ui-city-left"></div>',
          section(
            t('CityWindow.yields'),
            renderYields(city, { labelled: true })
          ),
          renderTradeRoutes(city)
        ),
        s(
          '<div class="ui-city-centre"></div>',
          renderDoubledMap(city, context)
        ),
        s(
          '<div class="ui-city-right"></div>',
          renderProduction(city, context),
          renderImprovements(city, context),
          renderWonders(city, context)
        )
      ),
      renderUnits(city, context),
      context.readOnly ? '' : renderCityButtons(context)
    ),
  window: {
    canMaximise: true,
    classes: ['ui-city-window'],
    size: { width: '90vw', height: '90vh' },
  },
};

export default cityLayout;
