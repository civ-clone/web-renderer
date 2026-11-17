// What happened in a headless game, per player and for the game (M2e): the soak (`run.ts`) and the arena with `--set`
//  report these, so a Civ2 game can be measured as Civ1's are. Every count is read from the engine's events or its
//  state, by mechanism (a unit's type and traits, a declaration's class, a government's class), never from a rule set's
//  name, so it means the same under any set.
//
// A mechanism that doesn't exist yet in any rule set has its event in the tables below already: nothing emits it, so
//  it counts 0, and when the engine gains it, its event goes in its line (or the line's event changes) and nothing
//  else.
//
// Only listens and reads: no random number, no new entity, so a game counted plays as one that isn't. Imported only
//  once the set has loaded (`run.ts`'s `measure`, the arena with `--set`), never by the conformance run.

import Player from '@civ-clone/core-player/Player';
import Unit from '@civ-clone/core-unit/Unit';
import Detonates from '@civ-clone/base-unit-trait-detonates/Detonates';
import DiplomaticMissions from '@civ-clone/base-unit-trait-diplomatic-missions/DiplomaticMissions';
import SingleUse from '@civ-clone/base-unit-trait-single-use/SingleUse';
import TradeMissions from '@civ-clone/base-unit-trait-trade-missions/TradeMissions';
import isBarbarian from '@civ-clone/base-civilization-barbarian/isBarbarian';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as interactionRegistryInstance } from '@civ-clone/core-diplomacy/InteractionRegistry';
import { instance as playerGovernmentRegistryInstance } from '@civ-clone/core-government/PlayerGovernmentRegistry';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as spaceshipRegistryInstance } from '@civ-clone/core-spaceship/SpaceshipRegistry';

/** By the name of a class in the prototype chain, as the arena tells unit types apart. */
const isA = (value: unknown, name: string): boolean => {
  for (
    let prototype =
      value === null || value === undefined
        ? null
        : Object.getPrototypeOf(value);
    prototype !== null;
    prototype = Object.getPrototypeOf(prototype)
  ) {
    if (prototype.constructor?.name === name) {
      return true;
    }
  }

  return false;
};

const attempt = <T>(read: () => T, fallback: T): T => {
  try {
    return read();
  } catch (e) {
    return fallback;
  }
};

// The kinds of unit a city builds that are counted, each by its type or a trait its rule set gives it. A unit can be
//  of more than one kind. `missile` is a unit spent by its own attack (`SingleUse`): Civ2's Cruise Missile and Nuclear
//  Missile, which are air units too; Civ1's Nuclear isn't one, as it isn't spent that way. `nuclear` is any unit that
//  detonates (`Detonates`), Civ1's Nuclear included.
const UNIT_KINDS: [kind: string, is: (unit: Unit) => boolean][] = [
  ['air', (unit) => isA(unit, 'Air')],
  ['naval', (unit) => isA(unit, 'Naval')],
  ['missile', (unit) => unit.hasTrait(SingleUse)],
  ['nuclear', (unit) => unit.hasTrait(Detonates)],
  // Caravans and Freight.
  ['trade', (unit) => unit.hasTrait(TradeMissions)],
  // Diplomats and Spies.
  ['agent', (unit) => unit.hasTrait(DiplomaticMissions)],
];

// The treaties counted as they are made, by the declaration's class: a war declared, a ceasefire, a peace and an
//  alliance agreed.
const TREATIES = ['ceasefire', 'peace', 'alliance', 'war'] as const;

type Treaty = (typeof TREATIES)[number];

// The order a declaration is matched in, by its class or a base of it: an `Alliance` extends `Peace`, so it comes first.
//  A `ShamPeace` (a peace one side means to drop) is a declaration of its own, and isn't counted.
const MATCH_ORDER: Treaty[] = ['alliance', 'ceasefire', 'peace', 'war'];

const TREATY_CLASSES: { [treaty in Treaty]: string } = {
  ceasefire: 'Ceasefire',
  peace: 'Peace',
  alliance: 'Alliance',
  war: 'War',
};

// Counts a player's event moves, by the player it names. One line per counter.
const PLAYER_EVENTS: [
  counter: string,
  event: string,
  playerOf: (...args: any[]) => Player | null
][] = [
  // A government that fell into Anarchy by itself (disorder under a Democracy).
  ['governmentCollapses', 'player:government:collapsed', (player) => player],
  ['spaceshipParts', 'player:spaceship:part-built', (player) => player],
  ['spaceshipArrivals', 'player:spaceship:landed', (player) => player],
  // The barbarian leaders a player captured and was paid for.
  ['ransomsReceived', 'barbarians:ransom', (player) => player],
  // A destroyed civilization brought back.
  ['respawned', 'player:respawned', (player) => player],
];

// Counts for the game, one per event. Civil war (#125) and global warming (#365) are in no rule set yet, so nothing
//  emits their events.
const GAME_EVENTS: [counter: string, event: string][] = [
  ['barbarianRaidsAtSea', 'barbarians:raiders-at-sea'],
  ['barbarianUprisings', 'barbarians:uprising'],
  ['barbarianLandings', 'barbarians:landed'],
  ['barbarianRansoms', 'barbarians:ransom'],
  ['civilWars', 'player:civil-war'],
  ['globalWarmings', 'world:global-warming'],
  ['nuclearMeltdowns', 'city:nuclear-meltdown'],
  ['respawns', 'player:respawned'],
];

export type PlayerCounts = {
  id: string;
  civilization: string;
  barbarian: boolean;
  // Turns started under each government, by its class name.
  governmentTurns: { [government: string]: number };
  // Every change of government, and those into Anarchy (a revolution, or a collapse).
  governmentChanges: number;
  revolutions: number;
  // Treaties the player was party to as they were made.
  treaties: { [treaty in Treaty]: number };
  // Units its cities built, in all and by kind.
  unitsBuilt: number;
  unitsBuiltByKind: { [kind: string]: number };
  apolloBuilt: number;
  wondersBuilt: number;
  // Its ships launched, and those that arrived, read from the spaceships at the end.
  spaceshipsLaunched: number;
  spaceshipsArrived: number;
  // Its cities barbarians took.
  citiesTakenByBarbarians: number;
  // And `PLAYER_EVENTS`' counters.
  [counter: string]: unknown;
};

export type GameCounts = {
  players: PlayerCounts[];
  // `GAME_EVENTS`' counters, and the treaties made and the barbarians' cities taken, each counted once.
  game: { [counter: string]: number };
};

export type Counting = {
  /** The counts so far for `player`, or `null` for one never seen. */
  of(player: Player): PlayerCounts | null;
  /** Everything counted so far: every player ever seen, barbarians included. */
  report(): GameCounts;
};

/** Starts counting: called once the set has loaded, before the game starts. */
export const startCounting = (): Counting => {
  const counts = new Map<Player, PlayerCounts>(),
    game: { [counter: string]: number } = {
      ...Object.fromEntries(GAME_EVENTS.map(([counter]) => [counter, 0])),
      ...Object.fromEntries(TREATIES.map((treaty) => [treaty, 0])),
      citiesTakenByBarbarians: 0,
    },
    countsOf = (player: Player | null | undefined): PlayerCounts | null => {
      if (!(player instanceof Player)) {
        return null;
      }

      if (!counts.has(player)) {
        counts.set(player, {
          id: player.id(),
          civilization: 'unknown',
          barbarian: false,
          governmentTurns: {},
          governmentChanges: 0,
          revolutions: 0,
          treaties: { ceasefire: 0, peace: 0, alliance: 0, war: 0 },
          unitsBuilt: 0,
          unitsBuiltByKind: Object.fromEntries(
            UNIT_KINDS.map(([kind]) => [kind, 0])
          ),
          apolloBuilt: 0,
          wondersBuilt: 0,
          spaceshipsLaunched: 0,
          spaceshipsArrived: 0,
          citiesTakenByBarbarians: 0,
          ...Object.fromEntries(PLAYER_EVENTS.map(([counter]) => [counter, 0])),
        });
      }

      return counts.get(player)!;
    };

  // Each player's government at each turn's start.
  engine.on('turn:start', (): void => {
    playerRegistryInstance.entries().forEach((player: Player): void => {
      const government = attempt(
        () =>
          playerGovernmentRegistryInstance.getByPlayer(player).current()
            ?.constructor.name ?? null,
        null
      );

      if (government === null) {
        return;
      }

      const entry = countsOf(player)!;

      entry.governmentTurns[government] =
        (entry.governmentTurns[government] ?? 0) + 1;
    });
  });

  engine.on(
    'player:government:changed',
    (player: Player, government: unknown): void => {
      const entry = countsOf(player);

      // A player's first government, set as it joins the game, before any turn of theirs has started, isn't a change.
      if (!entry || Object.keys(entry.governmentTurns).length === 0) {
        return;
      }

      entry.governmentChanges += 1;

      if (isA(government, 'Anarchy')) {
        entry.revolutions += 1;
      }
    }
  );

  // Treaties as they are made: the registry is wrapped on this instance, and registers exactly as it would.
  const register = interactionRegistryInstance.register.bind(
      interactionRegistryInstance
    ),
    countTreaty = (treaty: Treaty, players: Player[]): void => {
      game[treaty] += 1;

      players.forEach((player: Player): void => {
        const entry = countsOf(player);

        if (entry) {
          entry.treaties[treaty] += 1;
        }
      });
    },
    pairOf = (players: Player[]): string =>
      players
        .map((player) => player.id())
        .sort()
        .join(':'),
    // An alliance is made with a peace first, where there's none (base-diplomacy's `makeAlliance`, civ2-diplomacy's
    //  `makeTreatyPeace` then `makeAlliance`), so a peace is counted only once the call that made it is over, and not
    //  at all when an alliance between the same players came with it: that is one treaty, the alliance.
    pendingPeaces = new Map<string, Player[]>(),
    countPendingPeaces = (): void => {
      pendingPeaces.forEach((players) => countTreaty('peace', players));
      pendingPeaces.clear();
    };

  interactionRegistryInstance.register = (...interactions: any[]): void => {
    interactions.forEach((interaction): void => {
      // Most specific first: an `Alliance` is a `Peace` too.
      const treaty = MATCH_ORDER.find((candidate) =>
          isA(interaction, TREATY_CLASSES[candidate])
        ),
        players = attempt(() => interaction.players() as Player[], []);

      if (treaty === undefined) {
        return;
      }

      if (treaty === 'peace') {
        if (pendingPeaces.size === 0) {
          queueMicrotask(countPendingPeaces);
        }

        pendingPeaces.set(pairOf(players), players);

        return;
      }

      if (treaty === 'alliance') {
        pendingPeaces.delete(pairOf(players));
      }

      countTreaty(treaty, players);
    });

    return register(...interactions);
  };

  engine.on(
    'city:building-complete',
    (cityBuild: { city(): { player(): Player } }, built: unknown): void => {
      const entry = countsOf(attempt(() => cityBuild.city().player(), null));

      if (!entry || !(built instanceof Unit)) {
        return;
      }

      entry.unitsBuilt += 1;

      UNIT_KINDS.forEach(([kind, is]): void => {
        if (attempt(() => is(built), false)) {
          entry.unitsBuiltByKind[kind] += 1;
        }
      });
    }
  );

  engine.on(
    'wonder:built',
    (built: unknown, city: { player(): Player }): void => {
      const entry = countsOf(attempt(() => city.player(), null));

      if (!entry) {
        return;
      }

      entry.wondersBuilt += 1;

      if (isA(built, 'ApolloProgram')) {
        entry.apolloBuilt += 1;
      }
    }
  );

  engine.on(
    'city:captured',
    (city: unknown, capturingPlayer: Player, previousPlayer: Player): void => {
      if (!isBarbarian(capturingPlayer)) {
        return;
      }

      game.citiesTakenByBarbarians += 1;

      const entry = countsOf(previousPlayer);

      if (entry) {
        entry.citiesTakenByBarbarians += 1;
      }
    }
  );

  PLAYER_EVENTS.forEach(([counter, event, playerOf]): void =>
    engine.on(event, (...args: any[]): void => {
      const entry = countsOf(attempt(() => playerOf(...args), null));

      if (entry) {
        (entry[counter] as number) += 1;
      }
    })
  );

  GAME_EVENTS.forEach(([counter, event]): void =>
    engine.on(event, (): void => {
      game[counter] += 1;
    })
  );

  // Barbarians that came out of a hut.
  game.barbarianHuts = 0;

  engine.on(
    'goody-hut:action-performed',
    (goodyHut: unknown, action: unknown): void => {
      if (isA(action, 'Barbarians')) {
        game.barbarianHuts += 1;
      }
    }
  );

  // What is read only at the end: who each player is, and their spaceships.
  const settle = (player: Player, entry: PlayerCounts): PlayerCounts => {
    const ships = attempt(
      () => spaceshipRegistryInstance.getBy('player', player),
      []
    );

    return {
      ...entry,
      civilization: attempt(
        () => player.civilization().constructor.name,
        entry.civilization
      ),
      barbarian: attempt(() => isBarbarian(player), entry.barbarian),
      spaceshipsLaunched: ships.filter((ship) => ship.launched() !== false)
        .length,
      spaceshipsArrived: ships.filter((ship) => ship.successful() === true)
        .length,
    };
  };

  return {
    of: (player: Player): PlayerCounts | null => {
      countPendingPeaces();

      return counts.has(player) ? settle(player, counts.get(player)!) : null;
    },
    report: (): GameCounts => {
      countPendingPeaces();

      // Every player still in the game, whether or not anything happened to them.
      playerRegistryInstance.entries().forEach((player) => countsOf(player));

      return {
        players: [...counts.entries()].map(([player, entry]) =>
          settle(player, entry)
        ),
        game: { ...game },
      };
    },
  };
};

export default startCounting;
