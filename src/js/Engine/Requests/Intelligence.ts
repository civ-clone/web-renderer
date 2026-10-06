import { IntelligenceRow } from '../lib/intelligence';
import Request from '../Request';

export class Intelligence extends Request<[null], IntelligenceRow[]> {
  constructor() {
    super('intelligence', null);
  }
}

export default Intelligence;
