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
  GameSetupPreset,
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
import { t } from 'i18next';

// Which game a new game is (#668): civ.one's own rules, or another game's, drawn with that game's art where the player
//  has imported it from their own copy (Civ2's), and otherwise with civ.one's own pixel art. The worker says which sets
//  there are; the page says which art it has, and offers a set that needs art once some of it is there. With nothing
//  more to offer than the default, New Game asks nothing more than it always has.

/** The games New Game offers, and the set the worker has fixed already, if any. */
export type GameChoices = {
  /** The default set first, then each set with some of its art here. One game means nothing to choose. */
  games: PluginSetOption[];
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

/** What New Game offers, from the worker's answer: the default, then the sets drawn with art of their own. */
export const gameChoices = ({
  sets,
  default: defaultSet,
  chosen,
}: PluginSetsAnswer): GameChoices => ({
  games: [
    ...sets.filter(({ id }) => id === defaultSet),
    ...sets.filter(({ id, tileset }) => id !== defaultSet && tileset !== null),
  ],
  default: defaultSet,
  chosen,
});

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

  setRuleSetTileset(tileset);
};

/** A game's name, from the translations: its set's id where it has none. */
export const gameName = (id: string): string =>
  t(`PluginSet.${id}`, { defaultValue: id });

/**
 * The grid a game with `game` is played on: its art pack's, when it has one of its own (Civ2's isometric grid), or null
 *  for one played on whatever grid the player picks.
 */
export const gameGrid = (
  game: Pick<PluginSetOption, 'tileset'> | undefined
): TopologyId | null =>
  game?.tileset === null || game?.tileset === undefined
    ? null
    : ((bundledTilesets().find(({ id }) => id === game.tileset)?.grid ??
        null) as TopologyId | null);

/**
 * Makes the worker's set `id` before anything is asked of it. A worker that has fixed another set is replaced with a new
 *  one, as plugins can't be unloaded (`ReplaceableTransport`); one that hasn't fixed any is told which, unless it is the
 *  default, which the setup's first question loads as it always has.
 */
export const playGame = async (
  transport: Transport,
  id: string,
  choices: Pick<GameChoices, 'default' | 'chosen'> &
    Partial<Pick<GameChoices, 'games'>>
): Promise<void> => {
  // Its map drawn with the art its rule set names, when it names some (#1063, decision 2 of docs/asset-library.md).
  setRuleSetTileset(
    choices.games?.find((game) => game.id === id)?.tileset ?? null
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

/** The game to preselect: the one chosen last on this page, while it is still one to choose, or the default. */
export const preselectedGame = (choices: GameChoices, asked?: string): string =>
  [asked, choices.chosen].find(
    (id) => id != null && choices.games.some((game) => game.id === id)
  ) ?? choices.default;

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
    return requestSetupData(transport);
  }

  const choices = await askGameChoices(transport),
    id = preselectedGame(choices, preset.pluginSet);

  await playGame(transport, id, choices);

  // The game's own world sizes (#1175), asked for only here, where there can be another game to play: the default's
  //  rules (Civ1's) offer none.
  const [data, worldSizes] = await Promise.all([
    requestSetupData(transport),
    transport.request(new WorldSizes()),
  ]);

  return choices.games.length < 2
    ? { ...data, worldSizes }
    : {
        ...data,
        worldSizes,
        game: {
          id,
          games: choices.games.map(({ id }) => id),
          grid: gameGrid(choices.games.find((game) => game.id === id)),
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
