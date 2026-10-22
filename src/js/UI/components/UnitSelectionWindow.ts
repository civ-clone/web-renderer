import Transport from '../Transport';
import Unit from './Unit';
import { GameData, Unit as UnitData } from '../types';
import Window from './Window';
import { h } from '../lib/html';
import { s } from '@dom111/element';
import { t } from 'i18next';
import { instance as dataChanges } from '../lib/DataChanges';

type OnComplete = (unit: UnitData) => void;

// A unit clicked is the one chosen, awake or not: a fortified or sentried one is woken first (#482).
const build = (
  units: UnitData[],
  transport: Transport,
  choose: OnComplete
): HTMLDivElement =>
  s(
    '<div></div>',
    ...units.map((unit: UnitData) => {
      const icon = new Unit(unit);

      h(icon.element(), {
        click: () => {
          if (!unit.active) {
            transport.send('action', {
              name: 'InactiveUnit',
              id: unit.id,
            });
          }

          choose(unit);
        },
      });

      return icon;
    })
  );

export class UnitSelectionWindow extends Window {
  #unwatch: () => void;

  constructor(
    units: UnitData[],
    transport: Transport,
    onComplete: OnComplete = () => {}
  ) {
    super(t('UnitSelectionWindow.title'), s('<div></div>'));

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
