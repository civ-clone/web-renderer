// The tooltip (#742): opened after the delay on hover and at once on focus, closed on leaving, blur or Escape (which
//  goes no further when it closed one, and passes through when there was none), one panel for them all, what it says
//  read afresh each time, and an open one moving to the anchor that replaced its own.

// Must stay first: modules read `document` as they load.
import './lib/dom';

import tooltip, { hideTooltip } from '../../src/js/UI/components/lib/Tooltip';

const failures: string[] = [];
let checks = 0;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}
    expected: ${JSON.stringify(expected)}
    actual:   ${JSON.stringify(actual)}`
    );
  }
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  panel = () => document.getElementById('tooltip'),
  shown = () =>
    panel() && !panel()!.hidden
      ? panel()!.querySelector('h4')?.textContent
      : null,
  escape = (target: EventTarget) => {
    const event = new Event('keydown', { bubbles: true, cancelable: true });

    Object.assign(event, { key: 'Escape' });
    target.dispatchEvent(event);

    return event;
  },
  anchor = (tag = 'div', title = 'The browser’s own') => {
    const element = document.createElement(tag);

    element.title = title;
    document.body.append(element);

    return element;
  };

const run = async () => {
  {
    let reads = 0;

    const element = anchor();

    tooltip(
      element,
      () => {
        reads++;

        return {
          title: 'Treasury',
          rows: [['Income', `${reads}`]],
          total: ['Net', '-3 / turn'],
        };
      },
      { delay: 30 }
    );

    expect(
      'its own title goes, and a div is made focusable',
      [element.getAttribute('title'), element.getAttribute('tabindex')],
      [null, '0']
    );

    element.dispatchEvent(new Event('mouseenter'));

    expect('not before the delay', shown(), null);

    await wait(60);

    expect('after it, the panel', shown(), 'Treasury');
    expect(
      'its rows and total, the total marked',
      [
        Array.from(panel()!.querySelectorAll('dt, dd')).map(
          (item) => item.textContent
        ),
        panel()!.querySelectorAll('.total').length,
        panel()!.getAttribute('role'),
        element.getAttribute('aria-describedby'),
      ],
      [['Income', '1', 'Net', '-3 / turn'], 2, 'tooltip', 'tooltip']
    );

    element.dispatchEvent(new Event('mouseleave'));

    expect(
      'leaving closes it',
      [shown(), element.getAttribute('aria-describedby')],
      [null, null]
    );

    element.dispatchEvent(new Event('mouseenter'));
    element.dispatchEvent(new Event('mouseleave'));
    await wait(60);

    expect('leaving before the delay never opens it', shown(), null);

    element.dispatchEvent(new Event('focus'));

    expect(
      'focus opens it at once, read afresh',
      [shown(), panel()!.querySelector('dd')?.textContent],
      ['Treasury', '2']
    );

    // Whether it goes further is checked in the browser: the test DOM doesn't run capturing listeners first.
    const closing = escape(element);

    expect(
      'Escape closes it, and stops there',
      [shown(), closing.defaultPrevented, closing.cancelBubble],
      [null, true, true]
    );

    const passing = escape(element);

    expect(
      'with none open, Escape passes through',
      [passing.defaultPrevented, passing.cancelBubble],
      [false, false]
    );

    element.dispatchEvent(new Event('focus'));
    element.dispatchEvent(new Event('blur'));

    expect('blur closes it', shown(), null);
    expect(
      'a button keeps its own place in the tab order',
      (() => {
        const button = anchor('button');

        tooltip(button, () => ({ title: 'x', rows: [] }));

        return button.hasAttribute('tabindex');
      })(),
      false
    );
  }

  {
    const first = anchor(),
      second = anchor();

    tooltip(first, () => ({ title: 'First', rows: [] }));
    tooltip(second, () => ({ title: 'Second', rows: [] }));

    first.dispatchEvent(new Event('focus'));
    second.dispatchEvent(new Event('focus'));

    expect(
      'one panel for every tooltip, last in the document',
      [
        document.querySelectorAll('.tooltip').length,
        shown(),
        first.hasAttribute('aria-describedby'),
        document.body.lastElementChild === panel(),
      ],
      [1, 'Second', false, true]
    );

    hideTooltip();
  }

  // The top bar is rebuilt on every update: an open tooltip moves to the item that replaced its own, saying what it
  //  says now.
  {
    const before = anchor();

    tooltip(before, () => ({ title: 'Gold 120', rows: [] }), {
      key: 'treasury',
    });
    before.dispatchEvent(new Event('focus'));
    before.remove();

    const after = anchor();

    tooltip(after, () => ({ title: 'Gold 95', rows: [] }), { key: 'treasury' });
    await wait(0);

    expect(
      'a rebuilt anchor takes over the open tooltip',
      [shown(), after.getAttribute('aria-describedby')],
      ['Gold 95', 'tooltip']
    );

    hideTooltip();

    const other = anchor();

    other.remove();
    tooltip(anchor(), () => ({ title: 'Research', rows: [] }), {
      key: 'research',
    });
    await wait(0);

    expect('but not one about something else', shown(), null);
  }

  if (failures.length) {
    process.stderr.write(
      `FAIL tooltip\n${failures.map((failure) => `  ${failure}`).join('\n')}\n`
    );
    process.exit(1);
  }

  console.log(`PASS tooltip (${checks} checks)`);
};

run();
