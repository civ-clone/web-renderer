import {
  WorldSize,
  defaultWorldSize,
  earthWorldSizes,
  playerCounts,
  worldSizes,
  worldSizesFor,
} from '../lib/worldSizes';
import {
  difficultyLabels,
  difficultyName,
  preselectedDifficulty,
  rememberDifficulty,
} from '../lib/difficulty';
import { ChoiceRow } from './ChoiceWindow';
import Difficulties from '../../Engine/Requests/Difficulties';
import Request from '../../Engine/Request';
import { TopologyId } from '../lib/topologyFor';
import Transport from '../Transport';
import { openChoice } from './choiceList';
import supportedTopologies from '../lib/supportedTopologies';
import { t } from 'i18next';
import { unlessRequestFailed } from '../lib/unlessRequestFailed';

// The questions New Game asks, each one answered before the next (#745): which grid (#89), how big a world, the
//  difficulty level (#173), then how many civilizations (#55). Each is over everything else, and Cancel or Escape
//  backs out of New Game.

export type FinishedHandler = () => void;

const ask = (
  title: string,
  rows: ChoiceRow[],
  chosen: string,
  onChoose: (value: string) => void
): void => {
  openChoice(title, rows, onChoose, {
    chosen,
    modal: true,
    classicIntro: t('MandatorySelection.default-body'),
  });
};

/**
 * Which grid the map is on: square, isometric or hex (#89). The first question of New Game and Customize World, and
 *  fixed for the rest of the game. Only the grids that can be drawn are offered, so while that is only square the
 *  question answers itself and is never shown (#148). Earth is square, so it never asks.
 */
export const askMapGrid = (
  onChoose: (grid: TopologyId) => void,
  grids: TopologyId[] = supportedTopologies()
): void =>
  ask(
    t('NewGameWindow.map-grid'),
    grids.map((grid) => ({ label: t(`Grid.${grid}`) as string, value: grid })),
    grids[0],
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
      try {
        await transport.request(
          new Request('setOptions', {
            ...worldOptions,
            players: parseInt(selection, 10),
          })
        );
      } catch (error) {
        // Not answered: the player has been told, and the main menu is still there, with no game started (#580).
        unlessRequestFailed(error);

        return;
      }

      if (onFinished) {
        await onFinished();
      }

      transport.send('start', null);
    }
  );

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
    sizes.find(({ key }) => key === defaultWorldSize.key) ?? sizes[0];

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

/** New Game: the map's grid, then the sizes there are on it. */
export const askNewGame = (
  transport: Transport,
  onFinished?: FinishedHandler
): void =>
  askMapGrid((topologyId) =>
    askWorldSize(transport, onFinished, worldSizesFor(topologyId), {
      topologyId,
    })
  );

/**
 * A new game on Earth: the same questions as New Game, offering only the sizes there is an Earth map for. Earth's maps
 *  are square, so it never asks which grid (#89).
 */
export const askEarth = (
  transport: Transport,
  onFinished?: FinishedHandler
): void =>
  askWorldSize(transport, onFinished, earthWorldSizes, {
    earth: true,
    topologyId: 'square',
  });
