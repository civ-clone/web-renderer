import AdditionalData from '@civ-clone/core-data-object/AdditionalData';
import UnitAction from '@civ-clone/core-unit/Action';
import { typeNameOf } from '@civ-clone/core-data-object/DataObject';

/**
 * The terrain a unit action will leave behind, for the buttons that show it (#348). The action classes that change the
 * terrain say so with a static `result`; this only reads it, so no ruleset is known here. `null` for every other action.
 */
export const actionResult = (): AdditionalData =>
  new AdditionalData(
    UnitAction,
    'result',
    (action: UnitAction): string | null => {
      const { result } = action.constructor as { result?: Function };

      return typeof result === 'function'
        ? typeNameOf(result as { type?: string; name: string })
        : null;
    }
  );

export default actionResult;
