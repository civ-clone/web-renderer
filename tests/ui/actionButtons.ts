// The round action buttons (#703): each has the interface's tooltip rather than the browser's, opening on focus, its
//  title naming it for a screen reader, and its key, where it has one, after the title; buttons added once their icon
//  has loaded are given theirs too, and the tooltip goes when its action does.

// Must stay first: modules read `document` as they load.
import './lib/dom';

import { PlayerAction } from '../../src/js/UI/types';
import Action from '../../src/js/UI/components/Actions/Action';
import Actions from '../../src/js/UI/components/Actions';
import Portal from '../../src/js/UI/components/Portal';
import EndTurn from '../../src/js/UI/components/Actions/EndTurn';
import Transport from '../../src/js/UI/Transport';
import { hideTooltip } from '../../src/js/UI/components/lib/Tooltip';
import i18next from 'i18next';
import i18nOptions from '../../src/js/UI/app/i18nOptions';
import { s } from '@dom111/element';

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

const panel = () => document.getElementById('tooltip'),
  shown = () =>
    panel() && !panel()!.hidden
      ? panel()!.querySelector('h4')?.textContent
      : null,
  transport = {} as Transport,
  action = { _: 'EndTurn', value: null } as unknown as PlayerAction;

// An action whose button comes later, as those waiting on an icon do.
class Later extends Action {
  add(key: string | null = null): void {
    this.append(
      s(
        `<button class="btn-bare later" title="Later"${
          key ? ` aria-keyshortcuts="${key}"` : ''
        }></button>`
      )
    );
  }
}

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('../../translations/local/en');

  {
    const endTurn = new EndTurn(action, transport),
      button = endTurn.element().querySelector('button')!;

    document.body.append(endTurn.element());

    expect(
      "End Turn's button is named by its label, with no title of the browser's",
      [button.getAttribute('aria-label'), button.hasAttribute('title')],
      ['End turn', false]
    );

    button.dispatchEvent(new Event('focus'));

    expect(
      'focus shows the tooltip, with the key',
      shown(),
      'End turn (Enter)'
    );
    expect(
      'a tooltip of a title alone has no rows',
      panel()!.querySelector('dl')!.children.length,
      0
    );

    endTurn.remove();

    expect("an action that's removed takes its tooltip with it", shown(), null);
  }

  {
    const later = new Later(action, transport);

    document.body.append(later.element());
    later.add();

    const button = later.element().querySelector('button')!;

    button.dispatchEvent(new Event('focus'));

    expect(
      'a button added after the action was built has its tooltip too, with no key where it has none',
      [button.getAttribute('aria-label'), shown()],
      ['Later', 'Later']
    );

    hideTooltip();
    later.element().remove();
  }

  {
    const later = new Later(action, transport);

    document.body.append(later.element());
    later.add('Plus');
    later.element().querySelector('button')!.dispatchEvent(new Event('focus'));

    expect(
      'a key named for `aria-keyshortcuts` is shown as the key',
      shown(),
      'Later (+)'
    );

    hideTooltip();
    later.element().remove();
  }

  {
    const actions = new Actions(
        document.createElement('div'),
        {} as Portal,
        transport
      ),
      endTurn = { _: 'EndTurn', value: null } as unknown as PlayerAction;

    document.body.append(actions.element());
    actions.build([endTurn]);
    actions
      .element()
      .querySelector('button')!
      .dispatchEvent(new Event('focus'));
    actions.build([]);

    expect(
      'rebuilding the actions closes the tooltip of one gone',
      shown(),
      null
    );

    actions.element().remove();
  }

  if (failures.length) {
    process.stderr.write(
      `FAIL actionButtons\n${failures
        .map((failure) => `  ${failure}`)
        .join('\n')}\n`
    );
    process.exit(1);
  }

  console.log(`PASS actionButtons (${checks} checks)`);
};

run();
