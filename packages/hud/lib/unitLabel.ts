import { TOptions, t } from 'i18next';
import { Unit } from '@civ-clone/ui-protocol/types';

// Every string here is set as text, not markup, so i18next's HTML escaping would show a name with `&` or `'` in it as
//  `&amp;` or `&#39;` (#704).
const text = (key: string, options: TOptions = {}): string =>
  t(key, { ...options, interpolation: { escapeValue: false } });

/** The unit's name, as its type is translated: `Musketman`. */
export const unitName = (unit: Pick<Unit, '_'>): string =>
  text(`${unit._}.name`, {
    defaultValue: unit._,
    ns: 'unit',
  });

// Improvements the engine keeps on a unit as marks for its rules, not as anything it has earned or is doing (M2b):
//  that it moved this turn (for healing), its turns out of fuel (`Aloft`, which the card shows as fuel), and that it
//  has paradropped this turn.
export const hiddenMarks: readonly string[] = [
  'Aloft',
  'MovedThisTurn',
  'Paradropped',
];

/**
 * What the unit is doing and what it has earned, each once (#694): its activity (`Sleeping`, `Building road`), then
 *  its improvements (`Fortified`, `Veteran`), in the order the engine sends them, less the rules' marks
 *  (`hiddenMarks`).
 */
export const unitStates = (
  unit: Pick<Unit, 'busy' | 'improvements'>
): string[] => {
  const states = [
    ...(unit.busy
      ? [
          text(`Busy.${unit.busy._}.name`, {
            defaultValue: unit.busy._,
            ns: 'unit',
          }),
        ]
      : []),
    ...unit.improvements
      .filter((improvement) => !hiddenMarks.includes(improvement._))
      .map((improvement) =>
        text(`Improvement.${improvement._}.name`, {
          defaultValue: improvement._,
          ns: 'unit',
        })
      ),
  ];

  return states.filter((state, index) => states.indexOf(state) === index);
};

/**
 * The unit's name, then its state in brackets: `Musketman (Fortified, Veteran)` (#694). The stack window and the active
 *  unit's card both say it this way (#699). As text, for `textContent`.
 */
export const unitLabel = (
  unit: Pick<Unit, '_' | 'busy' | 'improvements'>
): string => {
  const states = unitStates(unit);

  return text('UnitLabel.label', {
    unit: unitName(unit),
    states,
    context: states.length ? 'state' : undefined,
  });
};

export default unitLabel;
