import { City } from '../../UI/types';
import Request from '../Request';

// A city a watcher opens (#613), by its square: a city the watcher doesn't own reaches the page as a stand-in with an
//  id of its own, and its square is what both sides know it by. Answered in full, as a Diplomat's investigation is
//  sent, for the read-only city screen; `null` when there is none there to open.
export class ObserveCity extends Request<
  [{ x: number; y: number }],
  City | null
> {
  constructor(x: number, y: number) {
    super('observeCity', { x, y });
  }
}

export default ObserveCity;
