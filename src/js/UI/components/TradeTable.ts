import {
  City as CityData,
  CityImprovementMaintenanceGold,
  Player,
} from '../types';
import ReportTable, { ReportCell } from './lib/ReportTable';
import FilterableWindow from './FilterableWindow';
import Portal from './Portal';
import { cityName } from './lib/city';
import { getLabelForBuildableEntity } from './lib/cityBuild';
import isAnarchy from './lib/government';
import { s } from '@dom111/element';
import { t } from 'i18next';
import watchPlayer, { cityRowIds } from './lib/watchPlayer';
import { yieldData } from './lib/cityYields';

export interface MaintenanceRow {
  key: string;
  name: string;
  count: number;
  cost: number;
}

// What each kind of improvement costs to keep, across the cities: how many, and the gold each.
export const maintenance = (cities: CityData[]): MaintenanceRow[] =>
  Object.values(
    cities.reduce((rows, city) => {
      city.yields
        .filter(
          (cityYield): cityYield is CityImprovementMaintenanceGold =>
            cityYield._ === 'CityImprovementMaintenanceGold'
        )
        .forEach(({ cityImprovement, value }) => {
          rows[cityImprovement._] ??= {
            key: cityImprovement._,
            // Its name, not its class name (#472).
            name: getLabelForBuildableEntity(cityImprovement),
            count: 0,
            cost: Math.abs(value),
          };

          rows[cityImprovement._].count++;
        });

      return rows;
    }, {} as { [key: string]: MaintenanceRow })
  );

// A city's gold before upkeep, the upkeep, and what's left.
const gold = (city: CityData): [number, number, number] => {
  const [income, used, left] = yieldData(city, 'Gold');

  return [income, -used, left];
};

const sum = (rows: number[]): number =>
  rows.reduce((total, value) => total + value, 0);

const figureHeading = (key: string) => ({
  heading: t(`ReportTable.Trade.${key}`),
  kind: 'number' as const,
});

/**
 * The Trade report (F5) under the new interface (#744): each city's gold, its upkeep and what's left, with the totals
 *  in a footer, and beside it what each kind of improvement costs to keep.
 */
export class TradeTable extends FilterableWindow {
  #anarchy: HTMLElement = s(
    `<p class="ui-report-note" hidden>${t('TradeReport.anarchy')}</p>`
  );
  #cities: CityData[];
  #improvements: ReportTable<MaintenanceRow>;
  #player: Player;
  #table: ReportTable<CityData>;
  #unwatch: () => void;

  constructor(player: Player, portal: Portal) {
    // `trade-report` for the window's eyebrow and size, as the classic report has.
    super(t('TradeReport.title'), s('<div></div>'), {
      classes: ['trade-report', 'ui-report'],
      // The cities only: a city's name finds its row, and leaves the upkeep as it is.
      rowSelector: '.ui-report-cities tbody tr',
    });

    this.#cities = player.cities;
    this.#player = player;

    this.#table = new ReportTable<CityData>({
      caption: t('ReportTable.Trade.cities'),
      className: 'ui-report-cities',
      columns: [
        {
          key: 'city',
          heading: t('ReportTable.city'),
          header: true,
          cell: (city) => cityName(city),
          sortValue: (city) => cityName(city),
        },
        ...(['income', 'upkeep', 'left'] as const).map((key, index) => ({
          key,
          ...figureHeading(key),
          cell: (city: CityData): ReportCell => gold(city)[index],
          sortValue: (city: CityData) => gold(city)[index],
          tone: (city: CityData) =>
            key === 'left' && gold(city)[index] < 0
              ? ('negative' as const)
              : null,
        })),
      ],
      rowKey: (city) => city.id,
      open: (city) => portal.openCity(city),
      totals: (cities) =>
        Object.fromEntries(
          (['income', 'upkeep', 'left'] as const).map((key, index) => [
            key,
            sum(cities.map((city) => gold(city)[index])),
          ])
        ),
    });

    this.#improvements = new ReportTable<MaintenanceRow>({
      caption: t('ReportTable.Trade.improvements'),
      columns: [
        {
          key: 'improvement',
          heading: t('ReportTable.Trade.improvement'),
          header: true,
          cell: ({ name }) => name,
          sortValue: ({ name }) => name,
        },
        {
          key: 'count',
          ...figureHeading('count'),
          cell: ({ count }) => count,
          sortValue: ({ count }) => count,
        },
        {
          key: 'cost',
          ...figureHeading('cost'),
          cell: ({ cost }) => cost,
          sortValue: ({ cost }) => cost,
        },
        {
          key: 'total',
          ...figureHeading('total'),
          cell: ({ count, cost }) => count * cost,
          sortValue: ({ count, cost }) => count * cost,
        },
      ],
      rowKey: ({ key }) => key,
      totals: (rows) => ({
        count: sum(rows.map(({ count }) => count)),
        total: sum(rows.map(({ count, cost }) => count * cost)),
      }),
    });

    this.#unwatch = watchPlayer(player, cityRowIds, (player) => {
      this.#cities = player.cities;
      this.#player = player;

      this.update();
    });

    // Put in once: redrawing only their rows keeps the focus and the sort.
    super.update(
      s(
        '<div class="ui-report-trade"></div>',
        this.#anarchy,
        this.#table.element(),
        this.#improvements.element()
      )
    );

    this.update();
  }

  close() {
    this.#unwatch();

    return super.close();
  }

  table(): ReportTable<CityData> {
    return this.#table;
  }

  improvements(): ReportTable<MaintenanceRow> {
    return this.#improvements;
  }

  update() {
    this.#anarchy.hidden = !isAnarchy(this.#player);
    this.#table.update(this.#cities);
    this.#improvements.update(maintenance(this.#cities));

    this.refilter();
  }
}

export default TradeTable;
