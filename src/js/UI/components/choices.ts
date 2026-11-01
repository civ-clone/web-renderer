import { BuildItem, CityBuild } from '../types';
import { ActionWindowActions } from './ActionWindow';
import CityBuildChoice from './CityBuildChoice';
import CityBuildSelectionWindow from './CityBuildSelectionWindow';
import Transport from '../Transport';
import { interfaceMode } from '../lib/interfaceMode';

// Where the "pick one from a list" windows are put together (#735): the classic ones, or under the new interface the
//  ones drawn with the choice window (#745). Everything that opens one of these lists comes here.

/** What a city builds, from its screen or the turn's prompt. */
export const openCityBuild = (
  cityBuild: CityBuild,
  available: BuildItem[],
  transport: Transport,
  onComplete: (hasSelected: boolean) => void = () => {},
  additionalActions: ActionWindowActions = {}
): CityBuildSelectionWindow | CityBuildChoice =>
  interfaceMode() === 'new'
    ? new CityBuildChoice(
        cityBuild,
        available,
        transport,
        onComplete,
        additionalActions
      )
    : new CityBuildSelectionWindow(
        cityBuild,
        available,
        transport,
        onComplete,
        additionalActions
      );
