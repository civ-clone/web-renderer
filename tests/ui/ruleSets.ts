// The rule sets a new game can switch (#158), in both interfaces' setup, built under linkedom and answered by a fake
//  worker that holds the sets as the real one does: a set as a checkbox with what it does beneath it, a set whose rules
//  differ as neither ticked nor clear, a choice as radio buttons, a rule drawn only where it is named, and nothing
//  worked out on the page: each change is asked of the worker with the choices so far, and the answer is drawn. Start
//  sends the choices, after any change still on its way.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';
import './lib/interfaces';
import './lib/grids';

import {
  RuleSetChoice,
  RuleSetNode,
  RuleSetsQuery,
} from '@civ-clone/ui-protocol/Requests/RuleSets';
import GameSetupForm from '@civ-clone/ui-interface-modern/components/GameSetupForm';
import GameSetupWindow from '@civ-clone/ui-interface-classic/components/GameSetupWindow';
import Request from '@civ-clone/core-data-client/Request';
import Transport from '@civ-clone/ui-client/Transport';
import i18next from 'i18next';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';

const failures: string[] = [];
let checks = 0,
  finished = false;

// A suite that stops before its checks would otherwise exit 0 (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      `FAIL ruleSets: stopped after ${checks} checks, before the end\n`
    );
    process.exitCode = 1;
  }
});

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

// linkedom's select only reads `value` (the selected option's), where a browser also selects the option with that
//  value, as the setup does for the grid.
Object.defineProperty(
  Object.getPrototypeOf(document.createElement('select')),
  'value',
  {
    configurable: true,
    get(this: HTMLSelectElement): string | undefined {
      return (
        this.querySelector('option[selected]') as HTMLOptionElement | null
      )?.value;
    },
    set(this: HTMLSelectElement, value: string) {
      const option = Array.from(this.querySelectorAll('option')).find(
        (option) => (option as HTMLOptionElement).value === value
      ) as HTMLOptionElement | undefined;

      if (option) {
        option.selected = true;
      }
    },
  }
);

// linkedom has no focus: what has it is kept by hand.
let focused: Element | null = document.body;

Object.defineProperty(document, 'activeElement', {
  configurable: true,
  get: () => focused,
});
Object.getPrototypeOf(
  Object.getPrototypeOf(document.createElement('button'))
).focus = function (this: HTMLElement): void {
  focused = this;
};

const OBSOLESCENCE = 'civ1-unit:obsolescence',
  SPEARMAN = 'civ1-unit:city/build/obsolete/Spearman',
  WARRIOR = 'civ1-unit:city/build/obsolete/Warrior';

// A worker's rule sets, small: "units go obsolete" over two rules; a heading over a choice between two ways for
//  Settlers to work, the second a set with a rule of its own; and a set the translations don't name, with a rule they
//  do. Held as the real registry holds them: a setting for each rule, and what is chosen.
const worker = (offers: boolean = true) => {
  const log: { channel: string; args: unknown[] }[] = [],
    held: (() => void)[] = [];

  let holding = false;

  const describe = (choices: RuleSetChoice[]): RuleSetNode[] => {
    const off = new Set<string>(),
      chosen = { value: 'test:settlers/original' };

    choices.forEach(({ id, value }) => {
      if (id === 'test:settlers') {
        chosen.value = String(value);

        return;
      }

      (id === OBSOLESCENCE ? [SPEARMAN, WARRIOR] : [id]).forEach((rule) =>
        value ? off.delete(rule) : off.add(rule)
      );
    });

    const rule = (id: string, active: boolean = true): RuleSetNode => ({
        id,
        kind: 'rule',
        state: off.has(id) ? 'off' : 'on',
        active,
        switchable: true,
        members: [],
      }),
      obsolete = [SPEARMAN, WARRIOR].filter((id) => off.has(id)).length,
      enhanced = chosen.value === 'test:settlers/enhanced';

    return [
      {
        id: OBSOLESCENCE,
        kind: 'set',
        state: obsolete === 0 ? 'on' : obsolete === 2 ? 'off' : 'mixed',
        active: true,
        switchable: true,
        members: [rule(SPEARMAN), rule(WARRIOR)],
      },
      {
        id: 'test:compatibility',
        kind: 'set',
        state: 'on',
        active: true,
        switchable: false,
        members: [
          {
            id: 'test:settlers',
            kind: 'choice',
            state: 'on',
            active: true,
            switchable: false,
            chosen: chosen.value,
            members: [
              rule('test:settlers/original', !enhanced),
              {
                id: 'test:settlers/enhanced',
                kind: 'set',
                state: off.has('test:settlers/extra') ? 'off' : 'on',
                active: enhanced,
                switchable: true,
                members: [rule('test:settlers/extra', enhanced)],
              },
            ],
          },
        ],
      },
      {
        id: 'test:unnamed',
        kind: 'set',
        state: off.has('test:named-rule') ? 'off' : 'on',
        active: true,
        switchable: true,
        members: [rule('test:named-rule')],
      },
    ];
  };

  // The choices as the registry would say them: a whole set as one line.
  const said = (choices: RuleSetChoice[]): RuleSetChoice[] => {
    const sets = describe(choices),
      obsolescence = sets[0],
      lines: RuleSetChoice[] = [];

    if (obsolescence.state === 'off') {
      lines.push({ id: OBSOLESCENCE, value: false });
    } else if (obsolescence.state === 'mixed') {
      obsolescence.members
        .filter(({ state }) => state === 'off')
        .forEach(({ id }) => lines.push({ id, value: false }));
    }

    const settlers = sets[1].members[0];

    if (settlers.chosen !== 'test:settlers/original') {
      lines.push({ id: 'test:settlers', value: settlers.chosen! });
    }

    return [
      ...lines,
      ...choices.filter(
        ({ id, value }) =>
          id.startsWith('test:') && id !== 'test:settlers' && value === false
      ),
    ];
  };

  const transport = {
    send: (channel: string, ...args: unknown[]) => log.push({ channel, args }),
    request: async (request: Request): Promise<unknown> => {
      log.push({ channel: request.channel(), args: request.args() });

      switch (request.channel()) {
        case 'civilizations':
          return [
            { name: 'Babylonian', leaders: ['Hammurabi'], colours: [] },
            { name: 'Roman', leaders: ['JuliusCaesar'], colours: [] },
            { name: 'Zulu', leaders: ['Shaka'], colours: [] },
          ];
        case 'aiClients':
          return ['SimpleAIClient'];
        case 'difficulties':
          return [{ name: 'Prince', level: 2 }];
        case 'getOptions':
          return {};
        case 'ruleSets': {
          if (!offers) {
            return { sets: [], choices: [] };
          }

          const query = request.args()[0] as RuleSetsQuery | null,
            choices = [
              ...(query?.choices ?? []),
              ...(query?.change ? [query.change] : []),
            ];

          if (holding && query?.change) {
            await new Promise<void>((resolve) => held.push(resolve));
          }

          return { sets: describe(choices), choices: said(choices) };
        }
        default:
          return undefined;
      }
    },
  } as unknown as Transport;

  return {
    log,
    transport,
    hold: () => (holding = true),
    release: () => {
      holding = false;
      held.splice(0).forEach((resolve) => resolve());
    },
    asked: () =>
      log
        .filter(({ channel }) => channel === 'ruleSets')
        .map(({ args }) => args[0]),
    options: (): any =>
      log.find(({ channel }) => channel === 'setOptions')?.args[0],
  };
};

const settle = async (): Promise<void> => {
    for (let turn = 0; turn < 5; turn++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  },
  click = (element: Element): void => {
    element.dispatchEvent(new Event('click', { bubbles: true }));
  },
  // As a browser does on a click: the box takes its new state, then says so.
  tick = (input: HTMLInputElement, checked: boolean): void => {
    input.checked = checked;
    input.indeterminate = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  },
  press = (target: Element, key: string): boolean =>
    target.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key })
    );

type Setup = { element(): HTMLElement; close(): void };

const interfaces: [string, string, (transport: Transport) => Promise<Setup>][] =
  [
    [
      'modern',
      'details.ui-game-setup-rules',
      (transport) => GameSetupForm.ask(transport),
    ],
    ['classic', 'details.rules', (transport) => GameSetupWindow.ask(transport)],
  ];

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('./lib/strings');
  await import('../../translations/civ1-unit/en');

  i18next.addResources('en', 'ruleset', {
    'test.compatibility.name': 'Compatibility',
    'test.settlers.name': 'A city of one building Settlers',
    'test.settlers.original.name': 'Is refused',
    'test.settlers.enhanced.name': 'Waits to grow',
    'test.settlers.extra.name': 'And says so',
    'test.named-rule.name': 'A rule with a name',
  });

  for (const [name, sectionSelector, ask] of interfaces) {
    const none = worker(false),
      without = await ask(none.transport);

    expect(
      `${name}: a worker that offers no rule sets is asked, and the setup has no Rules section`,
      [none.asked(), without.element().querySelector('.rule-sets-section')],
      [[null], null]
    );

    without.close();

    const fake = worker(),
      setup = await ask(fake.transport),
      element = setup.element(),
      section = (): HTMLDetailsElement =>
        element.querySelector(sectionSelector) as HTMLDetailsElement,
      box = (id: string): HTMLInputElement =>
        [...element.querySelectorAll<HTMLInputElement>('[data-rule-set]')].find(
          (input) => input.dataset.ruleSet === id
        ) as HTMLInputElement,
      item = (id: string): HTMLElement => box(id).closest('li') as HTMLElement,
      boxes = (): string[] =>
        [...element.querySelectorAll<HTMLInputElement>('[data-rule-set]')].map(
          (input) =>
            `${input.type} ${input.dataset.ruleSet!.replace('\n', ' > ')}${
              input.indeterminate ? ' mixed' : input.checked ? ' on' : ' off'
            }${
              input.disabled || input.closest('fieldset:disabled')
                ? ' (disabled)'
                : ''
            }`
        );

    expect(
      `${name}: the Rules section is there, open, under its name`,
      [section()?.open, section()?.querySelector('summary')?.textContent],
      [true, 'Rules']
    );
    expect(
      `${name}: a set is a checkbox, a choice a radio for each alternative, a rule only where it is an alternative or is named; an alternative not chosen holds what is beneath it`,
      boxes(),
      [
        `checkbox ${OBSOLESCENCE} on`,
        'radio test:settlers > test:settlers/original on',
        'radio test:settlers > test:settlers/enhanced off',
        'checkbox test:settlers/extra on (disabled)',
        'checkbox test:unnamed on',
        'checkbox test:named-rule on',
      ]
    );
    expect(
      `${name}: a set is named and described from the translations, by its id`,
      [
        item(OBSOLESCENCE).querySelector('.rule-set-name')?.textContent,
        item(OBSOLESCENCE).querySelector('.rule-set-description')?.textContent,
      ],
      [
        'Units go obsolete',
        'A city can no longer build a unit once its civilization knows the advance that makes it obsolete.',
      ]
    );
    expect(
      `${name}: a set with nothing of its own to switch is a heading over its choice, whose name is the group's`,
      [
        element.querySelector('.rule-set-heading')?.textContent,
        element.querySelector('fieldset legend')?.textContent,
        [
          ...element.querySelectorAll(
            'fieldset .rule-set-alternative .rule-set-name'
          ),
        ]
          .map((label) => label.textContent)
          .slice(0, 2),
      ],
      [
        'Compatibility',
        'A city of one building Settlers',
        ['Is refused', 'Waits to grow'],
      ]
    );
    expect(
      `${name}: a set the translations don't name goes by its id, with no line beneath it`,
      [
        item('test:unnamed').querySelector('.rule-set-name')?.textContent,
        item('test:unnamed').querySelector(':scope > .rule-set-description'),
      ],
      ['test:unnamed', null]
    );

    // --- switching a set ---------------------------------------------------------------------------------------
    box(OBSOLESCENCE).focus();
    tick(box(OBSOLESCENCE), false);
    await settle();

    expect(
      `${name}: unticking a set asks the worker, with the choices so far and the change`,
      fake.asked().slice(-1),
      [{ choices: [], change: { id: OBSOLESCENCE, value: false } }]
    );
    expect(
      `${name}: and draws its answer, with the keyboard still on that checkbox`,
      [boxes()[0], focused === box(OBSOLESCENCE)],
      [`checkbox ${OBSOLESCENCE} off`, true]
    );

    // --- a choice ----------------------------------------------------------------------------------------------
    tick(box('test:settlers\ntest:settlers/enhanced'), true);
    await settle();

    expect(
      `${name}: picking an alternative asks for the choice by its id and the alternative's, after the choices so far`,
      fake.asked().slice(-1),
      [
        {
          choices: [{ id: OBSOLESCENCE, value: false }],
          change: { id: 'test:settlers', value: 'test:settlers/enhanced' },
        },
      ]
    );
    expect(
      `${name}: and what is beneath it can now be switched`,
      boxes().slice(1, 4),
      [
        'radio test:settlers > test:settlers/original off',
        'radio test:settlers > test:settlers/enhanced on',
        'checkbox test:settlers/extra on',
      ]
    );

    // --- two changes at once, and Start on their heels --------------------------------------------------------
    fake.hold();
    tick(box('test:named-rule'), false);
    tick(box('test:settlers/extra'), false);
    click(element.querySelector('button.start') as HTMLElement);
    await settle();

    expect(
      `${name}: a second change waits for the first, and Start for both`,
      [fake.asked().length, fake.options()],
      [4, undefined]
    );

    fake.release();
    await settle();
    fake.release();
    await settle();

    expect(
      `${name}: each is made to the choices the one before it left`,
      fake.asked().slice(-2),
      [
        {
          choices: [
            { id: OBSOLESCENCE, value: false },
            { id: 'test:settlers', value: 'test:settlers/enhanced' },
          ],
          change: { id: 'test:named-rule', value: false },
        },
        {
          choices: [
            { id: OBSOLESCENCE, value: false },
            { id: 'test:settlers', value: 'test:settlers/enhanced' },
            { id: 'test:named-rule', value: false },
          ],
          change: { id: 'test:settlers/extra', value: false },
        },
      ]
    );
    expect(
      `${name}: and Start sends the choices as the worker last said them, then starts`,
      [
        fake.options()?.ruleSets,
        fake.log
          .map(({ channel }) => channel)
          .filter((channel) => ['setOptions', 'start'].includes(channel)),
      ],
      [
        [
          { id: OBSOLESCENCE, value: false },
          { id: 'test:settlers', value: 'test:settlers/enhanced' },
          { id: 'test:named-rule', value: false },
          { id: 'test:settlers/extra', value: false },
        ],
        ['setOptions', 'start'],
      ]
    );

    setup.close();

    // --- the keys ------------------------------------------------------------------------------------------------
    const keys = worker(),
      again = await ask(keys.transport),
      first = again
        .element()
        .querySelector('[data-rule-set]') as HTMLInputElement,
      before = keys.asked().length;

    expect(
      `${name}: Enter on a rule set's checkbox does not start the game, or switch anything`,
      [press(first, 'Enter'), keys.options(), keys.asked().length],
      [true, undefined, before]
    );

    again.close();
  }

  // A set whose rules differ is neither ticked nor clear: drawn from the worker's `mixed`.
  const { renderRuleSets } = await import(
      '@civ-clone/ui-menus/lib/ruleSetControls'
    ),
    holder = document.createElement('div'),
    changes: RuleSetChoice[] = [];

  renderRuleSets(
    holder,
    [
      {
        id: OBSOLESCENCE,
        kind: 'set',
        state: 'mixed',
        active: true,
        switchable: true,
        members: [],
      },
    ],
    (change) => changes.push(change)
  );

  const mixedBox = holder.querySelector('input') as HTMLInputElement;

  expect(
    'a set whose rules differ is a checkbox that is neither ticked nor clear',
    [mixedBox.checked, mixedBox.indeterminate],
    [false, true]
  );

  tick(mixedBox, true);

  expect('and ticking it switches the whole set on', changes, [
    { id: OBSOLESCENCE, value: true },
  ]);

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL ruleSets (${failures.length} of ${checks} checks)\n  ${failures
        .slice(0, 20)
        .join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS ruleSets (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL ruleSets: ${error.stack ?? error}\n`);
  process.exit(1);
});
