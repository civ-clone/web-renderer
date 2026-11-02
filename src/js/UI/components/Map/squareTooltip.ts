import { GlyphName, glyph } from '../../lib/glyphs';
import { TOptions, t } from 'i18next';
import { TooltipContent, TooltipText } from '../lib/Tooltip';
import { Tile } from '../../types';
import { cityNameText } from '../lib/city';
import { netTileYields } from '../../lib/yieldMap';
import { s } from '@dom111/element';
import { yieldIcon } from '../lib/cityYields';

// What a map square is, as the Civilopedia and the square itself would tell you (#748): its terrain and special
//  resource, what it yields now, what it does for a unit there, what's been built on it, and the city on it or working
//  it. All of it is what the client already holds or the engine sends with the terrain (#274). Not its units: the map
//  draws the one on top, and a rival's stack says no more than that.

// The tooltip sets these as text, so i18next's HTML escaping would show a name with `&` or `'` in it escaped (#704).
const text = (key: string, options: TOptions = {}): string =>
  t(key, { ...options, interpolation: { escapeValue: false } });

// An icon with its name for a screen reader, as the unit card's figures have (#743), then `value` if there is one.
const iconed = (
  icon: Element,
  name: string,
  value: string | null = null
): HTMLElement => {
  const element = s(
    '<span class="yield-amount"><span class="visually-hidden"></span></span>'
  );

  // With a figure after it, read as "Food: 2".
  element.firstElementChild!.textContent =
    value === null ? name : text('SquareTooltip.named', { name });
  element.prepend(icon);

  if (value !== null) {
    element.append(value);
  }

  return element;
};

const stat = (name: GlyphName, label: string): TooltipText =>
  iconed(s(glyph(name)), label);

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
          ? s(
              '<span class="tooltip-amounts"></span>',
              ...yields.flatMap(({ _, value }, index) => [
                // Between them, for a screen reader: "Food: 2, Trade: 1".
                ...(index > 0
                  ? [s('<span class="visually-hidden">, </span>')]
                  : []),
                iconed(
                  yieldIcon(_),
                  text(`${_}.name`, { defaultValue: _, ns: 'yield' }),
                  text('SquareTooltip.value', { value })
                ),
              ])
            )
          : '–',
      ],
    ];

  if (terrain.defence !== undefined && terrain.defence > 1) {
    rows.push([
      stat('stat-defence', text('SquareTooltip.defence')),
      text('SquareTooltip.defence-bonus', { bonus: terrain.defence - 1 }),
    ]);
  }

  if (terrain.movementCost !== undefined && terrain.movementCost !== null) {
    rows.push([
      stat('stat-moves', text('SquareTooltip.movement-cost')),
      text('SquareTooltip.value', { value: terrain.movementCost }),
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
