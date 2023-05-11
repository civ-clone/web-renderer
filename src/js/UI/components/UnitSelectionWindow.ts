import Transport from '../Transport';
import Unit from './Unit';
import { City as CityData, PlainObject, Unit as UnitData } from '../types';
import Window from './Window';
import { h } from '../lib/html';
import { s } from '@dom111/element';
import { t } from 'i18next';
import DataObserver from '../DataObserver';

type OnComplete = (unit: UnitData) => void;

const build = (
  units: UnitData[],
  transport: Transport,
  onComplete: OnComplete
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

            onComplete(unit);
          }
        },
      });

      return icon;
    })
  );

export class UnitSelectionWindow extends Window {
  #dataObserver: DataObserver;

  constructor(
    units: UnitData[],
    transport: Transport,
    onComplete: OnComplete = () => {}
  ) {
    super(t('UnitSelectionWindow.title'), s('<div></div>'));

    const unitIds = units.map((unit) => unit.id);

    this.#dataObserver = new DataObserver(unitIds, (data: PlainObject) => {
      const updatedUnits = ((data.player?.units ?? []) as UnitData[]).filter(
        (unit: UnitData) => unitIds.includes(unit.id)
      );

      if (!updatedUnits.length) {
        this.close();

        return;
      }

      this.update(build(updatedUnits, transport, onComplete));
    });

    this.update(build(units, transport, onComplete));
  }

  close() {
    this.#dataObserver.dispose();

    super.close();
  }
}

export default UnitSelectionWindow;
