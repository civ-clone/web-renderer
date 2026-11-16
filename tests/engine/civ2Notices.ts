// What Civ2's rules tell a person of their diplomacy (M2d, #1007): each of civ2-diplomacy's events, and the Eiffel
//  Tower's and the Manhattan Project's effect on reputations, as `ui-rules-civ2`'s notices tell it and the page words it
//  (the notice sent, rebuilt as the page rebuilds it, and translated). A civilization the person hasn't met isn't named
//  (#59), and two computer players' news reaches only a person with an embassy with one of them. The client registers
//  a rule set's notices after its own; the reputation rules turn civ2-wonder's changes into the events.

import {
  Aztec,
  Babylonian,
  Greek,
  Roman,
} from '@civ-clone/civ2-civilization/Civilizations';
import i18next, { t } from 'i18next';
import Effect from '@civ-clone/core-rule/Effect';
import Embassy from '@civ-clone/base-unit-action-establish-embassy/Embassy';
import InteractionRegistry from '@civ-clone/core-diplomacy/InteractionRegistry';
import { NotificationContext } from '@civ-clone/ui-worker-client/Client/notifications/NotificationContext';
import Player from '@civ-clone/core-player/Player';
import Reputation from '@civ-clone/core-diplomacy/Reputation';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import addFormatters from '@civ-clone/ui-game/app/i18nFormatters';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';
import notifications from '@civ-clone/ui-rules-civ2/notifications';
import { reconstituteData } from '@civ-clone/core-data-client/reconstituteData';
import registerNotifications from '@civ-clone/ui-worker-client/Client/notifications/registerNotifications';
import reputationNotices from '@civ-clone/ui-rules-civ2/Rules/reputationNotices';
import { setWorkerRules } from '@civ-clone/ui-worker-client/workerRules';
import { stubView } from './lib/view';
import UnknownPlayer from '@civ-clone/ui-worker-client/UnknownObjects/Player';

const failures: string[] = [];
let checks = 0,
  finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  const [a, e] = [actual, expected].map((value) => JSON.stringify(value));

  if (a !== e) {
    failures.push(`${description}\n    expected: ${e}\n    actual:   ${a}`);
  }
};

// A run that stops before it reports has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write('FAIL civ2Notices: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

const player = (civilization: any): Player => {
  const created = new Player();

  created.setCivilization(civilization);

  return created;
};

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  addFormatters(i18next);
  await import('../ui/lib/strings');
  await import('../../translations/civ1-civilization/en');
  await import('../../translations/civ2-civilization/en');
  await import('../../translations/civ2-diplomacy/en');

  const us = player(new Roman()),
    greeks = player(new Greek()),
    babylon = player(new Babylonian()),
    stranger = player(new Aztec()),
    interactionRegistry = new InteractionRegistry(),
    ruleRegistry = new RuleRegistry(),
    table = notifications({ interactionRegistry, ruleRegistry }),
    ctx = {
      player: () => us,
      view: stubView(() => us),
      hasMet: (other: Player) => other !== stranger,
    } as unknown as NotificationContext,
    // What the page reads: the notice as sent (other players as the client sends them, by civilization alone),
    //  rebuilt and translated.
    told = (event: string, ...args: any[]): string | null => {
      const [, handler] = table.find(([name]) => name === event)!,
        notification = handler(ctx, ...args.map((arg) => arg)) as any;

      if (notification === null) {
        return null;
      }

      const data = Object.fromEntries(
          Object.entries(notification.data()).map(([key, value]) => [
            key,
            value instanceof Player && value !== us
              ? UnknownPlayer.fromPlayer(value)
              : value,
          ])
        ),
        sent = reconstituteData(
          new (notification.constructor as any)(
            notification.key(),
            data,
            notification.bubble()
          ).toPlainObject()
        ) as any;

      return `${t(`${sent.key}.title`, {
        ...sent.data,
        ns: 'notification',
      })}: ${t(`${sent.key}.body`, {
        ...sent.data,
        ns: 'notification',
        skipOnVariables: false,
      })}`;
    };

  interactionRegistry.register(new Embassy(us, greeks, ruleRegistry) as never);

  expect(
    'each of civ2-diplomacy’s events that is ours, told in our own words',
    [
      told('civ2-diplomacy:ceasefire-expired', greeks, us),
      told('civ2-diplomacy:alliance-cancelled', greeks, us),
      told('civ2-diplomacy:alliance-cancelled', us, greeks),
      told('civ2-diplomacy:units-withdrawn', greeks, us, []),
      told('civ2-diplomacy:maps-shared', us, greeks),
      told('civ2-diplomacy:senate-forced-treaty', us, greeks, 'ceasefire'),
      told('civ2-diplomacy:senate-forced-treaty', us, greeks, 'peace'),
      told('civ2-diplomacy:refusal-overruled', greeks, us, {}),
      told('civ2-diplomacy:war-declared', us, greeks),
      // A war declared on us, breaking a treaty or not; ours isn't told this way.
      told('civ2:war-on', greeks, us, 3),
      told('civ2:war-on', greeks, us, 1),
      told('civ2:war-on', us, greeks, 3),
      told('civ2-diplomacy:ally-joins-war', babylon, us, greeks),
      told('civ2-diplomacy:treaty-broken', greeks, us),
    ],
    [
      'Ceasefire over: Our ceasefire with the Greeks has run out. We are no longer bound by it, and nor are they.',
      'Alliance ended: The Greeks have ended our alliance. Our units in their land, and theirs in ours, have been sent home.',
      'Alliance ended: Our alliance with the Greeks is over. Our units in their land, and theirs in ours, have been sent home.',
      'Units withdrawn: The Greeks have withdrawn their units from our land.',
      'Maps shared: We have shared our maps with the Greeks, and they theirs with us.',
      'The Senate: The Senate has overruled us, and agreed to a ceasefire with the Greeks.',
      'The Senate: The Senate has overruled us, and signed a peace treaty with the Greeks.',
      'Peace: Our refusal counted for nothing: we are now at peace with the Greeks.',
      'War: We are now at war with the Greeks.',
      'Treaty broken: The Greeks have broken their treaty with us, and declared war!',
      'War: The Greeks have declared war on us!',
      null,
      'War: The Babylonians stand by their allies, and have declared war on us!',
      'Treaty broken: The Greeks have broken their treaty with us!',
    ]
  );

  expect(
    'one with a civilization we haven’t met doesn’t name it, and one that isn’t ours isn’t told',
    [
      told('civ2-diplomacy:war-declared', us, stranger),
      told('civ2-diplomacy:ceasefire-expired', greeks, babylon),
    ],
    ['War: We are now at war with an unknown civilization.', null]
  );

  expect(
    'two computer players’ news reaches us with an embassy with one of them, both met',
    [
      told('civ2-diplomacy:computers-made-peace', greeks, babylon),
      told('civ2-diplomacy:computers-went-to-war', babylon, greeks),
      told('civ2-diplomacy:computers-allied', greeks, babylon, stranger),
      told('civ2-diplomacy:computers-ended-alliance', greeks, babylon),
      told('civ2-diplomacy:contact-lapsed', greeks, babylon),
    ],
    [
      'Foreign affairs: Our ambassadors report that the Greeks and the Babylonians have made peace.',
      'Foreign affairs: Our ambassadors report that the Babylonians and the Greeks are at war.',
      'Foreign affairs: Our ambassadors report that the Greeks and the Babylonians have formed an alliance.',
      'Foreign affairs: Our ambassadors report that the alliance between the Greeks and the Babylonians is over.',
      'Foreign affairs: Our ambassadors report that the Greeks and the Babylonians have lost touch with each other.',
    ]
  );

  expect(
    'but not without an embassy with either, nor naming one we haven’t met',
    [
      told('civ2-diplomacy:computers-made-peace', babylon, stranger),
      told('civ2-diplomacy:computers-made-peace', greeks, stranger),
    ],
    [null, null]
  );

  // The Wonders: civ2-wonder changes reputations with a reason, which the rules turn into the events told.
  const emitted: [string, Player][] = [],
    reputations = new Reputation(interactionRegistry, ruleRegistry);

  ruleRegistry.register(
    ...reputationNotices({
      emit: (event: string, player: Player) => emitted.push([event, player]),
    } as any)
  );

  reputations.set(us, 4, 'eiffel-tower');
  reputations.set(greeks, 2, 'manhattan-project');
  reputations.set(us, 3, 'war');

  expect(
    'the Eiffel Tower’s and the Manhattan Project’s changes become events; others don’t',
    emitted.map(([event, player]) => [event, player === us]),
    [
      ['civ2:reputation-restored', true],
      ['civ2:reputations-halved', false],
    ]
  );
  expect(
    'and ours are told',
    [
      told('civ2:reputation-restored', us),
      told('civ2:reputations-halved', us),
      told('civ2:reputations-halved', greeks),
    ],
    [
      'The Eiffel Tower: The Eiffel Tower wins the world over: our past broken promises count for less.',
      'The Manhattan Project: In the shadow of the Manhattan Project, old grievances fade: every civilization’s broken promises count for less.',
      null,
    ]
  );

  // The client registers the rule set's notices after its own, as engine listeners.
  const listened: string[] = [];

  setWorkerRules({
    notifications: table,
    replacesNotices: ['player:declaration-expired'],
  } as any);
  registerNotifications(
    {
      on: (event: string) => {
        listened.push(event);
      },
      off: () => {},
    } as any,
    { ...ctx, notifier: { notify: () => {} } } as any
  );

  expect(
    'the client listens for each of the rule set’s events, after its own, and not for those it replaces: a treaty’s end is told by what ended it',
    [
      listened.slice(-table.length),
      listened.includes('player:declaration-expired'),
    ],
    [table.map(([event]) => event), false]
  );

  finished = true;
};

run().then(
  () => {
    if (failures.length > 0) {
      process.stderr.write(
        `FAIL civ2Notices (${
          failures.length
        } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
      );
      process.exit(1);
    }

    process.stdout.write(`PASS civ2Notices (${checks} checks)\n`);
  },
  (error) => {
    process.stderr.write(`FAIL civ2Notices: ${error?.stack ?? error}\n`);
    process.exit(1);
  }
);
