import prepareStart from '@civ-clone/ui-client/lib/startPreparation';
import {
  WorldSize,
  defaultWorldSize,
  earthWorldSizes,
  playerCounts,
  ruleWorldSizes,
  worldSizes,
  worldSizesFor,
} from '@civ-clone/ui-client/lib/worldSizes';
import {
  difficultyLabels,
  difficultyName,
  preselectedDifficulty,
  rememberDifficulty,
} from '@civ-clone/ui-client/lib/difficulty';
import { ChoiceRow } from '@civ-clone/ui-component-choice-window/ChoiceWindow';
import Difficulties from '@civ-clone/ui-protocol/Requests/Difficulties';
import WorldSizes from '@civ-clone/ui-protocol/Requests/WorldSizes';
import Request from '@civ-clone/core-data-client/Request';
import { TopologyId } from '@civ-clone/ui-client/lib/topologyFor';
import Transport from '@civ-clone/ui-client/Transport';
import { openChoice } from '@civ-clone/ui-hud/components/choiceList';
import supportedTopologies from '@civ-clone/ui-map/lib/supportedTopologies';
import { t } from 'i18next';
import { unlessRequestFailed } from '@civ-clone/ui-client/lib/unlessRequestFailed';
import {
  askGameChoices,
  gameFailed,
  gameGrid,
  mayOfferOtherGames,
  playGame,
  preselectedGame,
} from '../lib/pluginSets';
import { gameTitle } from '../lib/gameNames';
import {
  LastNewGame,
  lastNewGame,
  rememberNewGame,
} from '@civ-clone/ui-client/lib/lastNewGame';

// New Game (#1247): which game, each started as it was last time, after the difficulty level (#173), or Customise… for
//  the game setup. Play Earth asks each question in turn (#745): which game, once there is more than one to play
//  (#668), how big a world, the difficulty level, then how many civilizations (#55). Each is over everything else, and
//  Cancel or Escape backs out.

export type FinishedHandler = () => void;

/** The game setup, for a game (`pluginSet`, a set's id), or the one chosen last, or the default, as Customize… opens it. */
export type CustomiseHandler = (pluginSet?: string) => void;

/**
 * Which game (#668): civ.one's own, or another game's rules (Civ2's), drawn with that game's art where the player has
 *  imported it and otherwise with civ.one's isometric pixel art. With only one game to play, nothing is asked. The
 *  worker plays the game chosen from then on, a new worker if it had another loaded already, and `onChoose` is told the
 *  grid that game is played on, or null for one on any.
 */
export const askGame = (
  transport: Transport,
  onChoose: (pluginSet: string | undefined, grid: TopologyId | null) => void
): void => {
  // Without art for another game there's none to offer, and nothing to ask the worker: the default it is.
  if (!mayOfferOtherGames()) {
    onChoose(undefined, null);

    return;
  }

  askGameChoices(transport)
    .then((choices) => {
      const play = (id: string): void => {
        playGame(transport, id, choices)
          .then(() =>
            onChoose(id, gameGrid(choices.games.find((game) => game.id === id)))
          )
          // Not answered, the player has been told (#580); anything else is said: nothing more is asked.
          .catch(gameFailed);
      };

      if (choices.games.length < 2) {
        play(choices.default);

        return;
      }

      ask(
        t('NewGameWindow.game'),
        // Each game by its card's title in the setup (#1248).
        choices.games.map(({ id }) => ({ label: gameTitle(id), value: id })),
        preselectedGame(choices),
        play
      );
    })
    .catch(unlessRequestFailed);
};

const ask = (
  title: string,
  rows: ChoiceRow[],
  chosen: string | null,
  onChoose: (value: string) => void,
  plainLabel?: (row: ChoiceRow) => string
): void => {
  openChoice(title, rows, onChoose, {
    chosen,
    modal: true,
    plainIntro: t('MandatorySelection.default-body'),
    ...(plainLabel === undefined ? {} : { plainLabel }),
  });
};

/**
 * Which grid the map is on: square, isometric or hex (#89). The first question of New Game and Customize World, and
 *  fixed for the rest of the game. Only the grids that can be drawn are offered: square, isometric and hex, each with
 *  the pixel art that ships (#97, #1063). Where only one can be, the question answers itself and is
 *  never shown (#148). Earth is on its game's own grid, or else square, so it never asks.
 */
export const askMapGrid = (
  onChoose: (grid: TopologyId) => void,
  grids: TopologyId[] = supportedTopologies()
): void =>
  ask(
    t('NewGameWindow.map-grid'),
    grids.map((grid) => ({ label: t(`Grid.${grid}`) as string, value: grid })),
    // The first there is: square, whose art ships with civ.one, so there is one unless that art isn't registered.
    grids[0] ?? null,
    (selection) => onChoose(selection as TopologyId)
  );

/**
 * The difficulty level, asked after the size of the world and before the number of civilizations, as Civ1 asks it
 *  (#173). The levels come from the rules, easiest first, and the list starts on the player's last choice, or Prince.
 */
export const askDifficulty = (
  transport: Transport,
  onChoose: (difficulty: string) => void
): void => {
  transport
    .request(new Difficulties())
    .then((levels) => {
      if (levels.length === 0) {
        // Rules with no levels: there's nothing to ask.
        onChoose('');

        return;
      }

      ask(
        t('DifficultyWindow.title'),
        difficultyLabels(levels).map(({ label, value }) => ({
          label,
          value,
          primary: t('ChoiceWindow.ChooseFromList.choose-difficulty.primary', {
            choice: difficultyName(value),
            interpolation: { escapeValue: false },
          }),
        })),
        preselectedDifficulty(levels),
        (selection) => {
          rememberDifficulty(selection);

          onChoose(selection);
        }
      );
    })
    // Not answered: the player has been told, and nothing more is asked (#580).
    .catch(unlessRequestFailed);
};

// Whether a new game is on its way to starting, its options sent and its map's art perhaps being fetched (#1063): a
//  second one chosen meanwhile is left out, rather than send its options under the first's start.
let starting = false;

/**
 * How many civilizations to play with, the last question before a new game starts. `worldOptions` (the world's size,
 *  or Earth) go to the engine with the answer.
 */
export const askPlayerCount = (
  transport: Transport,
  worldOptions: { [key: string]: any },
  counts: number[],
  selected: number,
  onFinished?: FinishedHandler
): void =>
  ask(
    t('NewGameWindow.number-of-players'),
    counts.map((value) => {
      const label = t('NewGameWindow.civilizations', { count: value });

      return {
        label,
        value: String(value),
        primary: t('ChoiceWindow.NewGame.start', {
          players: label,
          interpolation: { escapeValue: false },
        }),
      };
    }),
    String(selected),
    (selection) =>
      void startNewGame(
        transport,
        { ...worldOptions, players: parseInt(selection, 10) },
        onFinished
      )
  );

/**
 * Starts a new game with `options` (the world's grid and size, or Earth, the difficulty and how many civilizations),
 *  with every rule set as it starts (#158). Resolves whether the game went ahead: not if one is starting already, if
 *  the engine didn't answer (the player has been told, and the main menu is still there, #580), or if the art its map
 *  is drawn with couldn't be fetched (#1063).
 */
export const startNewGame = async (
  transport: Transport,
  options: { [key: string]: any },
  onFinished?: FinishedHandler
): Promise<boolean> => {
  if (starting) {
    return false;
  }

  starting = true;

  try {
    try {
      await transport.request(
        new Request('setOptions', {
          ...options,
          // Every rule set as it starts (#158), whatever a game setup that was opened first, and not started, chose.
          ruleSets: [],
        })
      );
    } catch (error) {
      unlessRequestFailed(error);

      return false;
    }

    if (!(await prepareStart(options.topologyId ?? 'square'))) {
      return false;
    }

    if (onFinished) {
      await onFinished();
    }

    transport.send('start', null);

    return true;
  } finally {
    starting = false;
  }
};

/**
 * The size of the world, then the difficulty level, then how many civilizations to play with. `sizes` are the sizes
 *  to offer, and `worldOptions` go to the engine with the answers (Earth offers only the sizes it has a map for, and
 *  adds `earth`).
 */
export const askWorldSize = (
  transport: Transport,
  onFinished?: FinishedHandler,
  sizes: WorldSize[] = worldSizes,
  worldOptions: { [key: string]: any } = {}
): void => {
  // The size New Game selects, in `sizes`' own dimensions.
  const defaultSize =
    // Its callers offer at least one size.
    sizes.find(({ key }) => key === defaultWorldSize.key) ?? sizes[0]!;

  ask(
    t('NewGameWindow.world-size'),
    sizes.map(({ key, width, height }) => ({
      label: t(`NewGameWindow.WorldSize.${key}`, { width, height }) as string,
      value: key,
    })),
    defaultSize.key,
    (selection) => {
      const size = sizes.find(({ key }) => key === selection) ?? defaultSize;

      askDifficulty(transport, (difficulty) =>
        askPlayerCount(
          transport,
          {
            ...worldOptions,
            width: size.width,
            height: size.height,
            difficulty,
          },
          playerCounts(size),
          size.players,
          onFinished
        )
      );
    }
  );
};

// The New Game window's row for the game setup: not a game's set.
const customiseValue = '#customise';

/**
 * The grid a new game is on: the game's own (Civ2's), or else the one it was last started on, where that can be drawn,
 *  or else the first that can be: square, whose art ships with civ.one.
 */
export const newGameGrid = (
  own: TopologyId | null,
  last: LastNewGame,
  grids: TopologyId[] = supportedTopologies()
): TopologyId =>
  own ??
  (last.topologyId !== undefined && grids.includes(last.topologyId)
    ? last.topologyId
    : grids[0] ?? 'square');

/** The size a new game is: the one it was last started at, where it's still offered, or Normal, or the first there is. */
export const newGameSize = (sizes: WorldSize[], last: LastNewGame): WorldSize =>
  sizes.find(({ key }) => key === last.size) ??
  sizes.find(({ key }) => key === defaultWorldSize.key) ??
  // Its callers offer at least one size.
  sizes[0]!;

/** How many civilizations a new game has: as many as it last had, where `size` has room for them, or `size`'s own. */
export const newGamePlayers = (size: WorldSize, last: LastNewGame): number =>
  Math.min(
    size.maxPlayers,
    Math.max(size.minPlayers, last.players ?? size.players)
  );

/**
 * What a game will start with, said under it in New Game (#1247): "A normal world on the square grid, 7 civilizations".
 *  Before its rules are loaded its sizes aren't known, so the size is said by the page's own of that name, whose
 *  civilizations a game last started at that size has kept.
 */
export const newGameSummary = (
  own: TopologyId | null,
  last: LastNewGame
): string => {
  const size = newGameSize(worldSizes, last);

  return t('NewGameWindow.game-meta', {
    size: t(`NewGameWindow.size-name.${size.key}`, { defaultValue: size.key }),
    grid: t(`NewGameWindow.grid-name.${newGameGrid(own, last)}`),
    civilizations: t('NewGameWindow.civilizations', {
      count: newGamePlayers(size, last),
    }),
    interpolation: { escapeValue: false },
  });
};

/**
 * Starts the game chosen in New Game (#1247), whose worker has its rules (`playGame`): on its own grid, or else the one
 *  it was last started on, at the size and with as many civilizations as last time, or Normal and that size's own,
 *  after asking the difficulty (until #1246, it can't be changed once the game has started). What it started with is
 *  kept for next time. `game` is its set, or `''` for the only game there is.
 */
const startChosenGame = (
  transport: Transport,
  game: string,
  own: TopologyId | null,
  rulesKnown: boolean,
  onFinished?: FinishedHandler
): void => {
  const last = lastNewGame(game);

  const start = (topologyId: TopologyId, sizes: WorldSize[]): void => {
    const size = newGameSize(sizes, last),
      players = newGamePlayers(size, last);

    askDifficulty(transport, (difficulty) =>
      startNewGame(
        transport,
        {
          topologyId,
          width: size.width,
          height: size.height,
          difficulty,
          players,
        },
        onFinished
      ).then((started) => {
        if (started) {
          rememberNewGame(game, { topologyId, size: size.key, players });
        }
      })
    );
  };

  const onGrid = (): void => {
    const topologyId = newGameGrid(own, last);

    start(topologyId, worldSizesFor(topologyId));
  };

  // The only game there is asks nothing more of the worker than it always has.
  if (!rulesKnown) {
    onGrid();

    return;
  }

  // The game's own sizes (#1175), on their own grid: Civ2's. Rules that offer none (Civ1's) leave the page's own.
  transport
    .request(new WorldSizes())
    .then((answer) => {
      const offered = ruleWorldSizes(answer);

      if (offered === null) {
        onGrid();

        return;
      }

      start(own ?? (answer.sizes[0]!.topologyId as TopologyId), offered);
    })
    // Not answered: the player has been told (#580), and nothing more is asked.
    .catch(unlessRequestFailed);
};

/**
 * New Game (#1247): one window with each game there is to play, each with its enhanced rules, and Customise…, which
 *  opens the game setup (`customise`), where the original rules are, and everything else. Choosing a game starts it, as
 *  it was last started (`startChosenGame`), each saying beneath it what that is. With only the one game, it's still
 *  offered beside Customise…, and nothing is asked of the worker.
 */
export const askNewGame = (
  transport: Transport,
  onFinished?: FinishedHandler,
  customise: CustomiseHandler | null = null
): void => {
  const open = (
    games: { id: string; own: TopologyId | null }[],
    chosen: string | null,
    onGame: (id: string) => void
  ): void =>
    ask(
      t('NewGameWindow.game'),
      [
        ...games.map(({ id, own }) => {
          const label =
            id === '' ? t('NewGameWindow.default-game') : gameTitle(id);

          return {
            label,
            value: id,
            meta: newGameSummary(own, lastNewGame(id)),
            primary: t('NewGameWindow.play', {
              game: label,
              interpolation: { escapeValue: false },
            }),
          };
        }),
        // The game setup, for everything else, last.
        ...(customise === null
          ? []
          : [
              {
                label: t('NewGameWindow.customize') as string,
                value: customiseValue,
                meta: t('NewGameWindow.customize-meta') as string,
              },
            ]),
      ],
      chosen,
      (selection) => {
        if (selection === customiseValue && customise !== null) {
          customise();

          return;
        }

        onGame(selection);
      },
      // A list of one line each says what each game starts with on that line.
      ({ label, value, meta }) =>
        value === customiseValue || !meta
          ? label
          : t('NewGameWindow.game-line', {
              game: label,
              summary: meta,
              interpolation: { escapeValue: false },
            })
    );

  // Without art for another game there's none to offer, and nothing to ask the worker: the default it is.
  if (!mayOfferOtherGames()) {
    open([{ id: '', own: null }], '', () =>
      startChosenGame(transport, '', null, false, onFinished)
    );

    return;
  }

  askGameChoices(transport)
    .then((choices) =>
      open(
        choices.games.map(({ id }) => ({
          id,
          own: gameGrid(choices.games.find((game) => game.id === id)),
        })),
        preselectedGame(choices),
        (id) =>
          playGame(transport, id, choices)
            .then(() =>
              startChosenGame(
                transport,
                id,
                gameGrid(choices.games.find((game) => game.id === id)),
                true,
                onFinished
              )
            )
            // Not answered, the player has been told (#580); anything else is said: nothing more is asked.
            .catch(gameFailed)
      )
    )
    .catch(unlessRequestFailed);
};

/**
 * A new game on Earth: the same questions as New Game, offering only the sizes there is an Earth map for. Which game
 *  first, when there is more than one to play (#1176): civ.one's own, whose Earth is Civ1's, on the square grid (#89),
 *  or another whose rules have an Earth of their own (Civ2's), on its grid, in the sizes its rules have one for.
 */
export const askEarth = (
  transport: Transport,
  onFinished?: FinishedHandler
): void => {
  const civ1Earth = (): void =>
    askWorldSize(transport, onFinished, earthWorldSizes, {
      earth: true,
      topologyId: 'square',
    });

  if (!mayOfferOtherGames()) {
    civ1Earth();

    return;
  }

  askGame(transport, (pluginSet, grid) =>
    transport
      .request(new WorldSizes())
      .then((answer) => {
        const offered = ruleWorldSizes(answer);

        // Rules with no sizes of their own (Civ1's) have the page's Earth.
        if (offered === null) {
          civ1Earth();

          return;
        }

        const sizes = offered.filter(({ earth }) => earth);

        if (sizes.length === 0) {
          gameFailed(new Error(t('NewGameWindow.no-earth')));

          return;
        }

        askWorldSize(transport, onFinished, sizes, {
          earth: true,
          topologyId: grid ?? (answer.sizes[0]!.topologyId as TopologyId),
        });
      })
      // Not answered: the player has been told, and the main menu is still there (#580).
      .catch(unlessRequestFailed)
  );
};
