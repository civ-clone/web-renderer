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

// The questions New Game asks, each one answered before the next (#745): which game, once there is more than one to
//  play (#668), which grid (#89), how big a world, the difficulty level (#173), then how many civilizations (#55).
//  Each is over everything else, and Cancel or Escape backs out of New Game.

export type FinishedHandler = () => void;

/** The game setup, for the game chosen (`pluginSet`, a set's id, or none for the default), as Customize… opens it. */
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
  onChoose: (value: string) => void
): void => {
  openChoice(title, rows, onChoose, {
    chosen,
    modal: true,
    plainIntro: t('MandatorySelection.default-body'),
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
    async (selection) => {
      if (starting) {
        return;
      }

      starting = true;

      try {
        try {
          await transport.request(
            new Request('setOptions', {
              ...worldOptions,
              players: parseInt(selection, 10),
              // Every rule set as it starts (#158), whatever a game setup that was opened first, and not started,
              //  chose.
              ruleSets: [],
            })
          );
        } catch (error) {
          // Not answered: the player has been told, and the main menu is still there, with no game started (#580).
          unlessRequestFailed(error);

          return;
        }

        // The art its map is drawn with, which may have to be fetched (#1063): without it, the menus are still there.
        if (!(await prepareStart(worldOptions.topologyId ?? 'square'))) {
          return;
        }

        if (onFinished) {
          await onFinished();
        }

        transport.send('start', null);
      } finally {
        starting = false;
      }
    }
  );

// The world size question's row for the game setup: not a size's key.
const customiseValue = '#customise';

/**
 * The size of the world, then the difficulty level, then how many civilizations to play with. `sizes` are the sizes
 *  to offer, and `worldOptions` go to the engine with the answers (Earth offers only the sizes it has a map for, and
 *  adds `earth`).
 */
export const askWorldSize = (
  transport: Transport,
  onFinished?: FinishedHandler,
  sizes: WorldSize[] = worldSizes,
  worldOptions: { [key: string]: any } = {},
  customise: (() => void) | null = null
): void => {
  // The size New Game selects, in `sizes`' own dimensions.
  const defaultSize =
    // Its callers offer at least one size.
    sizes.find(({ key }) => key === defaultWorldSize.key) ?? sizes[0]!;

  ask(
    t('NewGameWindow.world-size'),
    [
      // The game setup, for everything these questions don't ask (#749), first and not chosen.
      ...(customise === null
        ? []
        : [
            {
              label: t('NewGameWindow.customize') as string,
              value: customiseValue,
              meta: t('NewGameWindow.customize-meta') as string,
            },
          ]),
      ...sizes.map(({ key, width, height }) => ({
        label: t(`NewGameWindow.WorldSize.${key}`, { width, height }) as string,
        value: key,
      })),
    ],
    defaultSize.key,
    (selection) => {
      if (selection === customiseValue && customise !== null) {
        customise();

        return;
      }

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

/**
 * New Game: which game, then the map's grid, unless the game has its own (Civ2's), then the sizes there are on it. With
 *  `customise`, the sizes are offered beside Customise…, which opens the game setup for the game chosen instead
 *  (#749).
 */
export const askNewGame = (
  transport: Transport,
  onFinished?: FinishedHandler,
  customise: CustomiseHandler | null = null
): void =>
  askGame(transport, (pluginSet, grid) => {
    const sizes = (
      topologyId: TopologyId,
      offered: WorldSize[] = worldSizesFor(topologyId)
    ): void =>
      askWorldSize(
        transport,
        onFinished,
        offered,
        {
          topologyId,
        },
        customise === null ? null : () => customise(pluginSet)
      );

    const onGrid = (): void => {
      if (grid !== null) {
        sizes(grid);

        return;
      }

      askMapGrid(sizes);
    };

    // The default game, with nothing else to play, asks nothing more of the worker than it always has.
    if (pluginSet === undefined) {
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

        sizes(grid ?? (answer.sizes[0]!.topologyId as TopologyId), offered);
      })
      // Not answered: the player has been told (#580), and nothing more is asked.
      .catch(unlessRequestFailed);
  });

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
