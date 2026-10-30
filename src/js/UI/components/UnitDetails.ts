import { Element, s } from '@dom111/element';
import { TOptions, t } from 'i18next';
import { Unit as UnitData } from '../types';
import Portal from './Portal';
import Transport from '../Transport';
import Unit from './Unit';
import UnitSelectionWindow from './UnitSelectionWindow';
import { cityName } from './lib/city';
import unitLabel from '../lib/unitLabel';

// Every string here is set as text, not markup, so i18next's HTML escaping would show a name with `&` or `'` in it as
//  `&amp;` or `&#39;` (#704).
const text = (key: string, options: TOptions = {}): string =>
  t(key, { ...options, interpolation: { escapeValue: false } });

export type UnitDetailsDeps = {
  // Opens the unit's home city, as a click on it on the map does.
  portal: Pick<Portal, 'openCity'>;
  // For the stack window, which wakes the unit chosen.
  transport: Transport;
  // Makes the unit chosen in the stack window the active one, as choosing it from the map does (#482).
  setActiveUnit: (unit: UnitData) => void;
};

// One pip a whole move, the moves left lit: a fraction of a move (a road's third) lights part of a pip.
const movePips = (unit: UnitData): HTMLElement => {
  const remaining = Math.max(unit.moves.value, 0),
    total = Math.max(Math.ceil(unit.movement.value), 0),
    pips = s('<span class="moves" role="img"></span>');

  pips.setAttribute(
    'aria-label',
    text('UnitDetails.moves', { remaining, total: unit.movement.value })
  );
  pips.title = pips.getAttribute('aria-label')!;

  for (let index = 0; index < total; index++) {
    const pip = s('<span class="pip"><span class="fill"></span></span>'),
      lit = Math.min(Math.max(remaining - index, 0), 1);

    (pip.firstElementChild as HTMLElement).style.width = `${
      Math.round(lit * 1000) / 10
    }%`;

    pips.append(pip);
  }

  return pips;
};

// Attack, defence and visibility, each a letter and its value, named in full for the tooltip and a screen reader.
const stats = (unit: UnitData): HTMLElement => {
  const row = s('<p class="stats"></p>');

  (
    [
      ['attack', 'Attack', unit.attack.value],
      ['defence', 'Defence', unit.defence.value],
      ['visibility', 'Visibility', unit.visibility.value],
    ] as [string, string, number][]
  ).forEach(([className, yieldName, value]) => {
    const stat = s(
        `<span class="stat ${className}"><abbr aria-hidden="true"></abbr><span class="visually-hidden"></span><span class="value"></span></span>`
      ),
      name = text(`Yield.${yieldName}.name`, {
        defaultValue: yieldName,
        ns: 'unit',
      });

    stat.title = name;
    stat.querySelector('abbr')!.textContent = text(`UnitDetails.${className}`);
    stat.querySelector('.visually-hidden')!.textContent = `${name}: `;
    stat.querySelector('.value')!.textContent = text('UnitDetails.value', {
      value,
    });

    row.append(stat);
  });

  return row;
};

// The square: its terrain, then its features and improvements, and where it is.
const tile = (unit: UnitData): HTMLElement => {
  const row = s('<p class="tile"></p>');

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
 * The active unit's card in the sidebar (#699): its icon, name and state, its moves as pips, its attack, defence and
 *  visibility, its home city (which opens the city), the square it's on, and the other units there, which open the
 *  stack window. With no unit active the section is hidden (#697), so the card is left empty.
 */
export class UnitDetails extends Element {
  #deps: UnitDetailsDeps;
  #shown: string | null = null;
  #unit: UnitData | null = null;

  constructor(element: HTMLElement, deps: UnitDetailsDeps) {
    super(element);

    this.#deps = deps;
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
    this.empty();

    const unit = this.#unit;

    if (unit === null) {
      return;
    }

    const header = s(
      '<div class="unit-header"><span class="label"></span></div>'
    );

    header.prepend(new Unit(unit).element());
    header.querySelector('.label')!.textContent = unitLabel(unit);

    this.append(header, movePips(unit), stats(unit));

    // A free unit has no home city, so no row for one.
    if (unit.city) {
      const city = unit.city,
        button = s<HTMLButtonElement>(
          '<button type="button" class="btn-bare home-city"></button>'
        );

      button.textContent = cityName(city);
      button.title = text('UnitDetails.home-city', { city: cityName(city) });
      button.addEventListener('click', () => this.#deps.portal.openCity(city));

      this.append(button);
    }

    this.append(tile(unit));

    const others = unit.tile.units.filter(
      (other) => other.id !== unit.id && other.player?.id === unit.player?.id
    );

    if (others.length) {
      const strip = s<HTMLButtonElement>(
        '<button type="button" class="btn-bare tile-units"><span class="visually-hidden"></span></button>'
      );

      strip.title = text('UnitDetails.tile-units', { count: others.length });
      strip.querySelector('.visually-hidden')!.textContent = strip.title;
      strip.append(...others.map((other) => new Unit(other, 1).element()));
      // The stack window, as clicking the square on the map opens it: every unit there, this one included.
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

      this.append(strip);
    }
  }
}

export default UnitDetails;
