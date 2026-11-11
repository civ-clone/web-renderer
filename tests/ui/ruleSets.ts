// The rule sets a new game can switch (#158), in both interfaces' setup, built under linkedom and answered by a fake
//  worker that holds the sets as the real one does: a set as a checkbox with what it does beneath it, a set whose rules
//  differ as neither ticked nor clear, a choice as radio buttons, a rule drawn only where it is named, and nothing
//  worked out on the page: each change is asked of the worker with the choices so far, and the answer is drawn. Start
//  sends the choices, after any change still on its way. What is wrong with the sets (#954) is drawn as the worker
//  says it: two sets that can't both be on as an error naming both, with their rows marked and Start held until one is
//  switched off; a package's mistake as one line with the rules' words beneath; a set naming a rule that isn't loaded
//  as a quiet note that holds nothing; and a rule another set has replaced says so beside its name.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';
import './lib/interfaces';
import './lib/grids';

import {
  RuleSetChoice,
  RuleSetNode,
  RuleSetProblem,
  RuleSetsQuery,
} from '@civ-clone/ui-protocol/Requests/RuleSets';
import GameSetupForm from '@civ-clone/ui-interface-modern/components/GameSetupForm';
import GameSetupWindow from '@civ-clone/ui-interface-classic/components/GameSetupWindow';
import Request from '@civ-clone/core-data-client/Request';
import { RequestFailed } from '@civ-clone/core-data-client/AbstractTransport';
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

  let holding = false,
    failing = false;

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

          if (failing && query?.change) {
            failing = false;

            // As `Transport` rejects a request the worker could not answer, having told the player (#470).
            throw new RequestFailed('ruleSets', 'not answered');
          }

          if (holding && query?.change) {
            await new Promise<void>((resolve) => held.push(resolve));
          }

          return {
            sets: describe(choices),
            choices: said(choices),
            problems: [],
          };
        }
        default:
          return undefined;
      }
    },
  } as unknown as Transport;

  return {
    log,
    transport,
    fail: () => (failing = true),
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

// A worker whose sets have problems (#954): two sets, each replacing the one rule of a third, both on to begin with,
//  which can't both be; and a set that names a rule that isn't loaded. As the registry says them, from the choices.
const troubled = () => {
  const log: { channel: string; args: unknown[] }[] = [],
    held: (() => void)[] = [];

  let holding = false,
    // The next change fails, as a request a worker could not answer does or as a surprise does.
    failing: '' | 'request' | 'error' = '';

  const answer = (choices: RuleSetChoice[]) => {
    const off = new Set(
        choices.filter(({ value }) => value === false).map(({ id }) => id)
      ),
      on = ['test:first', 'test:second'].filter((id) => !off.has(id)),
      set = (
        id: string,
        members: RuleSetNode[],
        extra: Partial<RuleSetNode> = {}
      ): RuleSetNode => ({
        id,
        kind: 'set',
        state: off.has(id) ? 'off' : 'on',
        active: true,
        switchable: true,
        members,
        ...extra,
      }),
      rule = (id: string, extra: Partial<RuleSetNode> = {}): RuleSetNode => ({
        id,
        kind: 'rule',
        state: 'on',
        active: true,
        switchable: true,
        members: [],
        ...extra,
      }),
      problems: RuleSetProblem[] = [
        ...(on.length === 2
          ? [
              {
                kind: 'conflict' as const,
                ids: ['test:first', 'test:second'],
                message:
                  "Rule sets 'test:first' and 'test:second' both replace 'test:original', and only one of them can be in force.",
                blocking: true,
              },
            ]
          : []),
        {
          kind: 'unknown-member',
          ids: ['test:orphan', 'test:not-loaded'],
          message:
            "Rule set 'test:orphan' names 'test:not-loaded', which is neither a registered rule nor a registered rule set.",
          blocking: false,
        },
      ];

    return {
      sets: [
        set('test:base', [
          rule('test:original', {
            active: on.length === 0,
            ...(on.length > 0 ? { supersededBy: on } : {}),
          }),
        ]),
        set('test:first', [], { supersedes: ['test:original'] }),
        set('test:second', [], { supersedes: ['test:original'] }),
        set('test:orphan', []),
      ],
      choices: choices.filter(({ value }) => value === false),
      problems,
    };
  };

  const transport = {
    send: (channel: string, ...args: unknown[]) => log.push({ channel, args }),
    request: async (request: Request): Promise<unknown> => {
      log.push({ channel: request.channel(), args: request.args() });

      switch (request.channel()) {
        case 'civilizations':
          return [{ name: 'Roman', leaders: ['JuliusCaesar'], colours: [] }];
        case 'aiClients':
          return ['SimpleAIClient'];
        case 'difficulties':
          return [{ name: 'Prince', level: 2 }];
        case 'getOptions':
          return {};
        case 'ruleSets': {
          const query = request.args()[0] as RuleSetsQuery | null;

          // A change the worker is slow to answer, as one is still on its way when Start is pressed.
          if (holding && query?.change) {
            await new Promise<void>((resolve) => held.push(resolve));
          }

          if (failing !== '' && query?.change) {
            const mode = failing;

            failing = '';

            if (mode === 'request') {
              throw new RequestFailed('ruleSets', 'not answered');
            }

            throw new Error('a surprise');
          }

          return answer([
            ...(query?.choices ?? []).filter(
              ({ id }) => id !== query?.change?.id
            ),
            ...(query?.change ? [query.change] : []),
          ]);
        }
        default:
          return undefined;
      }
    },
  } as unknown as Transport;

  return {
    transport,
    hold: () => (holding = true),
    release: () => {
      holding = false;
      held.splice(0).forEach((resolve) => resolve());
    },
    // The one change waiting, answered, and the next held as it comes.
    releaseOne: () => held.shift()?.(),
    fail: (mode: 'request' | 'error') => (failing = mode),
    ruleSetsSent: (): unknown[] =>
      log
        .filter(({ channel }) => channel === 'setOptions')
        .map(({ args }) => (args[0] as { ruleSets: unknown }).ruleSets),
    started: (): string[] =>
      log
        .map(({ channel }) => channel)
        .filter((channel) => ['setOptions', 'start'].includes(channel)),
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
      // A control is keyed by where it is in the tree: found here by what it ends with.
      box = (id: string): HTMLInputElement =>
        [...element.querySelectorAll<HTMLInputElement>('[data-rule-set]')].find(
          (input) =>
            input.dataset.ruleSet === id ||
            input.dataset.ruleSet!.endsWith(`\n${id}`)
        ) as HTMLInputElement,
      item = (id: string): HTMLElement => box(id).closest('li') as HTMLElement,
      boxes = (): string[] =>
        [...element.querySelectorAll<HTMLInputElement>('[data-rule-set]')].map(
          (input) =>
            `${input.type} ${input.dataset
              .ruleSet!.split('\n')
              .slice(input.type === 'radio' ? -2 : -1)
              .join(' > ')}${
              input.indeterminate ? ' mixed' : input.checked ? ' on' : ' off'
            }${input.disabled ? ' (disabled)' : ''}`
        ),
      byId = (id: string | null): string | null =>
        id === null
          ? null
          : element.querySelector(`#${id}`)?.textContent ?? null;

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

    expect(
      `${name}: a control is described by its line, and what is beneath a set, a heading or an alternative is a list named by it`,
      [
        byId(box(OBSOLESCENCE).getAttribute('aria-describedby')),
        byId(
          item('test:unnamed')
            .querySelector('ul')
            ?.getAttribute('aria-labelledby') ?? null
        ),
        byId(
          element
            .querySelector('.rule-set-heading + ul')
            ?.getAttribute('aria-labelledby') ?? null
        ),
        byId(
          box('test:settlers/extra')
            .closest('ul')
            ?.getAttribute('aria-labelledby') ?? null
        ),
        new Set(
          [...element.querySelectorAll('.rule-sets-section [id]')].map(
            ({ id }) => id
          )
        ).size === element.querySelectorAll('.rule-sets-section [id]').length,
      ],
      [
        'A city can no longer build a unit once its civilization knows the advance that makes it obsolete.',
        'test:unnamed',
        'Compatibility',
        'Waits to grow',
        true,
      ]
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

    // --- a change the worker does not answer -------------------------------------------------------------------
    fake.fail();
    box('test:unnamed').focus();
    tick(box('test:unnamed'), false);
    await settle();

    expect(
      `${name}: a change the worker could not make leaves the sets as they were, and the checkbox says so again`,
      [boxes().slice(-2), focused === box('test:unnamed')],
      [['checkbox test:unnamed on', 'checkbox test:named-rule on'], true]
    );

    // --- a choice ----------------------------------------------------------------------------------------------
    box('test:settlers/enhanced').focus();
    tick(box('test:settlers/enhanced'), true);
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
      `${name}: and what is beneath it can now be switched, with the keyboard on the alternative picked`,
      [boxes().slice(1, 4), focused === box('test:settlers/enhanced')],
      [
        [
          'radio test:settlers > test:settlers/original off',
          'radio test:settlers > test:settlers/enhanced on',
          'checkbox test:settlers/extra on',
        ],
        true,
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
      // Asked so far: as the setup opened, the set, the change that failed, the choice, and the first of these two.
      [fake.asked().length, fake.options()],
      [5, undefined]
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

  // --- what is wrong with the sets (#954) ------------------------------------------------------------------------
  i18next.addResources('en', 'ruleset', {
    'test.base.name': 'Base',
    'test.original.name': 'The original rule',
    'test.first.name': 'First replacement',
    'test.second.name': 'Second replacement',
    'test.orphan.name': 'Orphaned',
  });

  for (const [name, , ask] of interfaces) {
    const fake = troubled(),
      setup = await ask(fake.transport),
      element = setup.element(),
      start = element.querySelector('button.start') as HTMLButtonElement,
      box = (id: string): HTMLInputElement =>
        [...element.querySelectorAll<HTMLInputElement>('[data-rule-set]')].find(
          (input) => input.dataset.ruleSet!.split('\n').pop() === id
        ) as HTMLInputElement,
      item = (id: string): HTMLElement => box(id).closest('li') as HTMLElement,
      lines = (className: string): string[] =>
        [...element.querySelectorAll(`.rule-set-problem.${className}`)].map(
          (line) => line.textContent ?? ''
        ),
      marked = (): string[] =>
        [...element.querySelectorAll('.rule-set-conflict')].map(
          (row) =>
            (row.querySelector('[data-rule-set]') as HTMLElement).dataset
              .ruleSet!
        ),
      byIds = (ids: string | null): string[] =>
        (ids ?? '')
          .split(' ')
          .filter((id) => id !== '')
          .map((id) => element.querySelector(`#${id}`)?.textContent ?? '');

    expect(
      `${name}: two sets on that replace the same rule are an error naming both, above the sets`,
      [
        lines('rule-set-error'),
        element
          .querySelector(
            '.rule-sets-section > [aria-live] + div > ul.rule-sets'
          )
          ?.tagName.toLowerCase(),
      ],
      [
        [
          'First replacement and Second replacement can’t both be on. Switch one of them off.',
        ],
        'ul',
      ]
    );
    expect(
      `${name}: both their rows are marked, and their checkboxes in error, described by it`,
      [
        marked(),
        box('test:first').getAttribute('aria-invalid'),
        byIds(box('test:second').getAttribute('aria-describedby')),
        box('test:base').hasAttribute('aria-invalid'),
      ],
      [
        ['test:first', 'test:second'],
        'true',
        [
          'First replacement and Second replacement can’t both be on. Switch one of them off.',
        ],
        false,
      ]
    );
    expect(
      `${name}: a set that names a rule that isn't loaded is a quiet note, once`,
      lines('rule-set-note'),
      ['Orphaned refers to a rule or rule set that isn’t loaded.']
    );
    expect(
      `${name}: the rule both replace says so beside its name, inside its label, apart from the name`,
      [
        item('test:original').querySelector('label .rule-set-replaced')
          ?.textContent,
        item('test:original').querySelector('label')?.textContent,
      ],
      [
        'replaced by First replacement and Second replacement',
        'The original rule replaced by First replacement and Second replacement',
      ]
    );
    expect(
      `${name}: Start is held, described by the error`,
      [start.disabled, byIds(start.getAttribute('aria-describedby'))],
      [
        true,
        [
          'First replacement and Second replacement can’t both be on. Switch one of them off.',
        ],
      ]
    );

    // Enter, from the name, would start a game.
    const nameInput = element.querySelector(
      'input[name="name"]'
    ) as HTMLInputElement;

    press(nameInput, 'Enter');
    click(start);
    await settle();

    expect(
      `${name}: and no game is started from it, by Enter or by a click that gets through`,
      fake.started(),
      []
    );

    tick(box('test:second'), false);
    await settle();

    expect(
      `${name}: with one switched off, the error and the marks go, the note stays, and the rule says what replaced it`,
      [
        lines('rule-set-error'),
        marked(),
        box('test:first').hasAttribute('aria-invalid'),
        lines('rule-set-note'),
        item('test:original').querySelector('.rule-set-replaced')?.textContent,
      ],
      [
        [],
        [],
        false,
        ['Orphaned refers to a rule or rule set that isn’t loaded.'],
        'replaced by First replacement',
      ]
    );
    expect(
      `${name}: and Start is free again, described by nothing`,
      [start.disabled, start.hasAttribute('aria-describedby')],
      [false, false]
    );

    click(start);
    await settle();

    expect(
      `${name}: so the game starts, the note notwithstanding`,
      fake.started(),
      ['setOptions', 'start']
    );

    setup.close();
  }

  // Start pressed while a change is still on its way (#954): the start waits for it, and a change that leaves the two
  //  sets both on keeps the game from starting, with the setup still open to say so.
  for (const [name, , ask] of interfaces) {
    const fake = troubled(),
      setup = await ask(fake.transport),
      element = setup.element(),
      start = element.querySelector('button.start') as HTMLButtonElement,
      box = (id: string): HTMLInputElement =>
        [...element.querySelectorAll<HTMLInputElement>('[data-rule-set]')].find(
          (input) => input.dataset.ruleSet!.split('\n').pop() === id
        ) as HTMLInputElement,
      errors = (): number => element.querySelectorAll('.rule-set-error').length;

    tick(box('test:second'), false);
    await settle();

    const note = element.querySelector('.rule-set-note');

    tick(box('test:base'), false);
    await settle();

    expect(
      `${name}: a change that leaves the problems as they were leaves what says them alone, so it isn't said again`,
      element.querySelector('.rule-set-note') === note,
      true
    );

    fake.hold();
    tick(box('test:second'), true);
    await settle();
    start.focus();
    click(start);
    await settle();

    expect(
      `${name}: Start pressed with a change on its way waits for it, holds Start, and sends nothing`,
      [start.disabled, fake.started(), element.isConnected],
      [true, [], true]
    );

    click(start);
    fake.release();
    await settle();
    await settle();

    expect(
      `${name}: the change left the two sets both on, so the game doesn't start: the setup stays open, usable, says why, and holds Start`,
      [
        fake.started(),
        element.isConnected,
        element.querySelector('[inert]'),
        errors(),
        start.disabled,
      ],
      [[], true, null, 1, true]
    );

    expect(
      `${name}: with Start held again, the keyboard is on one of the two sets that hold it, not on the button that closes the setup`,
      [
        focused instanceof HTMLInputElement &&
          focused.getAttribute('aria-invalid'),
        element.querySelector(':scope > .body')?.contains(focused),
      ],
      ['true', true]
    );

    tick(box('test:second'), false);
    await settle();
    fake.hold();
    tick(box('test:base'), true);
    await settle();
    click(start);
    click(start);
    press(element.querySelector('input[name="name"]') as Element, 'Enter');
    await settle();

    expect(
      `${name}: a start waiting on a change that is fine holds Start against a second`,
      [start.disabled, fake.started()],
      [true, []]
    );

    fake.release();
    await settle();
    await settle();

    expect(
      `${name}: and once it is answered the game starts, once, and the setup closes`,
      [fake.started(), element.isConnected],
      [['setOptions', 'start'], false]
    );

    setup.close();
  }

  // While a start waits (#954): the setup can't be changed, closing it calls the start off, a change made all the same
  //  is waited for, and a change that fails leaves the setup to be used again. Each from a setup with no conflict.
  const surprises: string[] = [];

  process.on('unhandledRejection', (reason: unknown): void => {
    surprises.push(String((reason as Error)?.message ?? reason));
  });

  const asks: [
    string,
    (transport: Transport, onFinished: () => void) => Promise<Setup>
  ][] = [
    [
      'modern',
      (transport, onFinished) => GameSetupForm.ask(transport, onFinished),
    ],
    [
      'classic',
      (transport, onFinished) => GameSetupWindow.ask(transport, onFinished),
    ],
  ];

  for (const [name, ask] of asks) {
    const make = async () => {
      const fake = troubled(),
        finished: string[] = [],
        setup = await ask(fake.transport, () => {
          finished.push('finished');
        }),
        element = setup.element(),
        start = element.querySelector('button.start') as HTMLButtonElement,
        body = element.querySelector(':scope > .body') as HTMLElement,
        box = (id: string): HTMLInputElement =>
          [
            ...element.querySelectorAll<HTMLInputElement>('[data-rule-set]'),
          ].find(
            (input) => input.dataset.ruleSet!.split('\n').pop() === id
          ) as HTMLInputElement;

      tick(box('test:second'), false);
      await settle();

      return { fake, finished, setup, element, start, body, box };
    };

    // Closed while waiting.
    {
      const { fake, finished, setup, element, start, body, box } = await make();

      fake.hold();
      tick(box('test:base'), false);
      await settle();
      start.focus();
      click(start);
      await settle();

      expect(
        `${name}: while a start waits on a change, the setup can't be changed, Start is held, and the keyboard is on the title bar's button, for Escape`,
        [
          body.hasAttribute('inert'),
          box('test:first').closest('[inert]') === body,
          start.disabled,
          focused instanceof HTMLButtonElement &&
            focused !== start &&
            element.contains(focused) &&
            !body.contains(focused),
        ],
        [true, true, true, true]
      );

      press(element, 'Escape');
      await settle();
      fake.release();
      await settle();
      await settle();

      expect(
        `${name}: closed while the start waits, nothing is sent once the change is answered, and the game isn't started`,
        [element.isConnected, fake.started(), finished],
        [false, [], []]
      );

      setup.close();
    }

    // A change made all the same while waiting: waited for, and sent.
    {
      const { fake, setup, start, box } = await make();

      fake.hold();
      tick(box('test:base'), false);
      await settle();
      click(start);
      await settle();
      tick(box('test:first'), false);
      fake.releaseOne();
      await settle();

      expect(
        `${name}: a change answered while a start still waits on another leaves Start held`,
        [start.disabled, fake.started()],
        [true, []]
      );

      fake.release();
      await settle();
      await settle();
      await settle();

      expect(
        `${name}: and the start waits for every change made, so the game starts with the last of them`,
        [fake.started(), fake.ruleSetsSent()],
        [
          ['setOptions', 'start'],
          [
            [
              { id: 'test:second', value: false },
              { id: 'test:base', value: false },
              { id: 'test:first', value: false },
            ],
          ],
        ]
      );

      setup.close();
    }

    // A change that fails as a surprise, while waiting.
    {
      const { fake, setup, element, start, body, box } = await make();

      surprises.length = 0;
      fake.hold();
      tick(box('test:base'), false);
      await settle();
      start.focus();
      click(start);
      await settle();
      fake.fail('error');
      fake.release();
      await settle();
      await settle();

      expect(
        `${name}: a change that fails as a surprise keeps the game from starting, says so as the surprise it is, and the setup can be used again`,
        [
          fake.started(),
          element.isConnected,
          body.hasAttribute('inert'),
          start.disabled,
          surprises,
          focused === start,
        ],
        [[], true, false, false, ['a surprise'], true]
      );

      tick(box('test:base'), false);
      await settle();
      click(start);
      await settle();
      await settle();

      expect(
        `${name}: and another change and Start then start the game`,
        [fake.started(), element.isConnected],
        [['setOptions', 'start'], false]
      );

      setup.close();
    }
  }

  // A package's mistake, which the player can't settle: one line, and the rules' words beneath it as detail.
  const { renderRuleSetProblems, holdStart } = await import(
      '@civ-clone/ui-menus/lib/ruleSetControls'
    ),
    problemsHolder = document.createElement('div'),
    held = document.createElement('button'),
    mistakes: RuleSetProblem[] = [
      {
        kind: 'option-conflict',
        ids: ['test:mistake'],
        message:
          "The declarations of rule set 'test:mistake' disagree on `enabled`.",
        blocking: true,
      },
      {
        kind: 'cycle',
        ids: ['test:loop'],
        message: "Rule set 'test:loop' is inside itself.",
        blocking: true,
      },
    ];

  document.body.append(problemsHolder);

  const mistaken = renderRuleSetProblems(problemsHolder, mistakes);

  holdStart(held, mistaken);

  expect(
    "a package's mistakes are one error line, with each of the rules' messages beneath it, and they hold Start",
    [
      [...problemsHolder.querySelectorAll('.rule-set-error')].map(
        (line) => line.firstChild?.textContent
      ),
      [...problemsHolder.querySelectorAll('.rule-set-problem-detail')].map(
        (line) => line.textContent
      ),
      held.disabled,
      mistaken.blocking.length,
      mistaken.marked.size,
    ],
    [
      [
        'The rule sets can’t be used as they are: a package that provides them needs fixing.',
      ],
      mistakes.map(({ message }) => message),
      true,
      1,
      0,
    ]
  );

  holdStart(held, renderRuleSetProblems(problemsHolder, []));

  expect(
    'and with nothing wrong, nothing is drawn and Start is free',
    [problemsHolder.childNodes.length, held.disabled],
    [0, false]
  );

  problemsHolder.remove();

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

  // A choice that is an alternative of another choice, and a choice that two sets hold.
  const rule = (id: string, active: boolean = true): RuleSetNode => ({
      id,
      kind: 'rule',
      state: 'on',
      active,
      switchable: true,
      members: [],
    }),
    inner: RuleSetNode = {
      id: 'test:inner',
      kind: 'choice',
      state: 'on',
      active: true,
      switchable: false,
      chosen: 'test:inner/a',
      members: [rule('test:inner/a'), rule('test:inner/b', false)],
    },
    shared: RuleSetNode = {
      id: 'test:shared',
      kind: 'choice',
      state: 'on',
      active: true,
      switchable: false,
      chosen: 'test:shared/a',
      members: [rule('test:shared/a'), rule('test:shared/b', false)],
    },
    heading = (id: string): RuleSetNode => ({
      id,
      kind: 'set',
      state: 'on',
      active: true,
      switchable: false,
      members: [shared],
    });

  changes.length = 0;

  renderRuleSets(
    holder,
    [
      {
        id: 'test:outer',
        kind: 'choice',
        state: 'on',
        active: true,
        switchable: false,
        chosen: 'test:inner',
        members: [rule('test:plain', false), inner],
      },
      heading('test:first'),
      heading('test:second'),
    ],
    (change) => changes.push(change)
  );

  const radios = [...holder.querySelectorAll<HTMLInputElement>('input')],
    groups = (ending: string): string[] => [
      ...new Set(
        radios
          .filter((radio) => radio.dataset.ruleSet!.endsWith(ending))
          .map((radio) => radio.name)
      ),
    ];

  expect(
    'a choice that is an alternative of another is drawn as a choice beneath its radio button: radios, and no checkbox',
    [
      radios.map((radio) => radio.type).filter((type) => type !== 'radio'),
      radios
        .filter((radio) => radio.dataset.ruleSet!.includes('test:inner\n'))
        .map((radio) => `${radio.value}${radio.checked ? ' on' : ''}`),
      holder.querySelectorAll('fieldset fieldset').length,
    ],
    [[], ['test:inner/a on', 'test:inner/b'], 1]
  );

  tick(
    radios.find((radio) => radio.value === 'test:inner/b') as HTMLInputElement,
    true
  );

  expect(
    'and picking one of its alternatives picks from that choice',
    changes,
    [{ id: 'test:inner', value: 'test:inner/b' }]
  );
  expect(
    "a choice drawn twice is two groups of radio buttons: picking in one doesn't clear the other, and each group differs from the choice inside a choice",
    [
      groups('test:shared/a').length,
      new Set([
        ...groups('test:shared/a'),
        ...groups('test:inner/a'),
        ...groups('test:plain'),
      ]).size,
    ],
    [2, 4]
  );

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
