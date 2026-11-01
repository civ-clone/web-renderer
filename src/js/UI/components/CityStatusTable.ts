import { City as CityData, CitizenMood, Player } from '../types';
import ReportTable, { ReportColumn } from './lib/ReportTable';
import {
  buildTurns,
  citizenFace,
  growthTurns,
  turnsText,
  yieldData,
  yieldIcon,
} from './lib/cityYields';
import FilterableWindow from './FilterableWindow';
import Portal from './Portal';
import { cityName } from './lib/city';
import { citizenMoods } from '../lib/citizens';
import { getLabelForBuildable } from './lib/cityBuild';
import { glyph } from '../lib/glyphs';
import { instance as localeProvider } from '../LocaleProvider';
import { progressBar } from './lib/ProgressBar';
import { reduceKnownYield } from '../lib/yieldMap';
import { s } from '@dom111/element';
import { t } from 'i18next';
import watchPlayer, { cityRowIds } from './lib/watchPlayer';

// A figure, its bar and the turns left, in one cell. With no turns, as when nothing is being built, neither the bar nor
//  the turns.
const meter = (
  figure: string,
  bar: HTMLElement,
  turns: number | null
): HTMLElement =>
  s(
    '<span class="ui-report-meter"></span>',
    s('<span class="ui-report-meter-figure"></span>', figure),
    ...(turns === null
      ? []
      : [
          bar,
          s('<span class="ui-report-meter-turns"></span>', turnsText(turns)),
        ])
  );

const net = (city: CityData, group: string): number =>
  yieldData(city, group)[2];

// Never comes after any number of turns.
const turnsOrder = (turns: number): number => (turns === 0 ? Infinity : turns);

const moodCount = (city: CityData, mood: CitizenMood): number =>
  citizenMoods(city).filter((cityMood) => cityMood === mood).length;

const moodColumn = (mood: CitizenMood): ReportColumn<CityData> => ({
  key: mood,
  heading: t(`ReportTable.CityStatus.${mood}`),
  icon: () => citizenFace(mood),
  kind: 'number',
  cell: (city) => moodCount(city, mood),
  sortValue: (city) => moodCount(city, mood),
  tone: (city) =>
    mood === 'unhappy' && city.civilDisorder ? 'negative' : null,
});

export const cityStatusColumns = (): ReportColumn<CityData>[] => [
  {
    key: 'city',
    heading: t('ReportTable.city'),
    header: true,
    cell: (city) =>
      city.civilDisorder
        ? s(
            `<span class="ui-report-flagged">${glyph('flag')}</span>`,
            s(
              '<span class="visually-hidden"></span>',
              `${t('ReportTable.CityStatus.disorder')}: `
            ),
            cityName(city)
          )
        : cityName(city),
    sortValue: (city) => cityName(city),
    tone: (city) => (city.civilDisorder ? 'negative' : null),
  },
  {
    key: 'size',
    heading: t('ReportTable.CityStatus.size'),
    kind: 'meter',
    cell: (city) =>
      meter(
        localeProvider.number(city.growth.size),
        progressBar({
          group: 'Food',
          stored: city.growth.progress.value,
          capacity: city.growth.cost.value,
          perTurn: net(city, 'Food'),
          label: t('ReportTable.CityStatus.food-stored', {
            progress: city.growth.progress.value,
            total: city.growth.cost.value,
          }),
        }),
        growthTurns(city)
      ),
    sortValue: (city) => city.growth.size,
  },
  {
    key: 'build',
    heading: t('ReportTable.CityStatus.build'),
    kind: 'meter',
    cell: (city) =>
      meter(
        getLabelForBuildable(city.build.building),
        progressBar({
          group: 'Production',
          stored: city.build.progress.value,
          capacity: city.build.building ? city.build.cost.value : 0,
          perTurn: net(city, 'Production'),
          label: t('ReportTable.CityStatus.shields-stored', {
            progress: city.build.progress.value,
            total: city.build.cost.value,
          }),
        }),
        city.build.building ? buildTurns(city) : null
      ),
    sortValue: (city) =>
      city.build.building ? turnsOrder(buildTurns(city)) : Infinity,
    sortFirst: 'ascending',
  },
  ...(
    [
      ['food', 'Food', 'warn'],
      ['shields', 'Production', 'negative'],
    ] as const
  ).map(
    ([key, group, tone]): ReportColumn<CityData> => ({
      key,
      heading: t(`ReportTable.CityStatus.${key}`),
      icon: () => yieldIcon(group),
      kind: 'number',
      cell: (city) => net(city, group),
      sortValue: (city) => net(city, group),
      // Starving, or not making enough to support its units.
      tone: (city) => (net(city, group) < 0 ? tone : null),
    })
  ),
  {
    key: 'trade',
    heading: t('ReportTable.CityStatus.trade'),
    icon: () => yieldIcon('Trade'),
    kind: 'number',
    cell: (city) => yieldData(city, 'Trade')[0],
    sortValue: (city) => yieldData(city, 'Trade')[0],
  },
  {
    key: 'corruption',
    heading: t('ReportTable.CityStatus.corruption'),
    kind: 'number',
    cell: (city) => Math.abs(reduceKnownYield(city.yields, 'Corruption')),
    sortValue: (city) => Math.abs(reduceKnownYield(city.yields, 'Corruption')),
  },
  ...(['happy', 'content', 'unhappy'] as CitizenMood[]).map(moodColumn),
];

/**
 * City Status (F1) under the new interface (#744): a row for each city, with its size and growth, what it's building,
 *  its food, shields, trade and corruption, and its happy, content and unhappy citizens, sortable by any of them.
 */
export class CityStatusTable extends FilterableWindow {
  #cities: CityData[];
  #table: ReportTable<CityData>;
  #unwatch: () => void;

  constructor(player: Player, portal: Portal) {
    // `city-status` for the window's eyebrow and size, as the classic report has.
    super(t('CityStatus.title'), s('<div></div>'), {
      classes: ['city-status', 'ui-report'],
      rowSelector: 'tbody tr',
    });

    this.#cities = player.cities;
    this.#table = new ReportTable({
      columns: cityStatusColumns(),
      label: t('CityStatus.title'),
      rowKey: (city) => city.id,
      open: (city) => portal.openCity(city),
    });

    this.#unwatch = watchPlayer(player, cityRowIds, (player) => {
      this.#cities = player.cities;

      this.update();
    });

    // Put in once: redrawing only its rows keeps the focus and the sort.
    super.update(this.#table.element());

    this.update();
  }

  close() {
    this.#unwatch();

    return super.close();
  }

  table(): ReportTable<CityData> {
    return this.#table;
  }

  update() {
    this.#table.update(this.#cities);

    // The rows keep their elements, so their text is read again.
    this.reread();
  }
}

export default CityStatusTable;
