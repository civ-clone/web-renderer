import { CivilizationScore as CivilizationScoreResult } from '../reports';
import Request from '@civ-clone/core-data-client/Request';

// The player's own Civilization Score, term by term (#149).
export class CivilizationScore extends Request<
  [null],
  CivilizationScoreResult
> {
  constructor() {
    super('civilizationScore', null);
  }
}

export default CivilizationScore;
