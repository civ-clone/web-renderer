// Adjust Trade Rates' sliders (#485): clearing a number box to type a new
// value leaves that slider and the others where they are, and a typed value is
// kept within 0 to 100.

// Must stay first: the sliders are built as DOM elements.
import './lib/dom';
import './lib/interfaces';

import LockedSlider from '@civ-clone/ui-widgets/components/LockedSlider';
import LockedSliderGroup from '@civ-clone/ui-widgets/components/LockedSliderGroup';

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

// Each input says which rate it is: the legend alone leaves a screen reader with "slider, 50" (#857).
{
  const slider = new LockedSlider('tax', 50, 'Tax "rate" & more');

  expect(
    'the slider and the number box are both named after the rate',
    ['range', 'number'].map((type) =>
      slider
        .element()
        .querySelector(`input[type="${type}"]`)
        ?.getAttribute('aria-label')
    ),
    ['Tax "rate" & more', 'Tax "rate" & more']
  );
}

// Civ2's maximum rates (M2d, #1007): a slider stops at its maximum, the others take what's left within theirs, and the
//  rates always come to 100.
{
  const sliders = [60, 0, 40].map(
    (value, i) => new LockedSlider(`rate${i}`, value, `Rate ${i}`, 60)
  );

  new LockedSliderGroup(...sliders);

  type(sliders[2], '80');

  expect(
    'a rate set over its maximum stops at it, and the others make up 100',
    values(sliders),
    [40, 0, 60]
  );

  type(sliders[0], '10');

  expect(
    'a rate lowered leaves the rest to the others, each within its maximum',
    values(sliders),
    [10, 30, 60]
  );

  type(sliders[1], '0');

  expect(
    'what the others can’t take goes back to the rate moved',
    [values(sliders), values(sliders).reduce((total, value) => total + value)],
    [[40, 0, 60], 100]
  );
  expect(
    'and the maximum is said beside the rate’s name, and the number box stops at it',
    [
      sliders[0]!.element().querySelector('legend .locked-slider-max') !== null,
      numberBox(sliders[0]!).getAttribute('max'),
    ],
    [true, '60']
  );
}

{
  // Two locked, and the third at its maximum: the rates (which start short of 100 here) can only come to 100 by moving
  //  the locked ones, which are unlocked; the range says its maximum.
  const sliders = [20, 0, 20].map(
    (value, i) => new LockedSlider(`rate${i}`, value, `Rate ${i}`, 60)
  );

  new LockedSliderGroup(...sliders);

  [0, 1].forEach((index) => {
    const lock = sliders[index]!
      .element()
      .querySelector('input[type="checkbox"]') as HTMLInputElement;

    lock.checked = true;
    lock.dispatchEvent(new Event('input'));
  });

  type(sliders[2]!, '60');

  expect(
    'a locked slider moved to make 100 is unlocked',
    [
      values(sliders),
      sliders.map((slider) => slider.isLocked() === true),
      sliders[2]!
        .element()
        .querySelector('input[type="range"]')
        ?.getAttribute('aria-valuemax'),
    ],
    [[30, 10, 60], [false, false, false], '60']
  );
}

{
  const slider = new LockedSlider('rate', 50, 'Rate');

  expect(
    'without a maximum, nothing is said',
    [slider.element().querySelector('legend .locked-slider-max'), slider.max()],
    [null, 100]
  );
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
