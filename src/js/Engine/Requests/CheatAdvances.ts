import Request from '../Request';

// Every advance a player has not yet discovered, by class name. `null` means
// the local player.
export class CheatAdvances extends Request<[string | null], string[]> {
  constructor(player: string | null) {
    super('cheatAdvances', player);
  }
}

export default CheatAdvances;
