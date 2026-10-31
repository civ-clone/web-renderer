// Adjust Trade Rates' sliders (#485): clearing a number box to type a new
// value leaves that slider and the others where they are, and a typed value is
// kept within 0 to 100.

// Must stay first: the sliders are built as DOM elements.
import './lib/dom';

import LockedSlider from '../../src/js/UI/components/LockedSlider';
import LockedSliderGroup from '../../src/js/UI/components/LockedSliderGroup';

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

// Tax, lux and science, as Adjust Trade Rates builds them.
const tradeRates = (...values: number[]) => {
    const sliders = values.map(
      (value, i) => new LockedSlider(`rate${i}`, value, `Rate ${i}`)
    );

    new LockedSliderGroup(...sliders);

    return sliders;
  },
  numberBox = (slider: LockedSlider) =>
    slider.element().querySelector('input[type="number"]') as HTMLInputElement,
  type = (slider: LockedSlider, value: string) => {
    numberBox(slider).value = value;
    numberBox(slider).dispatchEvent(new Event('input'));
  },
  values = (sliders: LockedSlider[]) => sliders.map((slider) => slider.value());

{
  const sliders = tradeRates(30, 30, 40);

  type(sliders[0], '');

  expect(
    'clearing a number box leaves every slider where it was',
    values(sliders),
    [30, 30, 40]
  );
  expect(
    'clearing a number box leaves it empty to type into',
    numberBox(sliders[0]).value,
    ''
  );

  type(sliders[0], '6');
  type(sliders[0], '60');

  expect('the value typed after clearing is kept', sliders[0].value(), 60);
  expect(
    'the others are rebalanced around it to total 100',
    values(sliders).reduce((total, value) => total + value, 0),
    100
  );
}

// Each track is filled up to its thumb, by `--fill` (0 to 1), which the theme draws from (#739); a rebalanced slider
//  too.
{
  const sliders = tradeRates(30, 30, 40),
    fill = (slider: LockedSlider) =>
      (
        slider
          .element()
          .querySelector('input[type="range"]') as HTMLInputElement
      ).style.getPropertyValue('--fill');

  expect('each track starts filled to its value', sliders.map(fill), [
    '0.3',
    '0.3',
    '0.4',
  ]);

  type(sliders[0], '60');

  expect(
    'and follows it when the value changes, rebalanced ones included',
    sliders.map(fill),
    values(sliders).map((value) => String(value / 100))
  );
}

{
  const sliders = tradeRates(30, 30, 40);

  type(sliders[2], '-');

  expect('a lone minus sign changes nothing', values(sliders), [30, 30, 40]);
}

{
  const slider = new LockedSlider('rate', 50, 'Rate');

  slider.set('150');

  expect('a value over 100 is set to 100', slider.value(), 100);
  expect(
    'the number box shows the value that was kept',
    numberBox(slider).value,
    '100'
  );

  slider.set('-5');

  expect('a negative value is set to 0', slider.value(), 0);
}

if (failures.length) {
  process.stderr.write(
    `FAIL lockedSlider\n${failures
      .map((failure) => `  ${failure}`)
      .join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS lockedSlider (${checks} checks)`);
