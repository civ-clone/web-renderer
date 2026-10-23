// What the line along the top of the page says while the game moves on (#588): the turn that has started, and which
//  civilization is moving while the player waits. Sent as a key and its data, so the page translates it, as it does
//  every other notice. A civilization the player hasn't met is not named (#59), and the player's own turn needs no line.

import Player from '@civ-clone/core-player/Player';
import { TransportTranslatedNotice } from '../Transport';

export const turnProgress = (turn: number): TransportTranslatedNotice => ({
  key: 'Game.progress.turn',
  data: { turn },
});

export const playerProgress = (
  player: Player,
  reader: Player | null,
  hasMet: (reader: Player, player: Player) => boolean
): TransportTranslatedNotice | null => {
  if (player === reader) {
    return null;
  }

  if (reader === null || !hasMet(reader, player)) {
    return { key: 'Game.progress.unmet-player', data: {} };
  }

  return {
    key: 'Game.progress.player',
    // As a notice names it: the class name the civilization's translations are looked up by.
    data: { civilization: player.civilization().sourceClass().name },
  };
};
