import Request from '../Request';

export class Options extends Request<string[], { [key: string]: any }> {
  constructor() {
    super('getOptions');
  }
}

export default Options;
