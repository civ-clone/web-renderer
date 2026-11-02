import { TOptions, t } from 'i18next';
import { Tile } from '../../types';
import { TooltipContent } from '../lib/Tooltip';
import { cityNameText } from '../lib/city';
import { netTileYields } from '../../lib/yieldMap';
import { unitName } from '../../lib/unitLabel';

// What a map square is, as the Civilopedia and the square itself would tell you (#748): its terrain and special
//  resource, what it yields now, what it does for a unit there, what's been built on it, the city on it or working it,
//  and the units on it. All of it is what the client already holds or the engine sends with the terrain (#274).

// The tooltip sets these as text, so i18next's HTML escaping would show a name with `&` or `'` in it escaped (#704).
const text = (key: string, options: TOptions = {}): string =>
  t(key, { ...options, interpolation: { escapeValue: false } });

// How many of a square's units are named before the rest are counted.
const UNITS_NAMED = 4;

/** Whether a square has a tooltip at all: not one you've never seen. */
export const hasSquareTooltip = (tile: Tile): boolean =>
  tile.terrain._ !== 'Unknown';

export const squareTooltip = (tile: Tile): TooltipContent => {
  const { terrain } = tile,
    yields = netTileYields(tile.yields ?? [])
      // Food, Production, Trade, as the map draws them.
      .sort((a, b) => a._.charCodeAt(0) - b._.charCodeAt(0)),
    rows: TooltipContent['rows'] = [
      [
        text('SquareTooltip.yields'),
        yields.length
          ? yields
              .map(({ _, value }) =>
                text('SquareTooltip.yield', {
                  value,
                  yield: text(`${_}.name`, { defaultValue: _, ns: 'yield' }),
                })
              )
              .join(' · ')
          : '–',
      ],
    ];

  if (terrain.defence !== undefined && terrain.defence > 1) {
    rows.push([
      text('SquareTooltip.defence'),
      text('SquareTooltip.defence-bonus', { bonus: terrain.defence - 1 }),
    ]);
  }

  if (terrain.movementCost !== undefined && terrain.movementCost !== null) {
    rows.push([
      text('SquareTooltip.movement-cost'),
      text('SquareTooltip.moves', { count: terrain.movementCost }),
    ]);
  }

  if (tile.improvements.length) {
    rows.push([
      text('SquareTooltip.improvements'),
      text('SquareTooltip.list', {
        items: tile.improvements.map(({ _ }) =>
          text(`Improvement.${_}.name`, { defaultValue: _, ns: 'world' })
        ),
      }),
    ]);
  }

  if (tile.city) {
    rows.push([text('SquareTooltip.city'), cityNameText(tile.city)]);
  } else if (tile.workedBy) {
    rows.push([text('SquareTooltip.worked-by'), cityNameText(tile.workedBy)]);
  }

  tile.units.slice(0, UNITS_NAMED).forEach((unit) =>
    rows.push([
      unitName(unit),
      text(`${unit.player.civilization._}.name`, {
        defaultValue: unit.player.civilization._,
        ns: 'civilization',
      }),
    ])
  );

  if (tile.units.length > UNITS_NAMED) {
    rows.push([
      text('SquareTooltip.more-units', {
        count: tile.units.length - UNITS_NAMED,
      }),
      '',
    ]);
  }

  return {
    title: text('SquareTooltip.list', {
      items: [
        text(`${terrain._}.name`, { defaultValue: terrain._, ns: 'world' }),
        ...terrain.features.map(({ _ }) =>
          text(`Feature.${_}.name`, { defaultValue: _, ns: 'world' })
        ),
      ],
    }),
    rows,
  };
};

export default squareTooltip;
