import { CivilizationPowerRow } from '../reports';
import Request from '@civ-clone/core-data-client/Request';

// Every civilization ranked by its power, for the sidebar (#701, #708).
export class CivilizationPower extends Request<[null], CivilizationPowerRow[]> {
  constructor() {
    super('civilizationPower', null);
  }
}

export default CivilizationPower;
