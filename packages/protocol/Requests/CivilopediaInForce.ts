import { CivilopediaEffect } from '../civilopedia';
import Request from '@civ-clone/core-data-client/Request';

// The entry with save key `key`'s effects as they stand for the local player (#1310): `null` when no one is playing.
export class CivilopediaInForce extends Request<
  [string],
  CivilopediaEffect[] | null
> {
  constructor(key: string) {
    super('getCivilopediaInForce', key);
  }
}

export default CivilopediaInForce;
