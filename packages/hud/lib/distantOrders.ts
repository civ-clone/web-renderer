import { Tile, Unit, UnitAction } from '@civ-clone/ui-protocol/types';
import { ChoiceList, openChoice } from '../components/choiceList';
import { cityNameText } from '@civ-clone/ui-client/components/lib/city';
import { t } from 'i18next';
import { targetedActions } from '@civ-clone/ui-client/lib/unitActions';

// Where a long-range order goes (M2b): Civ2's Paradrop to any square in range, Airlift to another city. The engine
//  sends the squares each reaches (`actionTargets`), and the order is sent for the one chosen, as a move towards a
//  neighbour is.

/**
 * Lets the player click a square on the map, taking only those `accept` allows; `prompt` says what for. Calls
 *  `onPick` with the one clicked, once, and nothing if the player gives up. The map does it (`MapRenderer#pickTile`).
 */
export type PickTile = (
  accept: (tile: Tile) => boolean,
  onPick: (tile: Tile) => void,
  prompt: string
) => void;

const actionName = (name: string): string =>
  t(`Action.${name}.name`, {
    defaultValue: name,
    ns: 'unit',
    interpolation: { escapeValue: false },
  });

/**
 * Asks where `unit`'s long-range order `name` goes, then `perform`s it aimed there. When every square it reaches is a
 *  city's (an airlift), the cities are a list to choose from; otherwise the next square clicked on the map that it
 *  reaches (a paradrop), through `pickTile`. `tiles` are the world's squares, which the ids are looked up among.
 *  Returns the list, if it opened one, or `null`.
 */
export const chooseDistantTarget = (
  unit: Unit,
  name: string,
  tiles: Tile[],
  pickTile: PickTile | null,
  perform: (action: UnitAction) => void
): ChoiceList | null => {
  const ids = new Set((unit.actionTargets?.[name] ?? []).map(({ id }) => id)),
    reached = tiles.filter((tile) => ids.has(tile.id)),
    aimedAt = (tile: Tile): UnitAction | null =>
      targetedActions(unit, tile).find((action) => action._ === name) ?? null;

  if (reached.length === 0) {
    return null;
  }

  if (reached.every((tile) => tile.city !== null)) {
    const rows = reached
      .map((tile) => ({ label: cityNameText(tile.city!), value: tile.id }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return openChoice(
      t('DistantOrder.city.title', { action: actionName(name) }),
      rows,
      (chosen) => {
        const tile = reached.find((tile) => tile.id === chosen),
          action = tile ? aimedAt(tile) : null;

        if (action) {
          perform(action);
        }
      },
      { canClose: true }
    );
  }

  if (pickTile !== null) {
    pickTile(
      (tile) => ids.has(tile.id),
      (tile) => {
        const action = aimedAt(tile);

        if (action) {
          perform(action);
        }
      },
      t('DistantOrder.square.prompt', { action: actionName(name) })
    );
  }

  return null;
};

export default chooseDistantTarget;
