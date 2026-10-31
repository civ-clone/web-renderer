import { Element, s } from '@dom111/element';
import { TOptions, t } from 'i18next';
import { Unit as UnitData } from '../types';
import { unitName, unitStates } from '../lib/unitLabel';
import currentTileset, { nativeTileSize } from '../lib/tilesets';
import Unit from './Unit';
import { UnitDetailsDeps } from './UnitDetails';
import UnitSelectionWindow from './UnitSelectionWindow';
import { cityName } from './lib/city';
import glyph, { GlyphName } from '../lib/glyphs';
import statPill from './lib/StatPill';

// Every string here is set as text, not markup, so i18next's HTML escaping would show a name with `&` or `'` in it as
//  `&amp;` or `&#39;` (#704).
const text = (key: string, options: TOptions = {}): string =>
  t(key, { ...options, interpolation: { escapeValue: false } });

export type UnitCardDeps = UnitDetailsDeps;

// How many of the other units' portraits fit on a row when the card can't be measured (it's hidden): the sidebar's.
const fallbackPerRow = 6;

// The card each element shows, so a card a later game has replaced stops listening for resizes.
const cards = new WeakMap<HTMLElement, UnitCard>();

// One pip a whole move, the moves left lit: a fraction of a move (a road's third) lights part of a pip. Eight to a row,
//  however wide the card is (#717).
const movePips = (unit: UnitData): HTMLElement => {
  const remaining = Math.max(unit.moves.value, 0),
    total = Math.max(Math.ceil(unit.movement.value), 0),
    pips = s('<span class="ui-unit-card-pips" aria-hidden="true"></span>');

  for (let index = 0; index < total; index++) {
    const pip = s(
        '<span class="ui-unit-card-pip"><span class="ui-unit-card-pip-fill"></span></span>'
      ),
      lit = Math.min(Math.max(remaining - index, 0), 1);

    (pip.firstElementChild as HTMLElement).style.width = `${
      Math.round(lit * 1000) / 10
    }%`;

    pips.append(pip);
  }

  return pips;
};

const yieldName = (name: string): string =>
  text(`Yield.${name}.name`, { defaultValue: name, ns: 'unit' });

// Attack, defence, moves and visibility as pills, each with its glyph.
const stats = (unit: UnitData): HTMLElement =>
  s(
    '<div class="ui-unit-card-stats"></div>',
    ...(
      [
        ['attack', 'Attack', unit.attack.value],
        ['defence', 'Defence', unit.defence.value],
        ['moves', 'Moves', null],
        ['visibility', 'Visibility', unit.visibility.value],
      ] as [string, string, number | null][]
    ).map(([className, name, value]) =>
      statPill({
        className: `ui-unit-card-stat ${className}`,
        label: yieldName(name),
        value:
          value === null
            ? text('UnitCard.moves', {
                remaining: Math.max(unit.moves.value, 0),
                total: unit.movement.value,
              })
            : text('UnitCard.value', { value }),
        before: [s(glyph(`stat-${className}` as GlyphName))],
      })
    )
  );

// The square: its terrain, then its features and improvements, and where it is.
const tile = (unit: UnitData): HTMLElement => {
  const row = s('<p class="ui-unit-card-tile"></p>');

  row.textContent = text('UnitDetails.tile', {
    parts: [
      text(`${unit.tile.terrain._}.name`, {
        defaultValue: unit.tile.terrain._,
        ns: 'world',
      }),
      ...unit.tile.terrain.features.map((feature) =>
        text(`Feature.${feature._}.name`, {
          defaultValue: feature._,
          ns: 'world',
        })
      ),
      ...unit.tile.improvements.map((improvement) =>
        text(`Improvement.${improvement._}.name`, {
          defaultValue: improvement._,
          ns: 'world',
        })
      ),
    ],
    x: unit.tile.x,
    y: unit.tile.y,
  });

  return row;
};

const isVeteran = (unit: UnitData): boolean =>
  unit.improvements.some(({ _ }) => _ === 'Veteran');

// What the card shows, so a render that changes none of it leaves the card (and the focus in it) alone.
const shown = (unit: UnitData | null): string =>
  unit === null
    ? ''
    : JSON.stringify([
        unit.id,
        unit._,
        unit.busy?._,
        unit.improvements.map(({ _ }) => _),
        unit.moves.value,
        unit.movement.value,
        unit.attack.value,
        unit.defence.value,
        unit.visibility.value,
        unit.city?.id,
        unit.city?.name,
        unit.tile.x,
        unit.tile.y,
        unit.tile.terrain._,
        unit.tile.terrain.features.map(({ _ }) => _),
        unit.tile.improvements.map(({ _ }) => _),
        unit.tile.units.map(({ id, _, busy, improvements }) => [
          id,
          _,
          busy?._,
          improvements.map(({ _ }) => _),
        ]),
      ]);

/**
 * The active unit's card under the new interface (#743, #735): its portrait, with a mark when it's a veteran, its name,
 *  its state and home city, its attack, defence, moves and visibility as pills, its moves as pips, the square it's on,
 *  its actions (`actionArea()`, which `UnitCardActions` fills), and the other units on the square, which open the stack
 *  window. With no unit active the section is hidden (#697), so the card is left empty.
 */
export class UnitCard extends Element {
  #actions = s('<div class="ui-unit-card-actions"></div>');
  // How many portraits a row was drawn with, so a card that's wider or narrower than it was redraws them (#743).
  #drawnPerRow: number | null = null;
  #deps: UnitCardDeps;
  #shown: string | null = null;
  #unit: UnitData | null = null;

  constructor(element: HTMLElement, deps: UnitCardDeps) {
    super(element);

    this.#deps = deps;

    element.classList.add('ui-unit-card');
    element.append(this.#actions);
    cards.set(element, this);

    // The width can change after the card is drawn: the sidebar's breakpoint (#704), or a card first drawn hidden.
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((): void => {
        if (cards.get(element) !== this) {
          observer.disconnect();

          return;
        }

        if (
          this.#drawnPerRow !== null &&
          this.#perRow(nativeTileSize(currentTileset()) * 2) !==
            this.#drawnPerRow
        ) {
          this.build();
        }
      });

      observer.observe(element);
    }
  }

  /** Where the unit's actions go: kept across redraws, so they're drawn only when they change. */
  actionArea(): HTMLElement {
    return this.#actions;
  }

  /** Shows `unit`, redrawing the card only when something on it has changed. */
  update(unit: UnitData | null): void {
    const next = shown(unit);

    this.#unit = unit;

    if (next === this.#shown) {
      return;
    }

    this.#shown = next;

    this.build();
  }

  build(): void {
    const element = this.element(),
      unit = this.#unit;

    Array.from(element.children)
      .filter((child) => child !== this.#actions)
      .forEach((child) => child.remove());

    this.#drawnPerRow = null;

    if (unit === null) {
      return;
    }

    const portrait = s(
        '<span class="ui-unit-card-portrait"></span>',
        new Unit(unit).element()
      ),
      status = s('<p class="ui-unit-card-status"></p>'),
      header = s(
        '<div class="ui-unit-card-header"><div class="ui-unit-card-heading"><p class="ui-unit-card-name"></p></div></div>'
      ),
      states = unitStates(unit);

    if (isVeteran(unit)) {
      portrait.append(
        s(
          `<span class="ui-unit-card-veteran" aria-hidden="true">${glyph(
            'veteran'
          )}</span>`
        )
      );
    }

    header.prepend(portrait);
    header.querySelector('.ui-unit-card-name')!.textContent = unitName(unit);

    if (states.length) {
      const stateText = s('<span class="ui-unit-card-states"></span>');

      stateText.textContent = text('UnitCard.states', { states });
      status.append(stateText);
    }

    // A free unit has no home city, so no link to one.
    if (unit.city) {
      const city = unit.city,
        home = s<HTMLButtonElement>(
          '<button type="button" class="btn-bare ui-unit-card-home"></button>'
        );

      home.textContent = cityName(city);
      home.title = text('UnitDetails.home-city', { city: cityName(city) });
      home.addEventListener('click', () => this.#deps.portal.openCity(city));

      status.append(home);
    }

    if (status.childNodes.length) {
      header.querySelector('.ui-unit-card-heading')!.append(status);
    }

    element.insertBefore(header, this.#actions);
    element.insertBefore(stats(unit), this.#actions);
    element.insertBefore(movePips(unit), this.#actions);
    element.insertBefore(tile(unit), this.#actions);

    const others = unit.tile.units.filter(
      (other) => other.id !== unit.id && other.player?.id === unit.player?.id
    );

    if (others.length) {
      element.append(this.#others(unit, others));
    }
  }

  // The other units on the square at the portrait's size (#721), two rows at most and a "+N" for the rest, under an
  //  eyebrow of their own so they don't read as more actions. Any of them opens the stack window, as clicking the square
  //  on the map does: every unit there, this one included.
  #others(unit: UnitData, others: UnitData[]): HTMLElement {
    const strip = s<HTMLButtonElement>(
        '<button type="button" class="btn-bare ui-unit-card-others"><span class="visually-hidden"></span></button>'
      ),
      size = nativeTileSize(currentTileset()) * 2,
      perRow = this.#perRow(size),
      fits = others.length <= perRow * 2,
      drawn = fits ? others : others.slice(0, perRow * 2 - 1);

    this.#drawnPerRow = perRow;
    strip.style.setProperty('--portrait-size', `${size}px`);
    strip.title = text('UnitDetails.tile-units', { count: others.length });
    strip.querySelector('.visually-hidden')!.textContent = strip.title;
    strip.append(...drawn.map((other) => new Unit(other).element()));

    if (!fits) {
      const more = s(
        '<span class="ui-unit-card-more" aria-hidden="true"></span>'
      );

      more.textContent = text('UnitCard.more', {
        count: others.length - drawn.length,
      });

      strip.append(more);
    }

    strip.addEventListener(
      'click',
      () =>
        new UnitSelectionWindow(
          unit.tile.units.filter(
            (other) => other.player?.id === unit.player?.id
          ),
          this.#deps.transport,
          (chosen) => this.#deps.setActiveUnit(chosen)
        )
    );

    const section = s(
      '<div class="ui-unit-card-group" data-group="others"><p class="ui-unit-card-eyebrow"></p></div>',
      strip
    );

    section.querySelector('.ui-unit-card-eyebrow')!.textContent = text(
      'UnitCard.group.others'
    );

    return section;
  }

  // The portraits are a tile at the interface's scale, with the strip's gap between them.
  #perRow(size: number): number {
    const width = this.element().clientWidth,
      gap = 2;

    return width > 0
      ? Math.max(1, Math.floor((width + gap) / (size + gap)))
      : fallbackPerRow;
  }
}

export default UnitCard;
