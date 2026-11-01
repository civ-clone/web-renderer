import {
  City as CityData,
  CitizenMood,
  CityImprovementContent,
  MartialLaw,
  MilitaryUnhappiness,
  Player,
} from '../types';
import { citizenFace, renderPopulation } from './lib/cityYields';
import { groupIcons, reduceKnownYield } from '../lib/yieldMap';
import Element from '@dom111/element';
import FilterableWindow from './FilterableWindow';
import Portal from './Portal';
import ReportTable from './lib/ReportTable';
import SupportedUnit from './SupportedUnit';
import Unit from './Unit';
import { assetStore } from '../AssetStore';
import { citizenMoods } from '../lib/citizens';
import { cityName, viewCityText } from './lib/city';
import currentTileset from '../lib/tilesets';
import { getLabelForBuildableEntity } from './lib/cityBuild';
import { glyph } from '../lib/glyphs';
import { instance as localeProvider } from '../LocaleProvider';
import { s } from '@dom111/element';
import { spriteKey } from '../tilesets/TilesetDescriptor';
import { t } from 'i18next';
import watchPlayer, { cityIds } from './lib/watchPlayer';

const moodCount = (city: CityData, mood: CitizenMood): number =>
  citizenMoods(city).filter((cityMood) => cityMood === mood).length;

// What made each change to a city's citizens, as the classic report draws it: the improvement, the unit keeping order
//  or causing unrest, or the luxuries.
const reasonLabel = (
  city: CityData,
  cityYield: { _: string }
): string | HTMLElement | Element => {
  switch (cityYield._) {
    case 'CityImprovementContent':
      return getLabelForBuildableEntity(
        (cityYield as CityImprovementContent).cityImprovement
      );
    case 'MartialLaw':
      return new Unit((cityYield as MartialLaw).unit);
    case 'MilitaryUnhappiness':
      return new SupportedUnit(city, (cityYield as MilitaryUnhappiness).unit, [
        'MilitaryUnhappiness',
      ]);
    case 'LuxuryHappiness': {
      const luxuries = s('<span></span>');

      assetStore
        .shownAtURL(
          spriteKey(currentTileset(), groupIcons.Luxuries),
          currentTileset().ui.icon
        )
        .then((url) =>
          luxuries.append(
            s(`<img src="${url}" alt="">`),
            localeProvider.number(reduceKnownYield(city.yields, 'Luxuries'))
          )
        );

      return luxuries;
    }
    default:
      return cityYield._;
  }
};

/** Why a city's citizens are as they are, step by step, under the table for the city chosen in it. */
export const renderHappinessDetails = (city: CityData): HTMLElement => {
  const causes = city.citizens?.causes ?? [];

  return s(
    '<section class="ui-report-details"></section>',
    s('<h3 class="ui-report-details-title"></h3>', cityName(city)),
    ...(causes.length === 0
      ? [s('<p></p>', t('ReportTable.Happiness.no-causes'))]
      : causes.map((cause) =>
          s(
            '<div class="ui-report-cause"></div>',
            renderPopulation(city, cause.moods),
            s(
              '<div class="ui-report-detail"></div>',
              reasonLabel(city, cause.yield)
            )
          )
        ))
  );
};

/**
 * The Happiness report (F4) under the new interface (#744): each city's citizens as Civ1 draws them, with the happy,
 *  content and unhappy counted beside them to sort by, and a View button. Choosing a city shows why its citizens are
 *  as they are, under the table.
 */
export class HappinessTable extends FilterableWindow {
  #cities: CityData[];
  #chosen: string | null = null;
  #shown: string | null = null;
  #details: HTMLElement = s(
    '<div class="ui-report-details-area" aria-live="polite"></div>'
  );
  #table: ReportTable<CityData>;
  #unwatch: () => void;

  constructor(player: Player, portal: Portal) {
    // `happiness-report` for the window's eyebrow, as the classic report has.
    super(t('HappinessReport.title'), s('<div></div>'), {
      classes: ['happiness-report', 'ui-report'],
      rowSelector: 'tbody tr',
    });

    this.#cities = player.cities;
    this.#table = new ReportTable<CityData>({
      columns: [
        {
          key: 'city',
          heading: t('ReportTable.city'),
          header: true,
          cell: (city) =>
            s(
              '<span class="ui-report-nation"></span>',
              ...(city.civilDisorder
                ? [
                    s(
                      `<span class="ui-report-flagged">${glyph('flag')}</span>`
                    ),
                    s(
                      '<span class="visually-hidden"></span>',
                      `${t('ReportTable.CityStatus.disorder')}: `
                    ),
                  ]
                : city.celebrateLeader
                ? [
                    s(
                      '<span class="visually-hidden"></span>',
                      `${t('ReportTable.Happiness.celebrating')}: `
                    ),
                  ]
                : []),
              cityName(city)
            ),
          sortValue: (city) => cityName(city),
          tone: (city) =>
            city.civilDisorder
              ? 'negative'
              : city.celebrateLeader
              ? 'positive'
              : null,
        },
        {
          key: 'citizens',
          heading: t('ReportTable.Happiness.citizens'),
          cell: (city) => renderPopulation(city),
        },
        ...(['happy', 'content', 'unhappy'] as CitizenMood[]).map((mood) => ({
          key: mood,
          heading: t(`ReportTable.CityStatus.${mood}`),
          icon: () => citizenFace(mood),
          kind: 'number' as const,
          cell: (city: CityData) => moodCount(city, mood),
          sortValue: (city: CityData) => moodCount(city, mood),
        })),
        {
          key: 'view',
          heading: t('ReportTable.Happiness.view'),
          action: {
            label: t('ReportTable.Happiness.view'),
            name: viewCityText,
            run: (city) => portal.openCity(city),
          },
        },
      ],
      label: t('HappinessReport.title'),
      rowKey: (city) => city.id,
      open: (city) => {
        this.#chosen = city.id;
        this.#showDetails();
      },
    });

    this.#unwatch = watchPlayer(player, cityIds, (player) => {
      this.#cities = player.cities;

      this.update();
    });

    super.update(s('<div></div>', this.#table.element(), this.#details));

    this.update();
  }

  close() {
    this.#unwatch();

    return super.close();
  }

  table(): ReportTable<CityData> {
    return this.#table;
  }

  // The chosen city's reasons, as it is now, or nothing once it's gone. Only replaced when they've changed: the panel
  //  is a live region, so each replacement is read out again.
  #showDetails(): void {
    const city = this.#cities.find(({ id }) => id === this.#chosen),
      details = city ? renderHappinessDetails(city) : null;

    if (
      details !== null &&
      details.textContent === this.#details.textContent &&
      city!.id === this.#shown
    ) {
      return;
    }

    this.#shown = city?.id ?? null;
    this.#details.replaceChildren(...(details ? [details] : []));
  }

  update() {
    this.#table.update(this.#cities);
    this.#showDetails();

    // The rows keep their elements, so their text is read again.
    this.reread();
  }
}

export default HappinessTable;
