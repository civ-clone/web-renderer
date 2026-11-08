import { MilitaryReport } from '../reports';
import Request from '@civ-clone/core-data-client/Request';

export class Military extends Request<[null], MilitaryReport> {
  constructor() {
    super('military', null);
  }
}

export default Military;
