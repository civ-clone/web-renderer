import Request from '@civ-clone/core-data-client/Request';

/**
 * A civilization as the worker lists it for the game setup (#604): its class name, its leaders' class names, and the
 *  colours a player of it is drawn in (#540), for the setup's swatch (#750).
 */
export type CivilizationOption = {
  name: string;
  leaders: string[];
  colours?: string[];
};

// The civilizations still to be chosen, with their leaders, in registration order.
export class Civilizations extends Request<[null], CivilizationOption[]> {
  constructor() {
    super('civilizations', null);
  }
}

export default Civilizations;
