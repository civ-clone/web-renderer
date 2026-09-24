import Client from '@civ-clone/core-client/Client';
import Player from '@civ-clone/core-player/Player';
import { SaveGame } from '@civ-clone/core-save-game/SaveGame';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import { hydrate } from '@civ-clone/core-save-game/hydrate';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as currentPlayerRegistryInstance } from '@civ-clone/core-player/CurrentPlayerRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as turnInstance } from '@civ-clone/core-turn-based-game/Turn';
import {
  registerDiplomacyClasses,
  stripInteractionCollaborators,
} from './diplomacy';
import { plugins } from '../plugins';
import { registerClasses } from '@civ-clone/core-save-game/registerClasses';

/**
 * The class name `save` records for the human player's client.
 *
 * `core-save-game` writes a descriptor per client — the player's id and the
 * class that was serving them — because a client is a live connection and
 * cannot be saved. It cannot know which of them is a person; this build can,
 * because only one class ever is.
 */
export const HUMAN_CLIENT = 'DataTransferClient';

/**
 * Release any tile still worked by a destroyed city.
 *
 * `civ1-city` used to leave one behind: capturing a size 1 city destroys it,
 * and `reassign-workers` then handed it its centre back; a city later founded
 * on the site took the centre and gave the dead city the best tile left
 * instead (#4). The rules no longer do either, but saves made before that
 * still hold the tile — marked as worked by another city, and unworkable by
 * the city that is actually there — so loading one puts it right.
 */
export const releaseTilesOfDestroyedCities = (game = defaultGame): void =>
  game.workedTiles
    .filter((workedTile) => workedTile.city().destroyed())
    .forEach((workedTile) => game.workedTiles.unregister(workedTile));

/**
 * Put a saved game back into a freshly started engine.
 *
 * **Into `defaultGame`, not a new `Game`.** Rules are registered when a plugin
 * is imported, and they close over the singleton registries `defaultGame`
 * adopts — `unitRegistryInstance` and the rest. A game with registries of its
 * own would be hydrated correctly and then played by rules looking somewhere
 * else entirely. So loading needs an engine that has not started a game yet,
 * which is why the renderer hands a save to a *new* worker rather than
 * loading over the top of a running one.
 *
 * The world is never generated. `engine.start()` emits `engine:start`, which
 * processes the rules that build a world and spawn settlers; a load skips all
 * of that and puts the saved world back instead.
 *
 * ## Resuming
 *
 * `turn:start` registers every player as current and hands the first to its
 * client. That is the wrong entry point for a load: the save was taken part
 * way through a turn, and `TurnStart` rules — which reset each unit's moves
 * and collect the turn's yields — have already run for that player. Firing
 * them again would hand back the moves the player had spent.
 *
 * So this resumes from the restored `currentPlayers` registry and calls
 * `takeTurn()` directly, including the `player:turn-end` that the event
 * handler chains onto it, which is what advances to the next player. A save
 * taken between turns has an empty registry, and then `turn:start` is exactly
 * right — it is the start of a turn.
 */
export const restoreGame = (
  file: SaveGame,
  createClient: (player: Player, human: boolean) => Client
): void => {
  // Before hydrating, and before any player claims a civilisation: `civ1-player`
  // unregisters one as it is claimed, so a registry read afterwards is missing
  // every civilisation in the game.
  registerClasses(defaultGame);
  registerDiplomacyClasses(defaultGame);

  engine.registerPlugins(plugins);

  stripInteractionCollaborators(file, defaultGame);

  hydrate(file, defaultGame);

  releaseTilesOfDestroyedCities(defaultGame);

  const humanPlayerIds = new Set(
    file.clients
      .filter(({ module }) => module === HUMAN_CLIENT)
      .map(({ playerId }) => playerId)
  );

  defaultGame.players.entries().forEach((player: Player): void => {
    clientRegistryInstance.register(
      createClient(player, humanPlayerIds.has(player.id()))
    );
  });

  engine.emit('game:loaded', file.meta);
};

/**
 * Hand the turn back to whoever was taking it.
 *
 * Separate from restoring so that a caller can look at the restored game
 * before it starts moving — which is what the load suite does: the state it
 * compares against the save is the state *as loaded*, not as loaded and then
 * played a bit.
 */
export const resumeGame = (): void => {
  const [currentPlayer] = currentPlayerRegistryInstance.entries();

  if (!currentPlayer) {
    engine.emit('turn:start', turnInstance.value());

    return;
  }

  clientRegistryInstance
    .getByPlayer(currentPlayer)
    .takeTurn()
    .catch((error: Error) => console.error(error))
    .finally((): void => engine.emit('player:turn-end', currentPlayer));
};

export const loadGame = (
  file: SaveGame,
  createClient: (player: Player, human: boolean) => Client
): void => {
  restoreGame(file, createClient);
  resumeGame();
};

export default loadGame;
