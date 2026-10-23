// Talks with another player (#449), checked with a stub transport, the real `PlayerPatches` and an empty rule registry,
//  in which every negotiation is over at its first step: gold given or taken in the talks is sent once they are over,
//  as nothing else would send it (#492), whether the talks end or fail. Then, counted in microtasks (#503), when the
//  talks a Meet with King starts and those the hand-over starts settle for an action that waits for them.

import ActionsState from '../../src/js/Engine/Client/ActionsState';
import { DataFilter } from '../../src/js/Engine/Client/visibilityFilter';
import { Gold } from '@civ-clone/civ1-city/Yields';
import Player from '@civ-clone/core-player/Player';
import PlayerPatches from '../../src/js/Engine/Client/PlayerPatches';
import PlayerResearch from '@civ-clone/core-science/PlayerResearch';
import PlayerTreasury from '@civ-clone/core-treasury/PlayerTreasury';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import Talks, { TalksContext } from '../../src/js/Engine/Client/Talks';
import Timeout from '../../src/js/Engine/Error/Timeout';
import { instance as playerResearchRegistryInstance } from '@civ-clone/core-science/PlayerResearchRegistry';
import { instance as playerTreasuryRegistryInstance } from '@civ-clone/core-treasury/PlayerTreasuryRegistry';

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
    process.stderr.write('FAIL clientTalks: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

const ours = new Player(),
  rival = new Player(),
  treasury = new PlayerTreasury(ours, Gold),
  rules = new RuleRegistry(),
  sent: [string, any][] = [],
  transport = {
    send: (channel: string, data: unknown) => sent.push([channel, data]),
  },
  // Nothing here needs filtering: the treasury's only reference is to the player.
  dataFilter = (() => (object: any) =>
    object instanceof Player
      ? { '#ref': object.id() }
      : object) as unknown as DataFilter,
  patches = new PlayerPatches(
    transport as any,
    dataFilter,
    new ActionsState(),
    () => ours
  ),
  // What each step does to our gold, standing in for a proposal resolved (`civ1-diplomacy`'s `give`), which raises no
  //  event.
  step: { onChoose: () => void } = { onChoose: () => {} },
  client = {
    chooseFromList: async (meta: any) => {
      step.onChoose();

      return meta.choices()[0].value();
    },
  },
  interactions = { register: (): void => {} },
  talks = new Talks({
    player: () => ours,
    clients: { getByPlayer: () => client },
    interactions,
    patches,
    rules,
    transport,
    turn: { value: () => 1 },
    units: { getByTile: () => [] },
  } as unknown as TalksContext),
  treasuryPatches = (): any[] =>
    sent
      .filter(([channel]) => channel === 'gameDataPatch')
      .flatMap(([, patch]) => patch)
      .filter((patch: any) => treasury.id() in patch)
      .map(
        (patch: any) => patch[treasury.id()].value.objects[treasury.id()].value
      );

playerTreasuryRegistryInstance.register(treasury);
playerResearchRegistryInstance.register(new PlayerResearch(ours));

(async () => {
  treasury.add(100);

  // Tribute paid in the talks.
  step.onChoose = () => treasury.subtract(50);

  await talks.handleNegotiation(rival);

  expect(
    'gold paid in the talks is sent once they are over',
    treasuryPatches(),
    [50]
  );

  sent.splice(0);

  // Talks that change nothing send no treasury.
  step.onChoose = () => {};

  await talks.handleNegotiation(rival);

  expect('talks that change no gold send no treasury', treasuryPatches(), []);

  sent.splice(0);

  // Gold received, then the talks fail as they end: what changed is sent all the same.
  step.onChoose = () => treasury.add(25);
  interactions.register = () => {
    throw new Error('the talks fell through');
  };

  let thrown: unknown = null;

  try {
    await talks.handleNegotiation(rival);
  } catch (e) {
    thrown = e;
  }

  expect(
    'talks that fail still fail',
    (thrown as Error | null)?.message,
    'the talks fell through'
  );
  expect(
    'gold received in talks that failed is sent all the same',
    treasuryPatches(),
    [75]
  );

  sent.splice(0);

  // Talks a Meet with King started that fail don't fail the talks after them, or the actions that wait for them (#470).
  const logged = console.error;
  let pendingFailed = false;

  console.error = () => {};
  talks.meetWithKing(rival);
  await talks.pending.catch(() => {
    pendingFailed = true;
  });
  console.error = logged;

  interactions.register = () => {};
  step.onChoose = () => treasury.add(5);
  talks.meetWithKing(rival);
  await talks.pending;

  expect(
    'talks that failed leave the talks under way settled, and the next go ahead',
    [pendingFailed, talks.underWay, treasuryPatches()],
    [false, false, [100, 105]]
  );

  sent.splice(0);

  // A chooser that fails every time is not asked for ever: the talks end, and the UI is told (#470). Here it gives in
  //  after 20 tries, so that without the limit this ends, and fails, rather than hanging.
  let asked = 0;

  step.onChoose = () => {
    asked++;

    if (asked <= 20) {
      throw new Error('no answer');
    }
  };

  console.error = () => {};

  const givenUp = await talks.handleNegotiation(rival);

  console.error = logged;

  expect(
    'talks whose chooser fails every time end after a few tries, and say so',
    [
      asked,
      givenUp.terminated(),
      sent
        .filter(([channel]) => channel === 'workerError')
        .map(([, data]) => data.message),
    ],
    // Three rounds without a step (`maxStalledRounds`).
    [3, true, ['no answer']]
  );

  sent.splice(0);

  // One that is only slow, as a computer player that misses its 500 ms each time, ends the talks too, but nothing has
  //  gone wrong to say.
  asked = 0;
  step.onChoose = () => {
    asked++;

    throw new Timeout('too slow');
  };

  console.error = () => {};

  const timedOut = await talks.handleNegotiation(rival);

  console.error = logged;

  expect(
    'talks whose chooser only times out end after a few tries, unsaid',
    [
      asked,
      timedOut.terminated(),
      sent.filter(([channel]) => channel === 'workerError'),
    ],
    [3, true, []]
  );

  // Counted in microtasks from the call, with the negotiation, or the talks with the players met, over at once (#503):
  //  an action waits for `pending` before it offers its own talks, inside the hold on flushes, so a link more or less
  //  on the chain moves its patch and `actionHandled` with it (`clientHandleAction.ts`, `clientTurnHandover.ts`).
  let tick = 0,
    pumping = false;

  const timeline: string[] = [],
    record = (name: string) => timeline.push(`${name}@${tick}`),
    pump = (): void => {
      if (!pumping) {
        return;
      }

      tick++;

      if (tick > 50) {
        pumping = false;

        return;
      }

      queueMicrotask(pump);
    },
    counted = (start: (talks: Talks) => void): Promise<string[]> => {
      const chained = new Talks({
        player: () => ours,
      } as unknown as TalksContext);

      Object.assign(chained, {
        handleNegotiation: async (): Promise<string> => {
          record('handleNegotiation');

          return 'the negotiation';
        },
        talkToPlayersMet: async (): Promise<void> => {
          record('talkToPlayersMet');
        },
      });

      timeline.splice(0);
      tick = 0;
      pumping = true;
      queueMicrotask(pump);

      start(chained);
      chained.pending.then((value) =>
        record(`pending settled(${String(value)})`)
      );

      return new Promise((resolve) =>
        setTimeout(() => {
          pumping = false;
          resolve(timeline.splice(0));
        })
      );
    };

  expect(
    "a Meet with King's talks are over, with nothing, for what waits for them on the 5th microtask",
    await counted((chained) => chained.meetWithKing(rival)),
    ['handleNegotiation@1', 'pending settled(undefined)@5']
  );
  expect(
    "the hand-over's talks are over, with nothing, for what waits for them on the 5th microtask",
    await counted((chained) => chained.handOver()),
    ['talkToPlayersMet@1', 'pending settled(undefined)@5']
  );

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL clientTalks (${
        failures.length
      } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS clientTalks (${checks} checks)\n`);
})().catch((error) => {
  process.stderr.write(`FAIL clientTalks: ${error?.stack ?? error}\n`);
  process.exit(1);
});
