import { CivilizationScoresRow } from '../lib/civilizationScores';
import Request from '../Request';

// Every civilization's score, ranked, for the sidebar (#701).
export class CivilizationScores extends Request<
  [null],
  CivilizationScoresRow[]
> {
  constructor() {
    super('civilizationScores', null);
  }
}

export default CivilizationScores;
