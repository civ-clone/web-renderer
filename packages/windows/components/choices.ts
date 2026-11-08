import {
  BuildItem,
  CityBuild,
  Unit as UnitData,
} from '@civ-clone-ui/client/types';
import { ActionWindowActions } from '@civ-clone-ui/widgets/components/ActionWindow';
import CityBuildChoice from './CityBuildChoice';
import CityBuildSelectionWindow from './CityBuildSelectionWindow';
import Transport from '@civ-clone-ui/client/Transport';
import UnitSelectionWindow from './UnitSelectionWindow';
import UnitStackChoice from './UnitStackChoice';
import { defineSlot } from '@civ-clone-ui/client/lib/interfaceMode';

// Where the "pick one from a list" windows are put together (#735): the interface's `choices` slot (#824), which each
//  interface in `interfaces/` fills (#825): the classic ones or the ones drawn with the choice window (#745). Everything that opens one of these lists comes here, or to
//  `openChoice` (`choiceList.ts`) for a list of plain rows.

export interface Choices {
  cityBuild(
    cityBuild: CityBuild,
    available: BuildItem[],
    transport: Transport,
    onComplete: (hasSelected: boolean) => void,
    additionalActions: ActionWindowActions
  ): CityBuildSelectionWindow | CityBuildChoice;
  unitSelection(
    units: UnitData[],
    transport: Transport,
    onComplete: (unit: UnitData) => void
  ): UnitSelectionWindow | UnitStackChoice;
}

export const choices = defineSlot<Choices>('choices');

/** What a city builds, from its screen or the turn's prompt. */
export const openCityBuild = (
  cityBuild: CityBuild,
  available: BuildItem[],
  transport: Transport,
  onComplete: (hasSelected: boolean) => void = () => {},
  additionalActions: ActionWindowActions = {}
): CityBuildSelectionWindow | CityBuildChoice =>
  choices
    .current()
    .cityBuild(cityBuild, available, transport, onComplete, additionalActions);

/** Which unit in a stack to make active. */
export const openUnitSelection = (
  units: UnitData[],
  transport: Transport,
  onComplete: (unit: UnitData) => void = () => {}
): UnitSelectionWindow | UnitStackChoice =>
  choices.current().unitSelection(units, transport, onComplete);
