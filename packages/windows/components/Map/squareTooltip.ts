import { GlyphName, glyph } from '@civ-clone/ui-assets/lib/glyphs';
import { TOptions, t } from 'i18next';
import {
  TooltipContent,
  TooltipText,
} from '@civ-clone/ui-component-tooltip/Tooltip';
import { Tile } from '@civ-clone/ui-protocol/types';
import { cityNameText } from '@civ-clone/ui-client/components/lib/city';
import { netTileYields } from '@civ-clone/ui-client/lib/yieldMap';
import { s } from '@dom111/element';
import { yieldIcon } from '@civ-clone/ui-city/components/lib/cityYields';

// What a map square is, as the Civilopedia and the square itself would tell you (#748): its terrain and special
//  resource, what it yields now, what it does for a unit there, what's been built on it, and the city on it or working
//  it. All of it is what the client already holds or the engine sends with the terrain (#274). Not its units: the map
//  draws the one on top, and a rival's stack says no more than that. Nor which rival city works it, which the map doesn't
//  show either: only your own.

// The tooltip sets these as text, so i18next's HTML escaping would show a name with `&` or `'` in it escaped (#704).
const text = (key: string, options: TOptions = {}): string =>
  t(key, { ...options, interpolation: { escapeValue: false } });

// A yield's icon with its name for a screen reader, as the unit card's figures have (#743), then its amount: read as
//  "Food: 2".
const iconed = (icon: Element, name: string, value: string): HTMLElement => {
  const element = s(
    '<span class="yield-amount"><span class="visually-hidden"></span></span>'
  );

  element.firstElementChild!.textContent = text('SquareTooltip.named', {
    name,
  });
  element.prepend(icon);
  element.append(value);

  return element;
};

// A unit's figure on the square, then its glyph, as `2 »`: the row's label names it, so the glyph is decorative.
const stat = (value: string, name: GlyphName): TooltipText => {
  const element = s('<span class="yield-amount"></span>');

  element.append(value, s(glyph(name)));

  return element;
};

/** Whether a square has a tooltip at all: not one you've never seen. */
export const hasSquareTooltip = (tile: Tile): boolean =>
  tile.terrain._ !== 'Unknown';

export const squareTooltip = (
  tile: Tile,
  playerId: string | null
): TooltipContent => {
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
      text('SquareTooltip.defence'),
      stat(
        text('SquareTooltip.defence-bonus', { bonus: terrain.defence - 1 }),
        'stat-defence'
      ),
    ]);
  }

  if (terrain.movementCost !== undefined && terrain.movementCost !== null) {
    rows.push([
      text('SquareTooltip.movement-cost'),
      stat(
        text('SquareTooltip.value', { value: terrain.movementCost }),
        'stat-moves'
      ),
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
  } else if (tile.workedBy && tile.workedBy.player.id === playerId) {
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
