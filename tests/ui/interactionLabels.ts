// What a step of the talks with another leader says, and the player's answers to it (#427, #453):
// `lib/interactionLabels.ts`, as the `chooseFromList` receiver uses it, with i18next loaded from the real
// translations as `translations.ts` does.
//
// Every key in the `diplomacy` namespace the helpers can reach is reached from an interaction shaped as the page
// receives it, with the context they build from `kind` and whether it's one of the player's own choices, and renders
// with nothing left unfilled. Then the fallbacks: an answer of the player's own with no `_own` wording uses the plain
// key, and a step with no wording at all shows its class name.

import {
  interactionContext,
  interactionLabel,
  negotiationLabel,
} from '../../src/js/UI/lib/interactionLabels';
import { Interactions, Negotiation } from '../../src/js/UI/types';
import i18next from 'i18next';

const failures: string[] = [];
let checks = 0,
  finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (actual !== expected) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

// A suite that stops before its checks would otherwise exit 0 (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      `FAIL interaction-labels: stopped after ${checks} checks, before the end\n`
    );
    process.exitCode = 1;
  }
});

// Everything any of the wordings fills in, as the transport sends it: classes as `{ _ }`, players with their
//  civilization and leader.
const egypt = {
    civilization: { _: 'Egyptian', leader: { _: 'RamessesII' } },
  },
  babylon = { civilization: { _: 'Babylonian', leader: { _: 'Hammurabi' } } },
  mongols = { civilization: { _: 'Mongol', leader: { _: 'GenghisKhan' } } },
  gold = { _: 'Gold', value: 50 },
  writing = { _: 'Writing' },
  // What a `kind` brings with it: a demand for gold names an amount, for an advance names the advance.
  details = (kind: string | undefined) => ({
    kind,
    by: egypt,
    for: [babylon],
    with: mongols,
    advance: writing,
    advances: [writing],
    tribute: kind === 'advance' ? writing : gold,
    gifts: kind === 'advance' ? [writing] : [{ ...gold, value: 100 }],
  }),
  entity = (className: string, parents: string[], data: object) =>
    ({
      _: className,
      __: [className, ...parents, 'Interaction', 'DataObject'],
      ...data,
    } as unknown as Interactions),
  proposal = (className: string, kind?: string) =>
    entity(className, ['Proposal', 'DiplomacyAction'], details(kind)),
  dialogue = (className: string, key: string) =>
    entity(
      className,
      [
        ...(className === 'Dialogue' ? [] : ['Dialogue']),
        'Proposal',
        'DiplomacyAction',
      ],
      { ...details(undefined), key }
    ),
  resolution = (className: string, proposalClass: string, kind?: string) =>
    entity(className, ['Resolution'], {
      proposal: proposal(proposalClass, kind),
    }),
  action = (className: string) =>
    entity(className, ['DiplomacyAction'], details(undefined));

// Rendered, with nothing left over from a nested `$t` or an `{{…}}` that found no value.
const rendered = (label: string): boolean =>
  label !== '' &&
  !/\{\{|\}\}|\$t\(|undefined|NaN|\.name\b/.test(label) &&
  !label.startsWith('Generic.');

(async () => {
  await i18next.init({ lng: 'en', defaultNS: 'default', ns: ['default'] });
  await import('../../translations/local/en');
  await import('../../translations/civ1-city/en');
  await import('../../translations/civ1-civilization/en');
  await import('../../translations/civ1-diplomacy/en');
  await import('../../translations/civ1-science/en');

  // The context: `own` for the player's own choices, then the proposal's `kind`.
  expect(
    'context: theirs, no kind',
    interactionContext(proposal('OfferPeace'), false),
    undefined
  );
  expect(
    'context: own, no kind',
    interactionContext(proposal('OfferPeace'), true),
    'own'
  );
  expect(
    'context: theirs, gold',
    interactionContext(proposal('DemandTribute', 'gold'), false),
    'gold'
  );
  expect(
    'context: own, gold',
    interactionContext(proposal('DemandTribute', 'gold'), true),
    'own-gold'
  );
  expect(
    "context: a resolution takes its proposal's kind",
    interactionContext(resolution('Accept', 'DemandTribute', 'advance'), true),
    'own-advance'
  );

  // Each key in the namespace, from the interaction that reaches it.
  // i18next keeps the dotted keys nested.
  const keys = (tree: object, prefix = ''): string[] =>
      Object.entries(tree).flatMap(([key, value]) =>
        typeof value === 'string'
          ? [prefix + key]
          : keys(value, `${prefix}${key}.`)
      ),
    // Not reached through these helpers: named from other wording.
    notReached = (key: string) => key.startsWith('Declaration.'),
    reached: string[] = [];

  keys(i18next.getResourceBundle('en', 'diplomacy')).forEach((fullKey) => {
    if (notReached(fullKey)) {
      return;
    }

    const [key, context] = fullKey.split('_') as [string, string | undefined],
      own = context?.startsWith('own') ?? false,
      kind = (own ? context?.replace(/^own-?/, '') : context) || undefined,
      parts = key.split('.');

    const interaction =
      parts[0] === 'Resolution'
        ? resolution(parts[2], parts[1], kind)
        : parts[0] === 'Action'
        ? action(parts[1])
        : parts.length > 1
        ? dialogue(parts[0], parts.slice(1).join('.'))
        : proposal(key, kind);

    const label = interactionLabel(interaction, own);

    reached.push(fullKey);

    expect(
      `${fullKey} is the wording reached`,
      label,
      i18next.t(fullKey, { interaction, ns: 'diplomacy' })
    );

    expect(
      `${fullKey} renders`,
      rendered(label) ? 'rendered' : label,
      'rendered'
    );
  });

  // Some of each kind, word for word.
  expect(
    'their demand for gold',
    interactionLabel(proposal('DemandTribute', 'gold')),
    'Our armies grow restless. A tribute of 50 Gold would keep them at home.'
  );
  expect(
    'our own demand for gold',
    interactionLabel(proposal('DemandTribute', 'gold'), true),
    'Demand tribute.'
  );
  expect(
    'giving in to a demand for an advance',
    interactionLabel(resolution('Accept', 'DemandTribute', 'advance'), true),
    'Very well, take it.'
  );
  expect(
    'their welcome',
    interactionLabel(dialogue('Dialogue', 'welcome.no-peace')),
    'Greetings from Ramesses II, leader of the powerful Egyptians.'
  );
  expect(
    'the advance they took (#453)',
    interactionLabel(dialogue('AdvanceTaken', 'exchange-knowledge.taken')),
    'In exchange, the Egyptians take Writing.'
  );
  expect(
    'ending the talks',
    interactionLabel(action('Terminate')),
    'Good bye!'
  );

  // An answer of the player's own with no `_own` wording falls back to the plain key.
  expect(
    'our own answer, no own wording',
    interactionLabel(resolution('Accept', 'Initiate'), true),
    'Yes'
  );
  expect(
    'our own answer to a proposal of a kind, no own wording',
    interactionLabel(resolution('Accept', 'OfferPeaceWithGift', 'gold'), true),
    'Accept'
  );

  // Nothing to say it with: the class name.
  expect(
    'a proposal with no wording',
    interactionLabel(proposal('Unheard')),
    'Unheard'
  );
  expect(
    'a resolution with no wording',
    interactionLabel(resolution('Abstain', 'Unheard')),
    'Abstain'
  );
  expect(
    'an action with no wording',
    interactionLabel(action('Unheard')),
    'Unheard'
  );

  // The talks so far: the last step, as theirs.
  const negotiation = (lastInteraction: Interactions | null) =>
    ({
      _: 'Negotiation',
      __: ['Negotiation', 'Interaction', 'DataObject'],
      interactions: lastInteraction ? [lastInteraction] : [],
      lastInteraction,
      terminated: false,
    } as unknown as Negotiation);

  expect(
    'a negotiation says its last step',
    negotiationLabel(negotiation(proposal('DemandTribute', 'gold'))),
    'Our armies grow restless. A tribute of 50 Gold would keep them at home.'
  );
  expect(
    'a negotiation with no step yet',
    negotiationLabel(negotiation(null)),
    'negotiation.missing-label'
  );

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL interaction-labels (${
        failures.length
      } of ${checks} checks)\n  ${failures.slice(0, 20).join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(
    `PASS interaction-labels (${checks} checks; ${reached.length} diplomacy keys)\n`
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
