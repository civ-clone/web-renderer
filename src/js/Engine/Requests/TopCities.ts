import Request from '../Request';
import { TopCitiesRow } from '../lib/topCities';

export class TopCities extends Request<[number], TopCitiesRow[]> {
  constructor(limit: number) {
    super('topCities', limit);
  }
}

export default TopCities;
