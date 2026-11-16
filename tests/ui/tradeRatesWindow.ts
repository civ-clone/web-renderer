// The Adjust trade rates window under rules with maximum rates (Civ2's, M2d): open across a change of government, it
//  takes the rates' new maximums and Fundamentalism's note as the player's data comes again (`refreshTradeRates`, as the
//  top bar calls it), brings the rates within them, and sends rates no higher than the new caps when it closes.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';
import './lib/interfaces';

import {
  openTradeRates,
  refreshTradeRates,
} from '@civ-clone/ui-hud/components/Actions/AdjustTradeRates';
import { PlayerTradeRates } from '@civ-clone/ui-protocol/types';
import Transport from '@civ-clone/ui-client/Transport';
import i18next from 'i18next';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';

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
  window.close();

  const [[, action]] = sent as [string, any][];

  expect(
    'closed, it sends rates within the new maximums',
    (action.value as [string, number][]).every(([, value]) => value <= 60),
    true
  );

  refreshTradeRates(rates([40, 0, 60], 100));

  expect('closed, nothing is refreshed', sent.length, 1);

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
