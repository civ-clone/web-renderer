import { City, Player, PlayerGovernment, PlayerTradeRates } from '../types';
import { Element, s } from '@dom111/element';
import Transport from '../Transport';
import { confirmRevolution } from './Actions/Revolution';
import isAnarchy from './lib/government';
import { openTradeRates, tradeRatesKey } from './Actions/AdjustTradeRates';
import { reduceKnownYields } from '../lib/yieldMap';
import { researchingName } from './lib/advances';
import { TOptions, t } from 'i18next';
import { turnsLeft, yieldIcon } from './lib/cityYields';

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

// Fills in an item of the empire block (`stat`, `statButton`).
const fill = <T extends HTMLElement>(
  element: T,
  title: string,
  value: string,
  detail: string,
  ...before: Node[]
): T => {
  element.title = title;
  // As text: these are translations and names, not markup.
  element.querySelector('.visually-hidden')!.textContent = `${title}: `;
  element.querySelector('.value')!.textContent = value;
  element.querySelector('.detail')!.textContent = detail;
  element.querySelector('.yield-amount')!.prepend(...before);

  return element;
};

// One item of the empire block: a label for a screen reader (and the tooltip), the value, and a detail after it.
const stat = (
  className: string,
  title: string,
  value: string,
  detail: string,
  ...before: Node[]
): HTMLElement => {
  const element = s(
    `<div class="stat ${className}"><span class="visually-hidden"></span><span class="yield-amount"><span class="value"></span></span><span class="detail"></span></div>`
  );

  return fill(element, title, value, detail, ...before);
};

// The same, as a button that does `onClick`: for an item that opens a window, as the tax bar does.
const statButton = (
  className: string,
  title: string,
  value: string,
  detail: string,
  onClick: () => void,
  ...before: Node[]
): HTMLButtonElement => {
  const element = s<HTMLButtonElement>(
    `<button type="button" class="btn-bare stat ${className}"><span class="visually-hidden"></span><span class="yield-amount"><span class="value"></span></span><span class="detail"></span></button>`
  );

  element.addEventListener('click', onClick);

  return fill(element, title, value, detail, ...before);
};

// An item that opens a report when clicked, when there is one to open, or a plain item.
const reportStat = (
  className: string,
  title: string,
  report: Report | undefined,
  value: string,
  detail: string,
  ...before: Node[]
): HTMLElement =>
  report
    ? statButton(
        className,
        text('PlayerDetails.opens', {
          title,
          opens: report.title,
          key: report.key,
        }),
        value,
        detail,
        report.open,
        ...before
      )
    : stat(className, title, value, detail, ...before);

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
      yieldIcon('Gold')
    );

    gold.classList.toggle('negative', !anarchy && totalGold < 0);
    gold.classList.toggle('positive', !anarchy && totalGold > 0);

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
      yieldIcon('Research')
    );

    if (research.researching) {
      const progress = s(
          '<span class="progress" role="progressbar" aria-valuemin="0"><span class="fill"></span></span>'
        ),
        cost = Math.max(research.cost.value, 1),
        done = Math.min(Math.max(research.progress.value, 0), cost);

      progress.setAttribute('aria-valuemax', `${cost}`);
      progress.setAttribute('aria-valuenow', `${done}`);
      progress.title = text('PlayerDetails.Researching.progress', {
        progress: research.progress.value,
        cost: research.cost.value,
        perTurn: totalResearch,
      });
      progress.setAttribute('aria-label', progress.title);
      (progress.firstElementChild as HTMLElement).style.width = `${
        (done / cost) * 100
      }%`;

      researching.querySelector('.detail')!.before(progress);
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
      governmentStat =
        revolution && transport
          ? statButton(
              'government',
              text('PlayerDetails.Government.revolution', {
                title: text('PlayerDetails.Government.title'),
              }),
              governmentName,
              '',
              () =>
                confirmRevolution(
                  revolution.value as PlayerGovernment,
                  transport
                )
            )
          : stat(
              'government',
              text('PlayerDetails.Government.title'),
              governmentName,
              ''
            );

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
        '<button type="button" class="btn-bare stat trade-rates"><span class="bar"></span><span class="visually-hidden"></span></button>'
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
