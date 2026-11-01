import ChoiceWindow, { ChoiceRow } from './ChoiceWindow';
import { GameData, Unit as UnitData } from '../types';
import Transport from '../Transport';
import Unit from './Unit';
import { cityName } from './lib/city';
import { instance as dataChanges } from '../lib/DataChanges';
import { instance as localeProvider } from '../LocaleProvider';
import { t } from 'i18next';
import unitLabel, { unitName } from '../lib/unitLabel';

type OnComplete = (unit: UnitData) => void;

/** One unit as a row (#694): its sprite in its player's colours, its name and state, its home city, and its numbers. */
export const unitRow = (unit: UnitData): ChoiceRow => ({
  value: unit.id,
  label: unitLabel(unit),
  sprite: () => new Unit(unit).element(),
  // A free unit, such as a barbarian's, has no city.
  meta: unit.city ? cityName(unit.city) : null,
  facts: [
    {
      glyph: 'stat-attack',
      label: t('ChoiceWindow.Build.attack'),
      value: localeProvider.number(unit.attack.value),
    },
    {
      glyph: 'stat-defence',
      label: t('ChoiceWindow.Build.defence'),
      value: localeProvider.number(unit.defence.value),
    },
    {
      glyph: 'stat-moves',
      label: t('ChoiceWindow.Units.moves'),
      value: t('UnitCard.moves', {
        remaining: Math.max(unit.moves.value, 0),
        total: unit.movement.value,
      }),
    },
  ],
  primary: t('ChoiceWindow.Units.activate', {
    unit: unitName(unit),
    interpolation: { escapeValue: false },
  }),
});

/**
 * The units in a stack, under the new interface (#745): each with its sprite, name and state, home city, attack,
 *  defence and moves left. The one chosen becomes the active unit, woken first if it's fortified or sentried (#482).
 *  The list follows the units while it's open (#344), and closes when none of them are left.
 */
export class UnitStackChoice extends ChoiceWindow {
  #unwatch: () => void = () => {};

  constructor(
    units: UnitData[],
    transport: Transport,
    onComplete: OnComplete = () => {}
  ) {
    const unitIds = units.map(({ id }) => id);

    let current = units;

    super(
      t('UnitSelectionWindow.title'),
      units.map(unitRow),
      (id) => {
        const unit = current.find((unit) => unit.id === id);

        if (unit === undefined) {
          return;
        }

        if (!unit.active) {
          transport.send('action', {
            name: 'InactiveUnit',
            id: unit.id,
          });
        }

        onComplete(unit);
      },
      { classes: ['unit-stack'] }
    );

    if (this.autoChosen()) {
      return;
    }

    this.#unwatch = dataChanges.watch(
      () => unitIds,
      (data: GameData) => {
        current = ((data.player?.units ?? []) as UnitData[]).filter((unit) =>
          unitIds.includes(unit.id)
        );

        if (current.length === 0) {
          this.close();

          return;
        }

        this.replaceRows(current.map(unitRow));
      }
    );
  }

  close(): void {
    this.#unwatch();

    super.close();
  }
}

export default UnitStackChoice;
