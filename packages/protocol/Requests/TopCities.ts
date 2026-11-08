import Request from '@civ-clone/core-data-client/Request';
import { TopCitiesRow } from '../reports';

export class TopCities extends Request<[number], TopCitiesRow[]> {
  constructor(limit: number) {
    super('topCities', limit);
  }
}

export default TopCities;
