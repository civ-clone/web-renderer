// The Adjust trade rates window under rules with maximum rates (Civ2's, M2d): open across a change of government, it
//  takes the rates' new maximums and Fundamentalism's note as the player's data comes again (`refreshTradeRates`, as
//  the top bar calls it), brings the rates within them, and OK sends rates no higher than the new caps. And the
//  window's live rates, figures and Cancel (#1058).

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';
import './lib/interfaces';
import './lib/artPacks';
import { assetStore } from '@civ-clone/ui-assets/AssetStore';

import {
  openTradeRates,
  refreshTradeRates,
  tradeRatesDelay,
} from '@civ-clone/ui-hud/components/Actions/AdjustTradeRates';
import { Player, PlayerTradeRates } from '@civ-clone/ui-protocol/types';
import Transport from '@civ-clone/ui-client/Transport';
import { beforeEndTurn } from '@civ-clone/ui-client/lib/endTurn';
import i18next from 'i18next';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';

// No IndexedDB under node: every picture is its path.
(assetStore as any).shownAtURL = (path: string) => Promise.resolve(path);

const failures: string[] = [];
let checks = 0;

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

const rates = (
  values: [number, number, number],
  max: number,
  limitedRates: { [rate: string]: number } = {}
): PlayerTradeRates =>
  ({
    id: 'rates-1',
    all: ['Tax', 'Luxuries', 'Research'].map((_, index) => ({
      _,
      value: values[index],
    })),
    maxRates: { Tax: max, Luxuries: max, Research: max },
    limitedRates,
  } as unknown as PlayerTradeRates);

const ok = (element: HTMLElement): HTMLButtonElement =>
    element.querySelector('footer .btn-primary') as HTMLButtonElement,
  cancel = (element: HTMLElement): HTMLButtonElement =>
    element.querySelector('footer .btn-quiet') as HTMLButtonElement,
  wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  // A player of one city, making `gold` and `research` a turn, in disorder or not.
  playerWith = (gold: number, research: number, disorder = false): Player =>
    ({
      cities: [
        {
          civilDisorder: disorder,
          yields: [
            { _: 'Gold', __: ['Gold', 'Yield'], value: gold },
            { _: 'Research', __: ['Research', 'Yield'], value: research },
          ],
        },
      ],
      government: { current: { _: 'Monarchy' } },
      research: {
        researching: { _: 'Writing' },
        cost: { value: 100 },
        progress: { value: 0 },
      },
    } as unknown as Player),
  move = (element: HTMLElement, index: number, value: number): void => {
    const input = element.querySelectorAll('input[type="number"]')[
      index
    ] as HTMLInputElement;

    input.value = String(value);
    input.dispatchEvent(new Event('input'));
  },
  plain = (values: [number, number, number]): PlayerTradeRates =>
    ({
      id: 'rates-2',
      all: ['Tax', 'Luxuries', 'Research'].map((_, index) => ({
        _,
        value: values[index],
      })),
    } as unknown as PlayerTradeRates);

// Rates are sent as they're moved, once they pause, and the window shows what they give as the cities come back
//  (#1058). Cancel puts back the rates it opened with; OK keeps them.
const liveAndCancel = async (): Promise<void> => {
  const sent: [string, any][] = [],
    transport = {
      send: (channel: string, data: unknown) => sent.push([channel, data]),
    } as unknown as Transport;

  refreshTradeRates(plain([40, 0, 60]), playerWith(10, 20));

  const window = openTradeRates(plain([40, 0, 60]), transport),
    element = window.element(),
    effect = (): string[] =>
      Array.from(
        element.querySelectorAll('.adjust-trade-rates-effect dd .value')
      ).map((value) => value.textContent ?? '');

  expect(
    'it opens showing what the rates give now, from the top bar’s player',
    effect(),
    ['+10 / turn', '+20 / turn', 'None']
  );

  move(element, 0, 70);

  expect('nothing is sent while the rates are still moving', sent.length, 0);

  await wait(tradeRatesDelay + 50);

  expect(
    'once they pause, they are sent',
    sent.map(([, action]) => action.value),
    [
      [
        ['Tax', 70],
        ['Luxuries', 0],
        ['Research', 30],
      ],
    ]
  );

  // The engine sends the cities again, now yielding more gold and less research.
  refreshTradeRates(plain([70, 0, 30]), playerWith(25, 8, true));

  expect(
    'and the window shows what they give, beside what they gave',
    [
      effect(),
      element.querySelector('.adjust-trade-rates-effect dd.gold .detail')
        ?.textContent,
    ],
    [['+25 / turn', '+8 / turn', '1 city'], '(was 10)']
  );

  cancel(element).click();

  expect(
    'Cancel puts back the rates it opened with',
    sent.map(([, action]) => action.value).at(-1),
    [
      ['Tax', 40],
      ['Luxuries', 0],
      ['Research', 60],
    ]
  );

  // A box cleared to type into stays clear as the engine's patches come in: the window's own live send among them.
  const clearing = openTradeRates(plain([40, 0, 60]), transport),
    box = clearing
      .element()
      .querySelector('input[type="number"]') as HTMLInputElement,
    figure = clearing
      .element()
      .querySelector('.adjust-trade-rates-effect dd.gold .value')!,
    // A node kept, rather than a new one, is how a screen reader is spared the list again.
    figureNode = figure.firstChild,
    beforeClearing = sent.length;

  box.value = '';
  box.dispatchEvent(new Event('input'));
  // The same rates and figures as the top bar last had.
  refreshTradeRates(plain([40, 0, 60]), playerWith(25, 8, true));

  expect(
    'a cleared box stays clear as the same rates come in, and nothing is sent',
    [box.value, sent.length - beforeClearing],
    ['', 0]
  );
  expect(
    'a figure that hasn’t changed is left as it was',
    figure.firstChild === figureNode,
    true
  );

  // Escape puts the rates back too.
  move(clearing.element(), 0, 90);
  await wait(tradeRatesDelay + 50);
  clearing
    .element()
    .dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );

  expect(
    'Escape puts back the rates it opened with',
    [
      clearing.element().isConnected,
      sent.at(-1)?.[1].value.find(([rate]: [string]) => rate === 'Tax'),
    ],
    [false, ['Tax', 40]]
  );

  const count = sent.length,
    again = openTradeRates(plain([40, 0, 60]), transport);

  again.close();

  expect('closed with nothing moved, nothing is sent', sent.length, count);

  const third = openTradeRates(plain([40, 0, 60]), transport);

  move(third.element(), 2, 80);
  ok(third.element()).click();
  await wait(tradeRatesDelay + 50);

  expect(
    'OK sends the rates at once, and only once',
    [sent.length - count, sent.at(-1)?.[1].value.at(-1)],
    [1, ['Research', 80]]
  );

  // The turn ends with it open, a move still pending: what's on screen is sent at once, ahead of End Turn, and kept.
  const ending = openTradeRates(plain([40, 0, 60]), transport),
    beforeEnding = sent.length;

  move(ending.element(), 0, 20);
  beforeEndTurn();

  expect(
    'as the turn ends, the pending rates are sent at once and the window closes, keeping them',
    [
      ending.element().isConnected,
      sent.length - beforeEnding,
      sent.at(-1)?.[1].value.find(([rate]: [string]) => rate === 'Tax'),
    ],
    [false, 1, ['Tax', 20]]
  );

  await wait(tradeRatesDelay + 50);

  expect('and nothing follows it', sent.length - beforeEnding, 1);
};

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('./lib/strings');

  const sent: unknown[] = [],
    transport = {
      send: (channel: string, data: unknown) => sent.push([channel, data]),
    } as unknown as Transport,
    window = openTradeRates(
      rates([20, 0, 80], 80, { Research: 50 }),
      transport
    ),
    element = window.element(),
    values = (): number[] =>
      Array.from(element.querySelectorAll('input[type="number"]')).map(
        (input) => Number((input as HTMLInputElement).value)
      ),
    maximums = (): (string | null)[] =>
      Array.from(element.querySelectorAll('input[type="range"]')).map((input) =>
        input.getAttribute('max')
      ),
    notes = (): number =>
      element.querySelectorAll('.adjust-trade-rates-limit').length;

  expect(
    'under Fundamentalism: each rate at most 80%, and the note on research',
    [values(), maximums(), notes()],
    [[20, 0, 80], ['80', '80', '80'], 1]
  );

  // The government changes (to Despotism) while it's open: the top bar is drawn again with the new rates.
  refreshTradeRates(rates([40, 0, 60], 60));

  expect(
    'the new maximums are taken, the rates brought within them to 100, and the note gone',
    [
      maximums(),
      values().every((value) => value <= 60),
      values().reduce((total, value) => total + value),
      notes(),
    ],
    [['60', '60', '60'], true, 100, 0]
  );

  // Asking to open it again brings it up to date too.
  openTradeRates(rates([40, 0, 60], 70, { Research: 50 }), transport);

  expect(
    'as does asking for it again',
    [maximums(), notes()],
    [['70', '70', '70'], 1]
  );

  refreshTradeRates(rates([40, 0, 60], 60));
  ok(element).click();

  const [[, action]] = sent as [string, any][];

  expect(
    'OK sends rates within the new maximums',
    (action.value as [string, number][]).every(([, value]) => value <= 60),
    true
  );

  refreshTradeRates(rates([40, 0, 60], 100));

  expect('closed, nothing is refreshed', sent.length, 1);

  await liveAndCancel();

  if (failures.length) {
    process.stderr.write(
      `FAIL tradeRatesWindow\n${failures
        .map((failure) => `  ${failure}`)
        .join('\n')}\n`
    );
    process.exit(1);
  }

  console.log(`PASS tradeRatesWindow (${checks} checks)`);
  void document;
};

run().catch((error) => {
  process.stderr.write(`FAIL tradeRatesWindow: ${error?.stack ?? error}\n`);
  process.exit(1);
});
