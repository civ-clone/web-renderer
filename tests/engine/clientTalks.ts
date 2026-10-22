// Talks with another player (#449), checked with a stub transport, the real `PlayerPatches` and an empty rule registry,
//  in which every negotiation is over at its first step: gold given or taken in the talks is sent once they are over,
//  as nothing else would send it (#492), whether the talks end or fail.

import ActionsState from '../../src/js/Engine/Client/ActionsState';
import { DataFilter } from '../../src/js/Engine/Client/visibilityFilter';
import { Gold } from '@civ-clone/civ1-city/Yields';
import Player from '@civ-clone/core-player/Player';
import PlayerPatches from '../../src/js/Engine/Client/PlayerPatches';
import PlayerResearch from '@civ-clone/core-science/PlayerResearch';
import PlayerTreasury from '@civ-clone/core-treasury/PlayerTreasury';
import RuleRegistry from '@civ-clone/core-rule/RuleRegistry';
import Talks, { TalksContext } from '../../src/js/Engine/Client/Talks';
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
