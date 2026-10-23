import Request from '../Request';
import { UnavailableBuildItem } from '../lib/civilopedia';

// What a city can't build, and the ids of the rules that refuse each item (#183). The argument is the `CityBuild`'s
//  id.
export class CityBuildUnavailable extends Request<
  [string],
  UnavailableBuildItem[]
> {
  constructor(cityBuild: string) {
    super('cityBuildUnavailable', cityBuild);
  }
}

export default CityBuildUnavailable;
