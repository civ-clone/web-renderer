import Request from '../Request';

// Every unit type the game knows, by class name.
export class CheatUnitTypes extends Request<[null], string[]> {
  constructor() {
    super('cheatUnitTypes', null);
  }
}

export default CheatUnitTypes;
