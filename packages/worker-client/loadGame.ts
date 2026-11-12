import AIClient from '@civ-clone/core-ai-client/AIClient';
import ChoiceMeta from '@civ-clone/core-client/ChoiceMeta';
import Client from '@civ-clone/core-client/Client';
import Difficulty from '@civ-clone/core-difficulty/Difficulty';
import Player from '@civ-clone/core-player/Player';
import { ClientDescriptor, SaveGame } from '@civ-clone/core-save-game/SaveGame';
import { Seat } from '@civ-clone/ui-protocol/lib/seats';
import { seatFromDescriptor } from '@civ-clone/ui-protocol/lib/savedSeats';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import { hydrate } from '@civ-clone/core-save-game/hydrate';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as currentPlayerRegistryInstance } from '@civ-clone/core-player/CurrentPlayerRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as turnInstance } from '@civ-clone/core-turn-based-game/Turn';
import {
  dropRepeatedContacts,
  registerDiplomacyClasses,
  stripInteractionCollaborators,
} from './diplomacy';
import { PluginManifest } from './Plugins';
import { registerBarbarianClasses } from './barbarians';
import { registerClasses } from '@civ-clone/core-save-game/registerClasses';

declare global {
  interface ChoiceMetaDataMap {
    'choose-difficulty': typeof Difficulty;
  }
}

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
 * Give every ship the game's transport and rule registries back.
 *
 * `core-unit-transport` used to save both as state, so a ship in a save made
 * before it declared them transient arrives holding plain arrays where the
 * registries should be: nothing could board or leave it, and a computer player
 * that owned one lost every turn to the throw (#228). `Game.inject` now
 * supplies them, which repairs those saves too; this is the same repair done
 * here, so it holds whichever engine a build loads with. A ship is anything
 * with the `Transport` mixin's two setters.
 */
export const restoreTransportRegistries = (game = defaultGame): void =>
  game.units.entries().forEach((unit): void => {
    const transport = unit as unknown as {
      setRuleRegistry?: (ruleRegistry: typeof game.rules) => void;
      setTransportRegistry?: (
        transportRegistry: typeof game.transports
      ) => void;
    };

    if (
      typeof transport.setRuleRegistry === 'function' &&
      typeof transport.setTransportRegistry === 'function'
    ) {
      transport.setRuleRegistry(game.rules);
      transport.setTransportRegistry(game.transports);
    }
  });

// Plugins replaced by another under a new name, and the classes renamed with them: a save made before records the old
//  ones. Diplomats meet a leader, not a king (#304, #915).
const renamedPlugins: { [plugin: string]: string } = {
    '@civ-clone/base-unit-action-meet-with-king':
      '@civ-clone/base-unit-action-meet-with-leader',
  },
  renamedClasses: { [type: string]: string } = {
    MeetWithKing: 'MeetWithLeader',
  };

/**
 * Name the plugins and classes a save records as the ones that replaced them.
 *
 * A save lists every plugin its game was played with, and `hydrate` refuses one that names a plugin not loaded, so
 *  renaming a plugin would leave every save made before it unloadable, as #304's rename did (#915). Its id counters are
 *  by class name too: carried over, so the renamed class goes on from where the old one was.
 */
export const renameRetiredPlugins = (file: SaveGame): void => {
  // Neither is checked here: a file without them is `hydrate`'s to refuse, saying why.
  const plugins = file.engine?.plugins ?? {},
    idCounters = file.idCounters ?? {};

  Object.entries(renamedPlugins).forEach(([from, to]) => {
    if (!(from in plugins)) {
      return;
    }

    if (!(to in plugins)) {
      plugins[to] = plugins[from]!;
    }

    delete plugins[from];
  });

  Object.entries(renamedClasses).forEach(([from, to]) => {
    if (!(from in idCounters)) {
      return;
    }

    idCounters[to] = Math.max(idCounters[to] ?? 0, idCounters[from]!);

    delete idCounters[from];
  });
};

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
  // Each player's client, from the seat the save records for it (#608): a computer seat with the host's default AI
  //  for a player the file lists no client for.
  createClient: (player: Player, seat: Seat) => Client,
  // The plugins the game is played with, its set's (#668), which the save's own manifest is checked against (#825).
  manifest: PluginManifest
): void => {
  // Before hydrating, and before any player claims a civilisation: `civ1-player`
  // unregisters one as it is claimed, so a registry read afterwards is missing
  // every civilisation in the game.
  registerClasses(defaultGame);
  registerDiplomacyClasses(defaultGame);
  registerBarbarianClasses(defaultGame);

  engine.registerPlugins(manifest);

  renameRetiredPlugins(file);
  stripInteractionCollaborators(file, defaultGame);
  dropRepeatedContacts(file, defaultGame);

  hydrate(file, defaultGame);

  releaseTilesOfDestroyedCities(defaultGame);
  restoreTransportRegistries(defaultGame);

  const seats = new Map<string, Seat>(
    file.clients.map((descriptor: ClientDescriptor): [string, Seat] => [
      descriptor.playerId,
      seatFromDescriptor(descriptor),
    ])
  );

  defaultGame.players.entries().forEach((player: Player): void => {
    clientRegistryInstance.register(
      createClient(player, seats.get(player.id()) ?? { kind: 'computer' })
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
    // Saved after the game ended at the end of a turn, before the players chose to keep playing: it waits there
    //  again (#176).
    if (defaultGame.gameResult.pending()) {
      engine.emit('turn:wait');

      return;
    }

    engine.emit('turn:start', turnInstance.value());

    return;
  }

  clientRegistryInstance
    .getByPlayer(currentPlayer)
    .takeTurn()
    .catch((error: Error) => console.error(error))
    .finally((): void => engine.emit('player:turn-end', currentPlayer));
};

/**
 * Give a game saved before there were difficulty levels one (#173).
 *
 * The person playing is asked, with the levels the rules offer. With nobody playing (the load suites and harnesses)
 * it takes the easiest, Chieftain, whose research costs are the closest to what those games were played with. Either
 * way the level is set in the game, so the next save carries it.
 */
export const chooseDifficulty = async (game = defaultGame): Promise<void> => {
  if (game.difficulty.get() !== null) {
    return;
  }

  const levels = game.availableDifficulties.sorted(),
    human = game.clients
      .entries()
      .find((client: Client): boolean => !(client instanceof AIClient));

  if (levels.length === 0) {
    return;
  }

  game.difficulty.set(
    human
      ? await human.chooseFromList(new ChoiceMeta(levels, 'choose-difficulty'))
      : levels[0]!
  );
};

export const loadGame = async (
  file: SaveGame,
  createClient: (player: Player, seat: Seat) => Client,
  manifest: PluginManifest,
  // Once the game is back and before it moves: an observer (#607) sends its first view from here.
  beforeResume: () => void = () => {}
): Promise<void> => {
  restoreGame(file, createClient, manifest);

  await chooseDifficulty(defaultGame);

  beforeResume();

  resumeGame();
};

export default loadGame;
