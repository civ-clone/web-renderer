// The empire block in the top bar (#698): the treasury and its change a turn (red when it falls), the research under
//  way with its progress bar, nothing to research, Anarchy, and the tax split, which opens the trade rates window when
//  clicked and isn't there when the engine doesn't offer them.

// Must stay first: the components read `document` as they load.
import './lib/dom';

import { Player, PlayerAction } from '../../src/js/UI/types';
import PlayerDetails, {
  PlayerDetailsReports,
} from '../../src/js/UI/components/PlayerDetails';
import Transport from '../../src/js/UI/Transport';
import { assetStore } from '../../src/js/UI/AssetStore';
import i18next from 'i18next';
import i18nOptions from '../../src/js/UI/app/i18nOptions';

const failures: string[] = [];
let checks = 0,
  finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

// A suite that stops before its checks would otherwise pass in silence (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      `FAIL player-details: stopped after ${checks} checks\n`
    );
    process.exitCode = 1;
  }
});

// No IndexedDB under node: every picture is its path.
(assetStore as any).get = (path: string) =>
  Promise.resolve({ name: path, uri: path });
(assetStore as any).shownAtURL = (path: string) => Promise.resolve(path);

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const cityYielding = (gold: number, research: number) => ({
    yields: [
      { _: 'Gold', __: ['Gold', 'Yield'], value: gold },
      { _: 'Research', __: ['Research', 'Yield'], value: research },
    ],
  }),
  revolution = {
    _: 'Revolution',
    id: 'Revolution-1',
    value: { id: 'PlayerGovernment-1' },
  } as unknown as PlayerAction,
  tradeRates = {
    _: 'AdjustTradeRates',
    id: 'AdjustTradeRates-1',
    value: {
      id: 'PlayerTradeRates-1',
      // As the engine sends them: not in the order they are shown.
      all: [
        { _: 'Luxuries', value: 10 },
        { _: 'Research', value: 60 },
        { _: 'Tax', value: 30 },
      ],
    },
  } as unknown as PlayerAction,
  player = ({
    actions = [tradeRates, revolution],
    government = 'Monarchy',
    anarchyTurns = null,
    gold = 120,
    cities = [cityYielding(5, 4), cityYielding(-8, 2)],
    researching = 'Writing' as string | null,
    progress = 12,
  }: {
    actions?: PlayerAction[];
    government?: string;
    anarchyTurns?: number | null;
    gold?: number;
    cities?: object[];
    researching?: string | null;
    progress?: number;
  } = {}): Player =>
    ({
      id: 'Player-1',
      actions,
      cities,
      civilization: { _: 'Roman', leader: { _: 'Caesar' }, attributes: [] },
      government: { current: { _: government }, anarchyTurns },
      research: {
        complete: [],
        cost: { value: 60 },
        progress: { value: progress },
        researching: researching === null ? null : { _: researching },
      },
      treasuries: [{ yield: { _: 'Gold' }, value: gold }],
    } as unknown as Player);

let sent: unknown[] = [];

const transport = {
    send: (...args: unknown[]) => sent.push(args),
  } as unknown as Transport,
  opened: string[] = [],
  reports: PlayerDetailsReports = {
    science: {
      key: 'F6',
      open: () => opened.push('science'),
      title: 'Science report',
    },
    trade: {
      key: 'F5',
      open: () => opened.push('trade'),
      title: 'Trade report',
    },
  },
  build = (
    data: Player,
    withTransport: Transport | null = transport,
    withReports: PlayerDetailsReports = reports
  ) => {
    const element = document.createElement('div'),
      details = new PlayerDetails(element, data, withTransport, withReports);

    details.build();

    return element;
  },
  text = (element: HTMLElement, selector: string) =>
    element.querySelector(selector)?.textContent ?? null;

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('../../translations/local/en');
  await import('../../translations/civ1-trade-rate/en');
  await import('../../translations/civ1-civilization/en');
  await import('../../translations/civ1-government/en');

  {
    const element = build(player());

    await settle();

    expect(
      'the leader is the heading',
      text(element, 'h3'),
      'Caesar of the Romans'
    );
    expect('the treasury', text(element, '.gold .value'), '120');
    expect(
      "and the cities' gold a turn, signed",
      text(element, '.gold .detail'),
      '-3 / turn'
    );
    expect(
      'a falling treasury is marked',
      element.querySelector('.gold')?.classList.contains('negative'),
      true
    );
    expect(
      'the treasury carries the Gold icon',
      element.querySelector('.gold .yield-icon img')?.getAttribute('src'),
      './assets/city/gold.png'
    );
    expect(
      'and is labelled for a screen reader, with what it opens',
      text(element, '.gold .visually-hidden'),
      'Treasury (Trade report, F5): '
    );
    expect(
      'the advance under way',
      text(element, '.research .value'),
      'Writing'
    );
    expect(
      'with the turns left at the research a turn',
      text(element, '.research .detail'),
      '8 turns'
    );
    expect(
      'research carries the Research icon',
      element.querySelector('.research .yield-icon img')?.getAttribute('src'),
      './assets/city/bulb.png'
    );

    const progress = element.querySelector('.research [role="progressbar"]');

    expect(
      'the progress bar is the progress against the cost',
      [
        progress?.getAttribute('aria-valuenow'),
        progress?.getAttribute('aria-valuemax'),
        (progress?.firstElementChild as HTMLElement | null)?.style.width,
      ],
      ['12', '60', '20%']
    );
    expect(
      'and says so in words',
      progress?.getAttribute('aria-label'),
      '12 / 60 (6 / turn)'
    );
    expect('the government', text(element, '.government .value'), 'Monarchy');
    expect(
      'research comes before the treasury',
      Array.from(element.querySelectorAll('.stat-pill')).map(
        (item) =>
          item.className
            .split(' ')
            .filter((name) => !name.startsWith('btn-'))[1]
      ),
      ['research', 'gold', 'government', 'trade-rates']
    );

    const governmentButton = element.querySelector(
      'button.government'
    ) as HTMLButtonElement | null;

    expect(
      'with a revolution offered, the government is a button',
      governmentButton !== null,
      true
    );

    governmentButton?.click();

    const confirmation = document.querySelector('dialog.window:last-of-type');

    expect(
      'which asks before a revolution',
      confirmation?.querySelector('header h3')?.textContent?.trim(),
      'Revolution'
    );

    sent = [];
    (
      Array.from(confirmation?.querySelectorAll('button') ?? []).find(
        (button) => button.textContent === 'Revolution!'
      ) as HTMLButtonElement | undefined
    )?.click();

    expect('and starts one once confirmed', sent, [
      ['action', { name: 'Revolution', id: 'PlayerGovernment-1' }],
    ]);

    confirmation?.remove();

    (element.querySelector('button.research') as HTMLButtonElement).click();
    (element.querySelector('button.gold') as HTMLButtonElement).click();

    expect(
      'the research opens the Science report, and the treasury the Trade report',
      opened,
      ['science', 'trade']
    );
    expect(
      'and their names say so',
      [
        text(element, '.research .visually-hidden'),
        text(element, '.gold .visually-hidden'),
      ],
      ['Researching (Science report, F6): ', 'Treasury (Trade report, F5): ']
    );

    // Their tooltips are breakdowns (#742), opened at once by keyboard focus, in place of the browser's own.
    const breakdown = (selector: string) => {
      const anchor = element.querySelector(selector) as HTMLElement;

      anchor.dispatchEvent(new Event('focus'));

      const panel = document.getElementById('tooltip'),
        shown = {
          describedBy: anchor.getAttribute('aria-describedby'),
          title: anchor.getAttribute('title'),
          heading: panel?.querySelector('h4')?.textContent,
          rows: Array.from(panel?.querySelectorAll('dt') ?? []).map((term) => [
            term.textContent,
            term.nextElementSibling?.textContent,
          ]),
          total: panel?.querySelector('dt.total')?.textContent,
        };

      anchor.dispatchEvent(new Event('blur'));

      return shown;
    };

    expect(
      'the treasury breaks down what it gains a turn',
      breakdown('.gold'),
      {
        describedBy: 'tooltip',
        title: null,
        heading: 'Treasury',
        rows: [
          ['In the treasury', '120'],
          ['Income', '5 / turn'],
          ['Upkeep', '8 / turn'],
          ['Net', '-3 / turn'],
        ],
        total: 'Net',
      }
    );
    expect('and the research its progress', breakdown('.research'), {
      describedBy: 'tooltip',
      title: null,
      heading: 'Writing',
      rows: [
        ['Progress', '12 / 60'],
        ['Per turn', '6 / turn'],
        ['Done in', '8 turns'],
      ],
      total: 'Done in',
    });
    expect(
      'research next turn is the striped part of its bar',
      (element.querySelector('.research .progress-bar .next') as HTMLElement)
        ?.style.width,
      '10%'
    );

    const tax = element.querySelector('.trade-rates') as HTMLButtonElement;

    expect(
      'the tax split carries the Trade icon',
      tax.querySelector('.yield-icon img')?.getAttribute('src'),
      './assets/city/trade.png'
    );

    expect(
      'the tax split is one segment a rate, sized by it, Tax first',
      Array.from(tax.querySelectorAll('.segment')).map((segment) => [
        segment.className,
        (segment as HTMLElement).style.flexGrow,
      ]),
      [
        ['segment tax', '30'],
        ['segment luxury', '10'],
        ['segment science', '60'],
      ]
    );
    expect(
      'and read out in words',
      text(tax, '.visually-hidden'),
      'Adjust trade rates (+): Tax 30%, Luxuries 10%, Research 60%'
    );

    tax.click();

    const window = document.querySelector('dialog.adjust-trade-rates');

    expect('clicking it opens the trade rates window', window !== null, true);

    (window as HTMLDialogElement | null)?.dispatchEvent(new Event('close'));
    window?.remove();
  }

  {
    const element = build(player({ gold: 40, cities: [cityYielding(6, 3)] }));

    expect(
      'a growing treasury is not marked',
      element.querySelector('.gold')?.classList.contains('negative'),
      false
    );
    expect('and is signed', text(element, '.gold .detail'), '+6 / turn');
  }

  {
    const element = build(player({ researching: null }));

    expect(
      'with no research, nothing',
      text(element, '.research .value'),
      'Nothing'
    );
    expect(
      'and a prompt to choose',
      text(element, '.research .detail'),
      'choose an advance'
    );
    expect(
      'and no progress bar',
      element.querySelector('.research [role="progressbar"]'),
      null
    );
  }

  {
    const element = build(
      player({ government: 'Anarchy', anarchyTurns: 2, actions: [] })
    );

    expect(
      'under Anarchy, no taxes',
      text(element, '.gold .detail'),
      'no taxes during Anarchy'
    );
    expect(
      'and a falling treasury is not marked, as no gold moves',
      element.querySelector('.gold')?.classList.contains('negative'),
      false
    );
    expect(
      'and no research',
      text(element, '.research .detail'),
      'no research during Anarchy'
    );
    expect(
      'the revolution counts down',
      text(element, '.government .value'),
      'Anarchy (2 turns left)'
    );
    expect(
      'with no trade rates offered, no tax bar',
      element.querySelector('.trade-rates'),
      null
    );
    expect(
      'with no revolution offered, the government is not a button',
      element.querySelector('button.government'),
      null
    );
  }

  {
    const element = build(player(), null);

    expect(
      'with no reports to open, the research and treasury are not buttons',
      build(player(), transport, {}).querySelectorAll(
        'button.research, button.gold'
      ).length,
      0
    );
    expect(
      'with no transport to send the rates, no tax bar',
      element.querySelector('.trade-rates'),
      null
    );
  }

  {
    // A name with no translation is shown as it is: `&` and `'` are text, not markup to escape.
    const element = build(player({ government: "Rock & Roll's" }));

    expect(
      'a name is shown as written, not escaped',
      text(element, '.government .value'),
      "Rock & Roll's"
    );
  }

  {
    const element = build(
      player({ progress: 60, cities: [cityYielding(0, 0)] })
    );

    expect(
      'research its progress already covers is done this turn, even with no science',
      text(element, '.research .detail'),
      '1 turn'
    );
  }

  {
    const element = build(player());

    // A button's name is built from what's in it, and the bar's `aria-label` is what the bar gives it.
    expect(
      "the progress is named inside the research button, so it's part of the button's name",
      element
        .querySelector('button.research [role="progressbar"]')
        ?.getAttribute('aria-label'),
      '12 / 60 (6 / turn)'
    );
  }

  finished = true;

  if (failures.length) {
    process.stderr.write(
      `FAIL player-details (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS player-details (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL player-details: ${error.stack ?? error}\n`);
  process.exit(1);
});
