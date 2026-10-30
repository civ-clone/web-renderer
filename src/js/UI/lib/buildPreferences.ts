import Transport from '../Transport';
import { instance as options } from '../GameOptionsRegistry';

// The player's build options (#690, #691), sent to the game, whose rules act on them: as a game starts or loads, and
//  whenever one changes.
export const sendBuildPreferences = (transport: Transport): void =>
  transport.send('buildPreferences', {
    firstBuild: options.get('newCitiesBuildDefender', false) === true,
    repeat: options.get('keepBuildingMilitaryUnits', false) === true,
  });

export default sendBuildPreferences;
