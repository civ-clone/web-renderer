// What a save says of its seats (#608), read on both sides: the worker makes each player's client from it, and the
//  page lists it for the person to reassign before the game goes on. Nothing here touches the engine, so the page can
//  import it.

import { ClientDescriptor, SaveGame } from '@civ-clone/core-save-game/SaveGame';
import { Seat, isSeat } from './seats';

/**
 * The class name `save` records for the human player's client.
 *
 * `core-save-game` writes a descriptor per client — the player's id and the class that was serving them — because a
 * client is a live connection and cannot be saved. It cannot know which of them is a person. A save made since #608
 * says so itself (`kind: 'human'`, and the person's name); one made before has `kind: 'ai'` throughout, and this
 * class name is what tells, since only one class ever served a person.
 */
export const HUMAN_CLIENT = 'DataTransferClient';

/** The barbarians' client (#169): their player is spawned by the rules, with no seat to show or reassign. */
export const BARBARIAN_CLIENT = 'BarbarianClient';

/** Whether a saved client was a person's: as the file says, or by class name for a file written before it could. */
export const isHumanDescriptor = ({
  kind,
  module,
}: Pick<ClientDescriptor, 'kind' | 'module'>): boolean =>
  kind === 'human' || module === HUMAN_CLIENT;

/**
 * The seat a saved client was played from: a person's, with their name, or a computer's with the AI client that
 * served it, by class name, as a seat names one (`seats.ts`). The class is what the save has of the AI package, and a
 * build without it falls back to its default (`Game.load`).
 */
export const seatFromDescriptor = (
  descriptor: Pick<ClientDescriptor, 'kind' | 'module' | 'name'>
): Seat =>
  isHumanDescriptor(descriptor)
    ? {
        kind: 'human',
        ...(descriptor.name === undefined ? {} : { name: descriptor.name }),
      }
    : { kind: 'computer', ai: descriptor.module };

/** A seat as the file has it, with the civilization and leader its player has, by class name, for the page to show. */
export type SavedSeat = {
  playerId: string;
  seat: Seat;
  civilization: string | null;
  leader: string | null;
};

type Entity = {
  id: string;
  type?: string;
  state?: { [field: string]: unknown };
};

/**
 * The seats a save has, in its players' order: every client but the barbarians', for a player the file still has,
 * with the civilization and leader from the file's entities (a `Player`'s `_civilization` is a reference to its
 * `Civilization`, whose `type` is the class, and whose `_leader` is the same again).
 */
export const savedSeats = (
  file: Pick<SaveGame, 'clients'> & {
    entities: Entity[];
    registries?: { players?: string[] };
  }
): SavedSeat[] => {
  // A file hand-edited, or not a save at all: nothing listed rather than a throw, and the worker says what it makes
  //  of it (#470).
  const clients = Array.isArray(file.clients) ? file.clients : [],
    entities = new Map<string, Entity>(
      (Array.isArray(file.entities) ? file.entities : [])
        .filter(
          (entity): entity is Entity =>
            typeof entity === 'object' &&
            entity !== null &&
            typeof entity.id === 'string'
        )
        .map((entity) => [entity.id, entity])
    ),
    players = new Set<string>(
      Array.isArray(file.registries?.players) ? file.registries!.players : []
    ),
    referenced = (value: unknown): Entity | null =>
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { $ref?: unknown }).$ref === 'string'
        ? entities.get((value as { $ref: string }).$ref) ?? null
        : null;

  return clients
    .filter(
      (descriptor) =>
        typeof descriptor === 'object' &&
        descriptor !== null &&
        typeof descriptor.playerId === 'string' &&
        descriptor.module !== BARBARIAN_CLIENT &&
        (players.size === 0 || players.has(descriptor.playerId))
    )
    .map((descriptor): SavedSeat => {
      const player = entities.get(descriptor.playerId),
        civilization = referenced(player?.state?._civilization),
        leader = referenced(civilization?.state?._leader);

      return {
        playerId: descriptor.playerId,
        seat: seatFromDescriptor(descriptor),
        civilization: civilization?.type ?? null,
        leader: leader?.type ?? null,
      };
    });
};

/** Seats reassigned on Load, by player id: only `kind`, `name` and `ai` count, as every player has its civilization. */
export type SeatChanges = { [playerId: string]: Seat };

export const isSeatChanges = (value: unknown): value is SeatChanges =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value as Record<string, unknown>).every(isSeat);
