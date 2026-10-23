import Civilization from '@civ-clone/core-civilization/Civilization';
import { IConstructor } from '@civ-clone/core-registry/Registry';
import { Game } from '@civ-clone/core-game';
import Leader from '@civ-clone/core-civilization/Leader';
import Player from '@civ-clone/core-player/Player';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';

/** The choice that leaves a civilization or leader to be asked for, or drawn, when the world is built. */
export const RANDOM = 'random';

export type SeatKind = 'human' | 'computer';

/**
 * A seat in a game being set up (#604): who plays it, and what was chosen for it before the game starts. The
 * `seats` option is a list of these, in player order.
 */
export type Seat = {
  kind: SeatKind;
  // A civilization's class name, or `random` (the default).
  civilization?: string;
  // One of that civilization's leaders, by class name, or `random` (the default).
  leader?: string;
  // A computer seat's AI client, by class name, from the AI client registry; the host's default when left out.
  ai?: string;
  // A human seat's name, for the hand-over and notifications once there can be several (#161).
  name?: string;
};

export type SeatGame = Pick<
  Game,
  'attributes' | 'cityNames' | 'civilizations' | 'leaders' | 'traits'
>;

/** The civilizations already chosen for a seat, shared across one game's seats so that no two choose the same. */
export type TakenCivilizations = Set<IConstructor<Civilization>>;

const KINDS: SeatKind[] = ['human', 'computer'];

const isSeat = (value: unknown): value is Seat =>
  typeof value === 'object' &&
  value !== null &&
  KINDS.includes((value as Seat).kind) &&
  ['civilization', 'leader', 'ai', 'name'].every(
    (key: string): boolean =>
      (value as Record<string, unknown>)[key] === undefined ||
      typeof (value as Record<string, unknown>)[key] === 'string'
  );

/**
 * The seats a game starts with: the `seats` option as given, or, without one, the `players` count as one human seat
 * followed by computer seats, which is how every game was set up before #604. A game can have no human seat.
 */
export const seatsFromOptions = (seats: unknown, players: unknown): Seat[] => {
  if (seats !== undefined && seats !== null) {
    if (!Array.isArray(seats) || seats.length === 0 || !seats.every(isSeat)) {
      throw new TypeError(
        "The 'seats' option must be a list of at least one { kind: 'human' | 'computer', … }."
      );
    }

    return seats;
  }

  const count = parseInt(String(players), 10);

  if (!(count > 0)) {
    throw new TypeError(
      `The 'players' option must be a positive number, not '${players}'.`
    );
  }

  return new Array(count).fill(0).map(
    (value: 0, index: number): Seat => ({
      kind: index === 0 ? 'human' : 'computer',
    })
  );
};

/** A seat's choices resolved to classes, checked before any player exists. */
export type SeatChoice = {
  CivilizationType: IConstructor<Civilization> | null;
  LeaderType: IConstructor<Leader> | null;
};

/**
 * Resolve the civilization, and the leader, a seat chose, or throw for a choice that can't be met: a name nothing
 * answers to, a leader without a civilization or of another one, or a civilization already chosen for a seat. `taken`
 * is shared across one game's seats. `random` or nothing leaves that choice to the `world:built` rules, which keep
 * whatever is set beforehand (civ1-player).
 */
export const resolveSeatChoice = (
  seat: Seat,
  game: SeatGame,
  taken: TakenCivilizations = new Set()
): SeatChoice => {
  const civilizationName = seat.civilization ?? RANDOM,
    leaderName = seat.leader ?? RANDOM;

  if (civilizationName === RANDOM) {
    if (leaderName !== RANDOM) {
      throw new TypeError(
        `A leader (${leaderName}) can only be chosen with a civilization.`
      );
    }

    return { CivilizationType: null, LeaderType: null };
  }

  const CivilizationType = game.civilizations
    .entries()
    .find((Available) => typeNameOf(Available) === civilizationName);

  if (!CivilizationType) {
    throw new TypeError(
      `There is no civilization called '${civilizationName}' to choose.`
    );
  }

  if (taken.has(CivilizationType)) {
    throw new TypeError(`'${civilizationName}' is chosen for two seats.`);
  }

  taken.add(CivilizationType);

  if (leaderName === RANDOM) {
    return { CivilizationType, LeaderType: null };
  }

  const LeaderType = game.leaders
    .getByCivilization(CivilizationType)
    .find((Available) => typeNameOf(Available) === leaderName);

  if (!LeaderType) {
    throw new TypeError(
      `${civilizationName} has no leader called '${leaderName}'.`
    );
  }

  return { CivilizationType, LeaderType };
};

/** Give `player` what its seat chose, as `resolveSeatChoice` resolved it. */
export const applySeatChoice = (
  player: Player,
  { CivilizationType, LeaderType }: SeatChoice,
  game: SeatGame
): void => {
  if (CivilizationType === null) {
    return;
  }

  const civilization = new CivilizationType(game.attributes, game.cityNames);

  player.setCivilization(civilization);

  if (LeaderType !== null) {
    civilization.setLeader(new LeaderType(game.traits));
  }
};
