import Request from '../Request';

/** A difficulty level as the worker lists it: the class name, and where it sits, 0 being the easiest. */
export type DifficultyOption = {
  name: string;
  level: number;
};

// The difficulty levels the rules offer, easiest first (#173).
export class Difficulties extends Request<[null], DifficultyOption[]> {
  constructor() {
    super('difficulties', null);
  }
}

export default Difficulties;
