import Request from '@civ-clone/core-data-client/Request';
import { RequirementData } from '../requirements';

// Every requirement entry (#37), for the civilopedia (#183).
export class Requirements extends Request<[null], RequirementData[]> {
  constructor() {
    super('getRequirements', null);
  }
}

export default Requirements;
