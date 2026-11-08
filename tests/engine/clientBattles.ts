// Battles' sounds (src/js/Engine/Client/battleEvents.ts, #126), checked with stand-in units, a stand-in view and a stub
//  transport: in the player's own battles, the winner's sound in the version for how it went for the player; in
//  anyone else's, the attacker's in the version for how it went for the attacker, and only where one of the player's
//  units sees either side. Each defeat is heard once, though `unit:defeated` comes twice (civ-clone/civ1-city#19).

import registerBattleEvents, {
  attackSoundOf,
} from '../../src/js/Engine/Client/battleEvents';
import { BattleSound } from '@civ-clone/ui-protocol/battles';
import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import Unit from '@civ-clone/core-unit/Unit';
import { instance as additionalDataRegistryInstance } from '@civ-clone/core-data-object/AdditionalDataRegistry';

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
    process.stderr.write('FAIL clientBattles: stopped before the checks ran\n');
    process.exitCode = 1;
  }
});

const ours = { name: 'ours' },
  rival = { name: 'rival' },
  other = { name: 'other' },
  // A square next to the player's scout, one two squares off, and one out of its sight.
  nearTile = { name: 'near' },
  ringTile = { name: 'ring' },
  farTile = { name: 'far' },
  unit = (player: object, sound: string[] | null, tile: object = nearTile) =>
    ({ player: () => player, tile: () => tile, sound } as any),
  // One of the player's units, which sees the squares within its Visibility.
  scout = (visibility: number, destroyed = false) => ({
    destroyed: () => destroyed,
    visibility: () => ({ value: () => visibility }),
    tile: () => ({
      getSurroundingArea: (radius: number) => ({
        includes: (tile: object) =>
          tile === nearTile || (radius >= 2 && tile === ringTile),
      }),
    }),
  }),
  attack = (attacker: any) => ({ unit: () => attacker } as any),
  battles = (
    scouts: object[] = [scout(1)],
    soundOf: (fighter: any) => string[] | null = (fighter) => fighter.sound
  ) => {
    const sent: BattleSound[] = [],
      listeners: [string, (...args: any[]) => void][] = [],
      engine = {
        on: (event: string, listener: (...args: any[]) => void) =>
          listeners.push([event, listener]),
        off: (event: string, listener: (...args: any[]) => void) =>
          listeners.splice(
            listeners.findIndex(([e, l]) => e === event && l === listener),
            1
          ),
      },
      dispose = registerBattleEvents(
        engine as any,
        {
          view: {
            owners: () => [ours],
            owns: (player: object) => player === ours,
          },
          units: {
            getByPlayer: (player: object) => (player === ours ? scouts : []),
          },
          transport: {
            send: (channel: string, data: BattleSound) => {
              if (channel === 'battle') {
                sent.push(data);
              }
            },
          },
        } as any,
        soundOf
      ),
      defeated = (loser: any, winner: any, action?: any) =>
        listeners
          .filter(([event]) => event === 'unit:defeated')
          .forEach(([, listener]) => listener(loser, winner, action));

    return { defeated, dispose, listeners, sent };
  };

// The player's own battles: the winner's sound, won or lost as it went for the player.
{
  const { defeated, sent } = battles(),
    musketmen = unit(ours, ['gunfire']),
    legion = unit(rival, ['melee']),
    catapult = unit(ours, ['gunfire']),
    phalanx = unit(rival, ['melee']),
    knight = unit(rival, ['melee']),
    rifleman = unit(rival, ['gunfire']);

  // Our Catapult attacks and wins.
  defeated(phalanx, catapult, attack(catapult));
  // Our Musketmen attack the Knight and lose.
  defeated(musketmen, knight, attack(musketmen));
  // The Legion attacks our Musketmen and loses.
  defeated(legion, musketmen, attack(legion));
  // The Riflemen attack our Catapult and win.
  defeated(catapult, rifleman, attack(rifleman));

  expect('our battles: the winner, from our side', sent, [
    { sound: ['gunfire'], won: true },
    { sound: ['melee'], won: false },
    { sound: ['gunfire'], won: true },
    { sound: ['gunfire'], won: false },
  ]);
}

// Anyone else's: the attacker's sound, won or lost as it went for the attacker, where the player's units see either
//  side.
{
  const { defeated, sent } = battles(),
    warrior = unit(rival, ['melee']),
    tank = unit(other, ['gunfire']),
    spearman = unit(other, ['melee']),
    hidden = unit(other, ['gunfire'], farTile);

  // The rival's Warrior attacks the other's Tank and loses: still the Warrior's.
  defeated(warrior, tank, attack(warrior));
  // The other's Tank attacks the rival's Archers and wins.
  const archers = unit(rival, ['melee']);

  defeated(archers, tank, attack(tank));
  defeated(spearman, unit(rival, ['bombing', 'gunfire']), attack(spearman));
  // A Bomber attacks, and its run is heard, won.
  const bomber = unit(rival, ['bombing', 'gunfire']);

  defeated(unit(other, ['melee']), bomber, attack(bomber));
  // Neither side in sight.
  defeated(hidden, unit(rival, ['melee'], farTile), attack(hidden));
  // The attacker out of sight, its target in it.
  defeated(unit(rival, ['melee']), hidden, attack(hidden));

  expect("others' battles: the attacker, from its side, if in sight", sent, [
    { sound: ['melee'], won: false },
    { sound: ['gunfire'], won: true },
    { sound: ['melee'], won: false },
    { sound: ['bombing', 'gunfire'], won: true },
    { sound: ['gunfire'], won: true },
  ]);
}

// Sight: each of the player's units sees as far as its Visibility, and a destroyed one sees nothing.
{
  const fight = (scouts: object[], tile: object) => {
    const { defeated, sent } = battles(scouts),
      attacker = unit(rival, ['melee'], tile);

    defeated(unit(other, ['melee'], tile), attacker, attack(attacker));

    return sent.length;
  };

  expect(
    'sight: two squares off, seen by Visibility 2 only',
    [fight([scout(1)], ringTile), fight([scout(1), scout(2)], ringTile)],
    [0, 1]
  );
  expect(
    'sight: none from a destroyed unit, nor with no units',
    [fight([scout(1, true)], nearTile), fight([], nearTile)],
    [0, 0]
  );
}

// The player's own battles are heard wherever they are.
{
  const { defeated, sent } = battles([]),
    attacker = unit(ours, ['melee'], farTile);

  defeated(unit(rival, ['melee'], farTile), attacker, attack(attacker));

  expect('our battles: heard out of sight', sent, [
    { sound: ['melee'], won: true },
  ]);
}

// A battle whose sound can't be worked out is quiet, and the attack goes on.
{
  const { defeated, sent } = battles([scout(1)], () => {
      throw new Error('no sound');
    }),
    attacker = unit(ours, ['melee']),
    error = console.error;
  let thrown: unknown = null;

  console.error = () => {};

  try {
    defeated(unit(rival, ['melee']), attacker, attack(attacker));
  } catch (caught) {
    thrown = caught;
  } finally {
    console.error = error;
  }

  expect('a failure: nothing sent, nothing thrown', [sent, thrown], [[], null]);
}

// Once each, and only for a battle.
{
  const { defeated, dispose, listeners, sent } = battles(),
    attacker = unit(ours, ['melee']),
    defender = unit(rival, ['melee']),
    bystander = unit(rival, ['gunfire']);

  defeated(defender, attacker, attack(attacker));
  // The same defeat again (civ-clone/civ1-city#19).
  defeated(defender, attacker, attack(attacker));
  // Defeated some other way: no action, or one that isn't either side's attack.
  defeated(unit(rival, ['melee']), attacker);
  defeated(unit(rival, ['melee']), attacker, attack(bystander));
  // A winner without a sound (a plugin's unit).
  const mute = unit(ours, null);

  defeated(unit(rival, ['melee']), mute, attack(mute));

  expect('heard once, for battles only', sent, [
    { sound: ['melee'], won: true },
  ]);

  dispose();
  expect('disposed: no longer listening', listeners.length, 0);
}

// The sound is read from the `attackSound` registered on units, and only a list of words is taken.
{
  const fighter = Object.create(Unit.prototype) as Unit;

  expect('nothing registered: no sound', attackSoundOf(fighter), null);

  let given: unknown = ['gunfire'];

  additionalDataRegistryInstance.register(
    new AdditionalData(Unit, 'attackSound', () => {
      if (given instanceof Error) {
        throw given;
      }

      return given;
    })
  );

  expect('the words registered', attackSoundOf(fighter), ['gunfire']);

  given = 'gunfire';
  expect('a word on its own: no sound', attackSoundOf(fighter), null);

  given = [];
  expect('no words: no sound', attackSoundOf(fighter), null);

  const logged: unknown[] = [],
    error = console.error;

  given = new Error('no table');
  console.error = (...args: unknown[]) => logged.push(...args);

  try {
    expect(
      'a provider that fails: no sound, and logged',
      [attackSoundOf(fighter), logged.length],
      [null, 1]
    );
  } finally {
    console.error = error;
  }
}

finished = true;

if (failures.length > 0) {
  process.stderr.write(
    `FAIL clientBattles: ${
      failures.length
    } of ${checks} checks\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS clientBattles: ${checks} checks\n`);
