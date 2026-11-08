import { IntelligenceRow } from '../reports';
import Request from '../Request';

export class Intelligence extends Request<[null], IntelligenceRow[]> {
  constructor() {
    super('intelligence', null);
  }
}

export default Intelligence;
