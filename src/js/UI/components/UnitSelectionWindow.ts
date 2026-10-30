import Transport from '../Transport';
import Unit from './Unit';
import { GameData, Unit as UnitData } from '../types';
import Window from './Window';
import { cityName } from './lib/city';
import { h } from '../lib/html';
import { s } from '@dom111/element';
import { t } from 'i18next';
import { instance as dataChanges } from '../lib/DataChanges';
import unitLabel from '../lib/unitLabel';

type OnComplete = (unit: UnitData) => void;

// One unit as a row (#694): its icon, its name and state, and under them the city that supports it. A free unit, such
//  as a barbarian's, has no city, so no second line.
export const unitRow = (unit: UnitData): HTMLButtonElement => {
  const row = s<HTMLButtonElement>(
      '<button type="button" class="btn-bare unit-row"><span class="text"><span class="label"></span></span></button>'
    ),
    text = row.querySelector('.text') as HTMLElement;

  // As text: these are translations and names, not markup.
  (text.querySelector('.label') as HTMLElement).textContent = unitLabel(unit);

  if (unit.city) {
    const city = s('<span class="city"></span>');

    city.textContent = cityName(unit.city);
    text.append(city);
  }

  row.prepend(new Unit(unit).element());

  return row;
};

// A unit clicked is the one chosen, awake or not: a fortified or sentried one is woken first (#482).
const build = (
  units: UnitData[],
  transport: Transport,
  choose: OnComplete
): HTMLDivElement =>
  s(
    '<div class="unit-rows"></div>',
    ...units.map((unit: UnitData) =>
      h(unitRow(unit), {
        click: () => {
          if (!unit.active) {
            transport.send('action', {
              name: 'InactiveUnit',
              id: unit.id,
            });
          }

          choose(unit);
        },
      })
    )
  );

export class UnitSelectionWindow extends Window {
  #unwatch: () => void;

  constructor(
    units: UnitData[],
    transport: Transport,
    onComplete: OnComplete = () => {}
  ) {
    super(t('UnitSelectionWindow.title'), s('<div></div>'), {
      classes: 'unit-selection-window',
    });

    const unitIds = units.map((unit) => unit.id),
      // The window has done its job once a unit is chosen (#482).
      choose = (unit: UnitData): void => {
        onComplete(unit);

        this.close();
      };

    // Wakes on the render after any of the units shown changes or is removed (#344), and redraws those still in the
    //  player's list, closing when none are.
    this.#unwatch = dataChanges.watch(
      () => unitIds,
      (data: GameData) => {
        const updatedUnits = ((data.player?.units ?? []) as UnitData[]).filter(
          (unit: UnitData) => unitIds.includes(unit.id)
        );

        if (!updatedUnits.length) {
          this.close();

          return;
        }

        this.update(build(updatedUnits, transport, choose));
      }
    );

    this.update(build(units, transport, choose));
  }

  close() {
    this.#unwatch();

    super.close();
  }
}

export default UnitSelectionWindow;
