import Request from '../Request';

/** A civilization as the worker lists it for the game setup (#604): its class name, and its leaders' class names. */
export type CivilizationOption = {
  name: string;
  leaders: string[];
};

// The civilizations still to be chosen, with their leaders, in registration order.
export class Civilizations extends Request<[null], CivilizationOption[]> {
  constructor() {
    super('civilizations', null);
  }
}

export default Civilizations;
