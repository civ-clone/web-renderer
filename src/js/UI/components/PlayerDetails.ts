import { City, Player, PlayerGovernment, PlayerTradeRates } from '../types';
import { Element, s } from '@dom111/element';
import Transport from '../Transport';
import { confirmRevolution } from './Actions/Revolution';
import isAnarchy from './lib/government';
import { openTradeRates, tradeRatesKey } from './Actions/AdjustTradeRates';
import { reduceKnownYields } from '../lib/yieldMap';
import { researchingName } from './lib/advances';
import { TOptions, t } from 'i18next';
import { turnsLeft, turnsText, yieldData, yieldIcon } from './lib/cityYields';
import progressBar from './lib/ProgressBar';
import statPill, { StatPillTone } from './lib/StatPill';
import tooltip from './lib/Tooltip';

// Every string here is set as text, not markup, so i18next's HTML escaping would show a name with `&` or `'` in it as
//  `&amp;` or `&#39;` (#704).
const text = (key: string, options: TOptions = {}): string =>
  t(key, { ...options, interpolation: { escapeValue: false } });

// Each trade rate's colour in the tax bar (`--panel-*` tokens), in Civ1's order, whatever order they arrive in.
const rateClasses: { [key: string]: string } = {
    Tax: 'tax',
    Luxuries: 'luxury',
    Research: 'science',
  },
  rateOrder = Object.keys(rateClasses),
  ratePosition = (rate: string): number =>
    rateOrder.includes(rate) ? rateOrder.indexOf(rate) : rateOrder.length;

// An item that opens a report when clicked, when there is one to open (#698), or a plain item: a stat pill (#742).
const reportStat = (
  className: string,
  title: string,
  report: Report | undefined,
  value: string,
  detail: string,
  tone: StatPillTone,
  ...before: Node[]
): HTMLElement =>
  statPill({
    className,
    label: report
      ? text('PlayerDetails.opens', {
          title,
          opens: report.title,
          key: report.key,
        })
      : title,
    value,
    detail,
    tone,
    before,
    onClick: report?.open ?? null,
  });

// A report an item opens: its title and key for the tooltip, and how to open it.
export type Report = {
  key: string;
  open: () => void;
  title: string;
};

export type PlayerDetailsReports = {
  science?: Report;
  trade?: Report;
};

/**
 * The empire block in the top bar (#698): the leader, the treasury and what it gains a turn, the research under way and
 *  how far along it is, the government, and the tax split, which opens the trade rates as `+` and `-` do (#662).
 */
export class PlayerDetails extends Element {
  #player: Player;
  #reports: PlayerDetailsReports;
  #transport: Transport | null;

  constructor(
    element: HTMLElement,
    player: Player,
    transport: Transport | null = null,
    // The research opens the Science report, and the treasury the Trade report, as F6 and F5 do.
    reports: PlayerDetailsReports = {}
  ) {
    super(element);

    this.#player = player;
    this.#reports = reports;
    this.#transport = transport;
  }

  build(): void {
    this.empty();

    const { actions, civilization, government, treasuries, research, cities } =
        this.#player,
      [goldTreasury] = treasuries.filter(
        (treasury) => treasury.yield._ === 'Gold'
      );

    const [totalGold, totalResearch] = cities.reduce(
        ([totalGold, totalResearch], city: City): [number, number] => {
          // TODO: There must be a way to specify that the return array has the same number of elements as the arguments...
          const [cityGold, cityResearch] = reduceKnownYields(
            city.yields,
            'Gold',
            'Research'
          );

          return [totalGold + cityGold, totalResearch + cityResearch];
        },
        [0, 0]
      ),
      anarchy = isAnarchy(this.#player),
      // As the Science report counts it: done this turn when progress already covers the cost (#704).
      researchTurns = turnsLeft(
        research,
        cities.flatMap((city) => city.yields),
        'Research'
      ),
      researchContext = `${research.researching ? '' : 'not'}researching${
        anarchy ? '-anarchy' : ''
      }`,
      heading = s('<h3 class="nation"></h3>');

    heading.textContent = text('PlayerDetails.header', {
      leader: t(`Leader.${civilization.leader._}.name`, {
        defaultValue: civilization.leader._,
        ns: 'civilization',
      }),
      nation: t(`${civilization._}.plural`, {
        defaultValue: civilization._,
        ns: 'civilization',
      }),
    });

    const gold = reportStat(
      'gold',
      text('PlayerDetails.Treasury.title'),
      this.#reports.trade,
      text('PlayerDetails.Treasury.value', { value: goldTreasury.value }),
      text('PlayerDetails.Treasury.detail', {
        perTurn: totalGold,
        context: anarchy ? 'anarchy' : undefined,
      }),
      anarchy
        ? null
        : totalGold < 0
        ? 'negative'
        : totalGold > 0
        ? 'positive'
        : null,
      yieldIcon('Gold')
    );

    // What the cities bring in, what their improvements cost, and what's left, as the Trade report counts them (#742).
    tooltip(
      gold,
      () => {
        const [income, upkeep, net] = cities.reduce(
          ([income, upkeep, net], city) => {
            const [cityIncome, cityUpkeep, cityNet] = yieldData(city, 'Gold');

            return [income + cityIncome, upkeep + cityUpkeep, net + cityNet];
          },
          [0, 0, 0]
        );

        return {
          title: text('PlayerDetails.Treasury.title'),
          rows: [
            [
              text('PlayerDetails.Treasury.Breakdown.treasury'),
              text('PlayerDetails.Treasury.value', {
                value: goldTreasury.value,
              }),
            ],
            [
              text('PlayerDetails.Treasury.Breakdown.income'),
              text('Progress.per-turn', { count: income }),
            ],
            [
              text('PlayerDetails.Treasury.Breakdown.upkeep'),
              text('Progress.per-turn', { count: Math.abs(upkeep) }),
            ],
          ],
          total: [
            text('PlayerDetails.Treasury.Breakdown.net'),
            text('City.Progress.per-turn', { count: net }),
          ],
        };
      },
      { key: 'treasury' }
    );

    const researching = reportStat(
      'research',
      text('PlayerDetails.Researching.title'),
      this.#reports.science,
      text('PlayerDetails.Researching.value', {
        researching: researchingName(research),
        context: research.researching ? 'researching' : 'notresearching',
      }),
      text('PlayerDetails.Researching.detail', {
        turns: researchTurns,
        context: researchContext,
      }),
      null,
      yieldIcon('Research')
    );

    if (research.researching) {
      // Named inside the item, so it's part of a button's name; next turn's research is the striped part (#742).
      researching.querySelector('.detail')!.before(
        progressBar({
          group: 'Research',
          stored: research.progress.value,
          capacity: Math.max(research.cost.value, 1),
          perTurn: totalResearch,
          label: text('PlayerDetails.Researching.progress', {
            progress: research.progress.value,
            cost: research.cost.value,
            perTurn: totalResearch,
          }),
        })
      );

      tooltip(
        researching,
        () => ({
          title: text('PlayerDetails.Researching.value', {
            researching: researchingName(research),
            context: 'researching',
          }),
          rows: [
            [
              text('PlayerDetails.Researching.Breakdown.progress'),
              text('Progress.data', {
                progress: research.progress.value,
                total: research.cost.value,
              }),
            ],
            [
              text('PlayerDetails.Researching.Breakdown.per-turn'),
              text('Progress.per-turn', { count: totalResearch }),
            ],
          ],
          total: [
            text('PlayerDetails.Researching.Breakdown.turns'),
            turnsText(researchTurns),
          ],
        }),
        { key: 'research' }
      );
    }

    const revolution = actions.find((action) => action._ === 'Revolution'),
      transport = this.#transport,
      governmentName = text('PlayerDetails.Government.body', {
        government: t(`${government.current?._}.name`, {
          defaultValue: government.current?._,
          ns: 'government',
        }),
        turns: government.anarchyTurns,
        context:
          government.anarchyTurns === null ||
          government.anarchyTurns === undefined
            ? 'settled'
            : government.anarchyTurns > 0
            ? 'anarchy'
            : 'choosing',
      }),
      // Starts a revolution, as its button does, when the engine offers one (#274).
      governmentStat = statPill({
        className: 'government',
        label:
          revolution && transport
            ? text('PlayerDetails.Government.revolution', {
                title: text('PlayerDetails.Government.title'),
              })
            : text('PlayerDetails.Government.title'),
        value: governmentName,
        onClick:
          revolution && transport
            ? () =>
                confirmRevolution(
                  revolution.value as PlayerGovernment,
                  transport
                )
            : null,
      });

    this.append(heading, researching, gold, governmentStat);

    const tradeRates = this.#tradeRates(actions);

    if (tradeRates) {
      this.append(tradeRates);
    }
  }

  // The tax split, only while the engine offers to change it (#274).
  #tradeRates(actions: Player['actions']): HTMLElement | null {
    const action = actions.find((action) => action._ === 'AdjustTradeRates'),
      transport = this.#transport;

    if (!action || !transport) {
      return null;
    }

    const tradeRates = action.value as PlayerTradeRates,
      button = s<HTMLButtonElement>(
        '<button type="button" class="btn-bare stat-pill trade-rates"><span class="bar"></span><span class="visually-hidden"></span></button>'
      ),
      bar = button.querySelector('.bar') as HTMLElement,
      labels = [...tradeRates.all]
        .sort((a, b) => ratePosition(a._) - ratePosition(b._))
        .map((rate) => {
          const segment = s(`<span class="segment"></span>`),
            label = text('PlayerDetails.TradeRates.rate', {
              name: t(`${rate._}.name`, { defaultValue: rate._, ns: 'trade' }),
              // A percentage, as the trade rates window's sliders take it.
              value: rate.value,
            });

          segment.classList.add(rateClasses[rate._] ?? 'other');
          segment.style.flexGrow = `${rate.value}`;
          segment.title = label;
          bar.append(segment);

          return label;
        });

    // The Trade icon says what the bar splits.
    button.prepend(yieldIcon('Trade'));
    button.title = text('PlayerDetails.TradeRates.title', {
      key: tradeRatesKey,
    });
    button.querySelector('.visually-hidden')!.textContent = `${
      button.title
    }: ${labels.join(', ')}`;
    button.addEventListener('click', () =>
      openTradeRates(tradeRates, transport)
    );

    return button;
  }
}

export default PlayerDetails;
