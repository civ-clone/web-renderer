import {
  PlayerResearchRegistry,
  instance as playerResearchRegistryInstance,
} from '@civ-clone/core-science/PlayerResearchRegistry';
import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import type { Era } from '@civ-clone/ui-worker-client/workerRules';
import Player from '@civ-clone/core-player/Player';
import type { TiersGame } from '@civ-clone/civ1-enhanced/lib/advanceTiers';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
// The function alone: the package's index registers civ1-enhanced's rules, which a plain Civ1 game doesn't have.
import latestTier from '@civ-clone/civ1-enhanced/lib/latestTier';

/**
 * The era each of civ1-enhanced's research tiers draws a city in (D9), by the tier's index: its eight ages
 *  (`Ages`) folded into the six the map draws, its Electric age with the Industrial and its Space age with the Modern.
 */
const tierEras: Era[] = [
  'ancient',
  'classical',
  'medieval',
  'renaissance',
  'industrial',
  'industrial',
  'modern',
  'modern',
];

/**
 * The age `player` is in, which the map draws their cities in (D9): the latest research tier they know an advance of,
 *  as civ1-enhanced's ages and research costs reckon it, whether those are switched on or not.
 */
export const era = (
  player: Player,
  game: TiersGame = defaultGame,
  playerResearchRegistry: PlayerResearchRegistry = playerResearchRegistryInstance
): Era => {
  try {
    return tierEras[
      Math.min(
        latestTier(game, playerResearchRegistry.getByPlayer(player)),
        tierEras.length - 1
      )
    ];
  } catch {
    // A player with no research yet, as one is while it's added.
    return 'ancient';
  }
};

/** `era` for your own player: a rival's goes on its stand-in (`WorkerRules.era`). */
export const eraData = (): AdditionalData =>
  new AdditionalData(Player, 'era', (player: Player): Era => era(player));

export default eraData;
