import { BuildItem } from '../../UI/types';
import Request from '../Request';

// What a city can build, for the production picker (#324). It is not sent with every `CityBuild` any more: working it
//  out for every city on every patch was most of the patch. The argument is the `CityBuild`'s id.
export class CityBuildAvailable extends Request<[string], BuildItem[]> {
  constructor(cityBuild: string) {
    super('cityBuildAvailable', cityBuild);
  }
}

export default CityBuildAvailable;
