import Request from '../Request';

// The AI clients a computer seat can be given (#604): the class names registered with core-ai-client, the host's
//  default first.
export class AIClients extends Request<[null], string[]> {
  constructor() {
    super('aiClients', null);
  }
}

export default AIClients;
