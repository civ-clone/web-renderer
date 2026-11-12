import { WondersRow } from '../reports';
import Request from '@civ-clone/core-data-client/Request';

export class Wonders extends Request<[null], WondersRow[]> {
  constructor() {
    super('wonders', null);
  }
}

export default Wonders;
