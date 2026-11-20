import PluginSets, {
  PluginSetOption,
  PluginSetsAnswer,
} from '@civ-clone/ui-protocol/Requests/PluginSets';
import {
  bundledTilesets,
  installedTilesets,
  interfaceTileset,
  isHosted,
  setRuleSetTileset,
} from '@civ-clone/ui-assets/lib/tilesets';
import {
  GameChoice,
  GameSetupPreset,
  gameOf,
  SetupData,
  requestSetupData,
} from '@civ-clone/ui-client/lib/gameSetup';
import ChoosePluginSet from '@civ-clone/ui-protocol/Requests/ChoosePluginSet';
import WorldSizes from '@civ-clone/ui-protocol/Requests/WorldSizes';
import { TopologyId } from '@civ-clone/ui-client/lib/topologyFor';
import Transport from '@civ-clone/ui-client/Transport';
import { isReplaceable } from '@civ-clone/ui-client/ReplaceableTransport';
import NotificationWindow from '@civ-clone/ui-component-window/NotificationWindow';
import { RequestFailed } from '@civ-clone/core-data-client/AbstractTransport';
import { gameName } from './gameNames';
import { t } from 'i18next';

// Which game a new game is (#668): civ.one's own rules, or another game's, drawn with that game's art where the player
//  has imported it from their own copy (Civ2's), and otherwise with civ.one's own pixel art. The worker says which sets
//  there are; the page says which art it has, and offers a set that needs art once some of it is there. With nothing
//  more to offer than the default, New Game asks nothing more than it always has.

/** The games New Game offers, and the set the worker has fixed already, if any. */
export type GameChoices = {
  /** The default set first, then each set with some of its art here. One game means nothing to choose. */
  games: PluginSetOption[];
  /**
   * Every set the worker offers, in its order: the games, and the original rules of a game that has them beside its
   *  own (#1248), which the setup offers as that game's Original rules rather than as a game of its own.
   */
  sets: PluginSetOption[];
  default: string;
  chosen: string | null;
};

/**
 * The ids of every art pack that is installed: those imported, and those that ship with civ.one, which are installed
 *  until their sheet fails to load (`installPacks`), whether or not it has been fetched yet.
 */
export const presentTilesets = (): string[] =>
  installedTilesets().map(({ id }) => id);

/** The ids of every art pack that can be imported here, imported or not: not those that ship with civ.one. */
export const importableTilesets = (): string[] =>
  bundledTilesets()
    .filter((tileset) => !isHosted(tileset))
    .map(({ id }) => id);

/**
 * Whether there can be another game to offer: once there is art beyond the interface's, which every game has, as a
 *  game that needs art of its own is drawn with another game's (Civ2's, imported) or civ.one's own isometric pixel art,
 *  which ships with it (#1063). Until then, nothing is asked of the worker, and nothing has been chosen there, so New
 *  Game, Earth and the setup go on as they always have.
 */
export const mayOfferOtherGames = (): boolean =>
  installedTilesets().some((tileset) => tileset.id !== interfaceTileset().id);

/**
 * What New Game offers, from the worker's answer: the default, then the sets drawn with art of their own. A set that is
 *  another's original rules (#1248) isn't a game of its own: it's offered beneath that game in the setup, so New Game
 *  offers each game once, with its enhanced rules, as every new game has been played with (the first part of #1247).
 */
export const gameChoices = ({
  sets,
  default: defaultSet,
  chosen,
}: PluginSetsAnswer): GameChoices => {
  const originals = new Set(
      sets.flatMap(({ original }) =>
        typeof original === 'string' ? [original] : []
      )
    ),
    games = sets.filter(({ id }) => !originals.has(id) || id === defaultSet);

  return {
    sets,
    games: [
      ...games.filter(({ id }) => id === defaultSet),
      ...games.filter(
        ({ id, tileset }) => id !== defaultSet && tileset !== null
      ),
    ],
    default: defaultSet,
    chosen,
  };
};

/** Asks the worker which games there are, for the art here. Loads nothing. */
export const askGameChoices = async (
  transport: Transport
): Promise<GameChoices> =>
  gameChoices(await transport.request(new PluginSets(presentTilesets())));

/**
 * Has a saved game's map drawn with the art its rule set names (`setRuleSetTileset`), as a new game with it is
 *  (`playGame`), before it loads (#1114): `pluginSet` is the set the save names, if any. The worker is asked with the
 *  art here, and names the first of the set's own it has (Civ2's, or else the isometric pixel art). Asking loads
 *  nothing. A save whose rules need art none of which is here is refused, saying which to import, as the worker says
 *  when asked as if every pack that can be imported had been: unless `retry`, given, installs some of it first, as
 *  `prepareSavedMapArt` has it try again the sheets of the art that ships which failed as the page started, and the
 *  worker is asked again. A worker that can't say leaves the map drawn with the player's choice for its grid.
 */
export const followSavedRuleSet = async (
  transport: Transport,
  pluginSet: unknown,
  retry?: () => Promise<unknown>
): Promise<void> => {
  setRuleSetTileset(null);

  if (typeof pluginSet !== 'string') {
    return;
  }

  let here: PluginSetOption | undefined, tileset: string | null;

  const ask = async (): Promise<PluginSetOption | undefined> =>
    (await transport.request(new PluginSets(presentTilesets()))).sets.find(
      ({ id }) => id === pluginSet
    );

  try {
    here = await ask();

    // None of its art here: the art that ships tried again, when it's to be, and the worker asked again if any is now.
    if (here === undefined && retry !== undefined) {
      const before = presentTilesets().join();

      await retry();

      if (presentTilesets().join() !== before) {
        here = await ask();
      }
    }

    // None of its art here, or a set never offered: which art it would be drawn with, were it imported.
    tileset =
      here !== undefined
        ? here.tileset
        : (
            await transport.request(new PluginSets(importableTilesets()))
          ).sets.find(({ id }) => id === pluginSet)?.tileset ?? null;
  } catch (error) {
    console.error(error);

    return;
  }

  if (here === undefined && tileset !== null) {
    throw new Error(
      t('SavedGame.needs-rules-art', {
        game: gameName(pluginSet),
        tileset:
          bundledTilesets().find(({ id }) => id === tileset)?.name ?? tileset,
      })
    );
  }

  // Every pack of its own here, for the save's grid's to be found among them (#1249).
  setRuleSetTileset(here === undefined ? tileset : gameTilesets(here));
};

// Named here too for what has always imported it from here.
export { gameName };

/** The art packs a game is drawn with on this page, first first: every one of its own (#1249), or, from an older worker, the one. */
export const gameTilesets = (
  game: Pick<PluginSetOption, 'tileset' | 'tilesets'> | undefined
): string[] =>
  game?.tilesets ??
  (game?.tileset === null || game?.tileset === undefined ? [] : [game.tileset]);

const gridOf = (id: string): TopologyId | null =>
  (bundledTilesets().find((tileset) => tileset.id === id)?.grid ??
    null) as TopologyId | null;

/**
 * The grid a game with `game` starts on: its first art pack's, when it has art of its own (Civ2's isometric grid), or
 *  null for one played on whatever grid the player picks.
 */
export const gameGrid = (
  game: Pick<PluginSetOption, 'tileset' | 'tilesets'> | undefined
): TopologyId | null => {
  const [first] = gameTilesets(game);

  return first === undefined ? null : gridOf(first);
};

/**
 * The grids a game with `game` can be played on (#1249): those its art packs here are for, its own first (Civ2's
 *  isometric, then the pixel art's square and hex), or null for any.
 */
export const gameGrids = (
  game: Pick<PluginSetOption, 'tileset' | 'tilesets'> | undefined
): TopologyId[] | null => {
  const ids = gameTilesets(game);

  if (ids.length === 0) {
    return null;
  }

  return ids.reduce((grids: TopologyId[], id) => {
    const grid = gridOf(id);

    return grid === null || grids.includes(grid) ? grids : [...grids, grid];
  }, []);
};

/**
 * Makes the worker's set `id` before anything is asked of it. A worker that has fixed another set is replaced with a new
 *  one, as plugins can't be unloaded (`ReplaceableTransport`); one that hasn't fixed any is told which, unless it is the
 *  default, which the setup's first question loads as it always has.
 */
export const playGame = async (
  transport: Transport,
  id: string,
  choices: Pick<GameChoices, 'default' | 'chosen'> &
    Partial<Pick<GameChoices, 'games' | 'sets'>>
): Promise<void> => {
  // Its map drawn with the art its rule set names, when it names some (#1063, decision 2 of docs/asset-library.md).
  setRuleSetTileset(
    gameTilesets(
      (choices.sets ?? choices.games)?.find((game) => game.id === id)
    )
  );

  if (
    choices.chosen === id ||
    (choices.chosen === null && id === choices.default)
  ) {
    return;
  }

  if (choices.chosen !== null) {
    if (!isReplaceable(transport)) {
      throw new Error(
        `The ${choices.chosen} rules are loaded already, and this page can't start a new worker for the ${id} rules.`
      );
    }

    transport.replace();
  }

  if (id !== choices.default) {
    await transport.request(new ChoosePluginSet(id));
  }
};

/**
 * The game to preselect: the one asked for, or the one chosen last on this page, while it is still one to choose, or
 *  the default. Among New Game's games, a game's original rules (#1248) are that game, by the set it is offered as: a
 *  save of Civ2's original rules, or its Original rules picked in the setup, starts New Game on Civilization II. The
 *  setup, among every set, keeps the set itself.
 */
export const preselectedGame = (
  choices: GameChoices,
  asked?: string,
  // What it may be: the games, as New Game asks, or every set, as the setup offers a game's original rules too.
  among: PluginSetOption[] = choices.games
): string =>
  [asked, choices.chosen]
    .flatMap((id) =>
      id == null
        ? []
        : [
            id,
            ...choices.sets
              .filter(({ original }) => original === id)
              .map(({ id }) => id),
          ]
    )
    .find((id) => among.some((game) => game.id === id)) ?? choices.default;

/**
 * The games the setup offers (#1248), from what the worker offers: each by the set its card plays (a game with
 *  original rules beside its own, by its own), and each game's original rules by its set. A set that is a game's
 *  original isn't a game of its own.
 */
export const setupGames = ({
  games,
  sets,
}: Pick<GameChoices, 'games' | 'sets'>): Pick<
  GameChoice,
  'games' | 'originals'
> => {
  const originals: { [set: string]: string } = {};

  sets.forEach(({ id, original }) => {
    if (typeof original === 'string') {
      originals[id] = original;
    }
  });

  const isOriginal = (id: string): boolean =>
    Object.values(originals).includes(id);

  return {
    games: games.map(({ id }) => id).filter((id) => !isOriginal(id)),
    originals,
  };
};

/**
 * What the game setup needs for the game `preset` names, or the one preselected (`preselectedGame`): the worker made
 *  that game's first (`playGame`), then asked what it offers. With more than one game to choose, which it is and the
 *  others there are, and the grid its games are on when it has one of its own.
 */
export const requestGameSetupData = async (
  transport: Transport,
  preset: GameSetupPreset = {}
): Promise<SetupData> => {
  if (!mayOfferOtherGames()) {
    return requestSetupData(transport, preset.ruleSetChoices);
  }

  const choices = await askGameChoices(transport),
    id = preselectedGame(choices, preset.pluginSet, choices.sets);

  await playGame(transport, id, choices);

  // The game's own world sizes (#1175), asked for only here, where there can be another game to play: the default's
  //  rules (Civ1's) offer none.
  const [data, worldSizes] = await Promise.all([
    requestSetupData(transport, preset.ruleSetChoices),
    transport.request(new WorldSizes()),
  ]);

  const { games, originals } = setupGames(choices);

  // One game, without original rules beside its own, is nothing to choose.
  return games.length < 2 && originals[gameOf({ originals }, id)] === undefined
    ? { ...data, worldSizes }
    : {
        ...data,
        worldSizes,
        game: {
          id,
          games,
          originals,
          grid: gameGrid(choices.sets.find((game) => game.id === id)),
          grids: gameGrids(choices.sets.find((game) => game.id === id)),
        },
      };
};

/**
 * The setup for another game (#668), in place of the one open (`close`): `open` asks for it and shows it. Should that
 *  fail, the setup for the game it was is opened again, with the worker put back to that game, so the player isn't left
 *  with nothing; should that fail too, the setup is closed and the player is told why (a request the worker couldn't
 *  answer has been said already, #470). The open setup is closed once, whatever happens, after the new one is open.
 */
export const switchSetupGame = async (
  open: (pluginSet: string) => Promise<unknown>,
  current: string,
  next: string,
  close: () => void
): Promise<void> => {
  let failure: unknown = null;

  for (const pluginSet of [next, current]) {
    try {
      await open(pluginSet);

      failure = null;

      break;
    } catch (error) {
      failure = error;
    }
  }

  // A setup that won't close is said in the console: the one now open is the player's.
  try {
    close();
  } catch (error) {
    console.error(error);
  }

  if (failure !== null) {
    gameFailed(failure);
  }
};

/**
 * What a game that couldn't be chosen says (#668): nothing more for a request the worker couldn't answer, which the
 *  player has been told of (#470), and why, in a window, for anything else, rather than leaving New Game with nothing
 *  open.
 */
export const gameFailed = (error: unknown): void => {
  if (error instanceof RequestFailed) {
    return;
  }

  const body = document.createElement('p');

  body.textContent = t('GameSetup.game-failed', {
    error: (error as Error)?.message ?? String(error),
  });

  new NotificationWindow(t('GameSetup.game-failed-title'), body).display();
};
