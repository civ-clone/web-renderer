// A seat's choices as the worker meets them (#865), moved out of the protocol, which says only what a seat is: the
//  civilization and leader it chose, resolved to classes and given to its player when the game starts.

import { RANDOM, Seat } from '@civ-clone/ui-protocol/lib/seats';
import Civilization from '@civ-clone/core-civilization/Civilization';
import { IConstructor } from '@civ-clone/core-registry/Registry';
import { Game } from '@civ-clone/core-game';
import Leader from '@civ-clone/core-civilization/Leader';
import Player from '@civ-clone/core-player/Player';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';

export type SeatGame = Pick<
  Game,
  'attributes' | 'cityNames' | 'civilizations' | 'leaders' | 'traits'
>;

/** The civilizations already chosen for a seat, shared across one game's seats so that no two choose the same. */
export type TakenCivilizations = Set<IConstructor<Civilization>>;

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
