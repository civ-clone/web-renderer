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
  setTradeRatesWaiting,
  tradeRatesAnswered,
  tradeRatesOpen,
  tradeRatesSettling,
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
    } as unknown as Transport,
    // The game answers every send so far.
    answerAll = (): void => {
      while (!tradeRatesAnswered());
    };

  refreshTradeRates(plain([40, 0, 60]), playerWith(10, 20));

  answerAll();

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
  answerAll();

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

  answerAll();

  const third = openTradeRates(plain([40, 0, 60]), transport);

  move(third.element(), 2, 80);
  ok(third.element()).click();
  await wait(tradeRatesDelay + 50);

  expect(
    'OK sends the rates at once, and only once',
    [sent.length - count, sent.at(-1)?.[1].value.at(-1)],
    [1, ['Research', 80]]
  );

  // A send the game never took (made while the other civilizations moved): the engine's rates come back unchanged, and
  //  OK sends the rates on screen again rather than taking them as sent.
  answerAll();

  const dropped = openTradeRates(plain([40, 0, 60]), transport);

  move(dropped.element(), 0, 70);
  await wait(tradeRatesDelay + 50);

  const afterDropped = sent.length;

  refreshTradeRates(plain([40, 0, 60]), playerWith(25, 8, true));
  ok(dropped.element()).click();

  expect(
    'OK sends rates again that the engine never took',
    [
      sent.length - afterDropped,
      sent.at(-1)?.[1].value.find(([rate]: [string]) => rate === 'Tax'),
    ],
    [1, ['Tax', 70]]
  );

  // The turn isn't ended for the player while it's open, and its close says so, for the turn to be looked at again.
  await wait(0);

  let closedEvents = 0;
  const countClosed = () => closedEvents++;

  document.addEventListener('traderatesclosed', countClosed);

  answerAll();

  const holding = openTradeRates(plain([40, 0, 60]), transport),
    openWhileShown = tradeRatesOpen();

  holding.close();
  await wait(0);

  expect(
    'open, it holds the turn; closed, it lets go and says so',
    [openWhileShown, tradeRatesOpen(), closedEvents],
    [true, false, 1]
  );

  document.removeEventListener('traderatesclosed', countClosed);

  // Closed having just sent rates (Cancel here), the rates are still settling until the game has answered every send:
  //  until then the turn isn't ended for the player, on figures from before them.
  answerAll();

  const reverting = openTradeRates(plain([40, 0, 60]), transport);

  // Every earlier send answered.
  answerAll();

  move(reverting.element(), 1, 30);
  await wait(tradeRatesDelay + 50);
  cancel(reverting.element()).click();
  await wait(0);

  const settlingAfterClose = tradeRatesSettling(),
    // The move's answer, late: the cities are on its rates, the revert's still to come.
    lastAfterFirst = tradeRatesAnswered(),
    settlingAfterFirst = tradeRatesSettling(),
    lastAfterSecond = tradeRatesAnswered();

  expect(
    'closed with sends outstanding, the rates settle only once the last is answered',
    [
      settlingAfterClose,
      lastAfterFirst,
      settlingAfterFirst,
      lastAfterSecond,
      tradeRatesSettling(),
    ],
    [true, false, true, true, false]
  );

  // A refresh that comes before a later send's answer, and then a move back to its rates: they're sent, rather than
  //  taken as the engine's, as the later send may yet land.
  answerAll();

  const stale = openTradeRates(plain([40, 0, 60]), transport);

  move(stale.element(), 0, 50);
  await wait(tradeRatesDelay + 50);
  move(stale.element(), 0, 60);
  await wait(tradeRatesDelay + 50);
  // The answer to the first send, 50, arrives after the second, 60, went.
  refreshTradeRates(plain([50, 0, 50]), playerWith(25, 8, true));
  move(stale.element(), 0, 50);

  const beforeBack = sent.length;

  await wait(tradeRatesDelay + 50);

  expect(
    'moved back to the rates of a send already answered, they are sent again',
    [
      sent.length - beforeBack,
      sent.at(-1)?.[1].value.find(([rate]: [string]) => rate === 'Tax'),
    ],
    [1, ['Tax', 50]]
  );

  stale.close();
  await wait(0);

  // Opened again before the rates it kept are answered: it starts from them, not the engine's rates from before, and
  //  closing it untouched leaves them.
  answerAll();

  const kept = openTradeRates(plain([40, 0, 60]), transport);

  move(kept.element(), 0, 25);
  ok(kept.element()).click();

  const reopened = openTradeRates(plain([40, 0, 60]), transport),
    reopenedValues = Array.from(
      reopened.element().querySelectorAll('input[type="number"]')
    ).map((input) => Number((input as HTMLInputElement).value));

  cancel(reopened.element()).click();

  expect(
    'reopened before the answer, it shows the rates kept, and Cancel keeps them',
    [
      reopenedValues,
      sent.at(-1)?.[1].value.find(([rate]: [string]) => rate === 'Tax'),
    ],
    [
      [25, 8, 67],
      ['Tax', 25],
    ]
  );

  answerAll();
  await wait(0);

  // A window taken off the page without being closed: its End Turn listener goes with it when the next one opens.
  answerAll();

  const removed = openTradeRates(plain([40, 0, 60]), transport);

  move(removed.element(), 0, 10);
  removed.element().remove();

  const beforeRemoved = sent.length,
    next = openTradeRates(plain([40, 0, 60]), transport);

  beforeEndTurn();
  await wait(tradeRatesDelay + 50);

  expect(
    'a window removed without closing sends nothing more, and a new one opens',
    [sent.length - beforeRemoved, next !== removed],
    [0, true]
  );

  // Waiting for the other civilizations, the game takes no actions: the window says so, and its rates and OK can't be
  //  used until the turn comes back.
  answerAll();

  const waiting = openTradeRates(plain([40, 0, 60]), transport),
    okButton = ok(waiting.element()),
    waitingNote = waiting
      .element()
      .querySelector('.adjust-trade-rates-waiting') as HTMLElement;

  // A move made just before the wait isn't sent once it starts, nor is Cancel's revert while it lasts.
  move(waiting.element(), 0, 45);

  const beforeWaiting = sent.length;

  setTradeRatesWaiting(true);
  await wait(tradeRatesDelay + 50);

  const whileWaiting = [okButton.disabled, waitingNote.hidden],
    sentWhileWaiting = sent.length - beforeWaiting;

  setTradeRatesWaiting(false);

  expect(
    'while waiting, nothing is sent, OK is disabled and the window says why; at the turn, both are back',
    [sentWhileWaiting, whileWaiting, [okButton.disabled, waitingNote.hidden]],
    [0, [true, false], [false, true]]
  );

  waiting.close();
  await wait(0);

  // The turn ends with it open, a move still pending: what's on screen is sent at once, ahead of End Turn, and kept.
  answerAll();

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
