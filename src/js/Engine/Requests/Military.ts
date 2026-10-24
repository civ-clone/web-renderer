import { MilitaryReport } from '../lib/military';
import Request from '../Request';

export class Military extends Request<[null], MilitaryReport> {
  constructor() {
    super('military', null);
  }
}

export default Military;
