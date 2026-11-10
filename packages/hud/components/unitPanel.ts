import { Tile, Unit } from '@civ-clone/ui-protocol/types';
import Portal from '@civ-clone/ui-map/components/Portal';
import Transport from '@civ-clone/ui-client/Transport';
import { defineSlot } from '@civ-clone/ui-platform/lib/interfaceMode';

// The interface's `unitPanel` slot (#860): what shows the active unit and its actions. The classic interface has its
//  details in the sidebar and a strip of buttons at the bottom left; the modern one a card with the buttons in it
//  (#743).

export type UnitPanelDeps = {
  // Opens the unit's home city, as a click on it on the map does.
  portal: Pick<Portal, 'openCity'>;
  // For the stack window, which wakes the unit chosen.
  transport: Transport;
  // Makes the unit chosen in the stack window the active one, as choosing it from the map does (#482).
  setActiveUnit: (unit: Unit) => void;
  // A unit's action button clicked: the active unit's controller sends it, as its key would (#543).
  unitAction: (unitId: string, unitAction: string) => void;
};

export type UnitPanelAreas = {
  // The sidebar's unit section, which shows the unit.
  unitInfo: HTMLElement;
  // The strip at the bottom left, for the actions: a panel that has them elsewhere takes it out of the page.
  unitActionArea: HTMLElement;
};

export interface UnitPanel {
  /** Shows `unit`, or nothing. */
  update(unit: Unit | null): void;
  /** The actions of `unit`, standing on `tile` as the world holds it, or none. */
  actions(unit: Unit | null, tile: Tile | null): void;
  /** Stops listening, for a game that has ended. */
  dispose(): void;
}

export const unitPanel =
  defineSlot<(areas: UnitPanelAreas, deps: UnitPanelDeps) => UnitPanel>(
    'unitPanel'
  );

export default unitPanel;
