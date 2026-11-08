// How the client refers to the game's objects in what it sends the UI (#449): pure helpers, moved out of
//  `DataTransferClient`.

import DataObject from '@civ-clone/core-data-object/DataObject';
import Player from '@civ-clone/core-player/Player';
import PlayerAction from '@civ-clone/core-player/PlayerAction';
import PlayerTile from '@civ-clone/core-player-world/PlayerTile';

// What a player's action is, which stays the same though `actions()` makes it afresh, with a new id, every time
//  (#411): what kind it is and what it acts on.
export const actionKey = (action: PlayerAction): string => {
  const value = action.value();

  return `${action.constructor.name} ${
    value instanceof DataObject ? value.id() : JSON.stringify(value ?? null)
  }`;
};

export const awaitTimeout = (delay: number, reason?: any) =>
  new Promise<void>((resolve, reject) =>
    setTimeout(() => (reason === undefined ? resolve() : reject(reason)), delay)
  );

export const referenceObject = (object: any) =>
    object instanceof DataObject
      ? {
          '#ref': object.id(),
        }
      : object,
  filterToReference =
    (...types: (new (...args: any[]) => any)[]) =>
    (object: any) =>
      types.some((Type) => object instanceof Type)
        ? referenceObject(object)
        : object,
  filterToReferenceAllExcept =
    (...types: (new (...args: any[]) => any)[]) =>
    (object: any) =>
      types.some((Type) => object instanceof Type)
        ? object
        : referenceObject(object),
  // For a payload the UI reconstitutes on its own rather than merging into the game data, so it cannot carry refs: a
  //  player or a tile says who and where, and no more (#130).
  standalone = (object: any) =>
    object instanceof Player
      ? {
          _: 'Player',
          id: object.id(),
          civilization: object.civilization(),
        }
      : object instanceof PlayerTile
      ? { _: 'PlayerTile', id: object.id(), x: object.x(), y: object.y() }
      : object;
