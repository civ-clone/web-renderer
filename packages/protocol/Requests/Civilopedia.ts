import { CivilopediaEntry } from '../civilopedia';
import Request from '@civ-clone/core-data-client/Request';

// Every entry the civilopedia shows, with the ids of the requirement entries about it (#183).
export class Civilopedia extends Request<[null], CivilopediaEntry[]> {
  constructor() {
    super('getCivilopedia', null);
  }
}

export default Civilopedia;
