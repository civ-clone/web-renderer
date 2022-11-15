export interface RequestInterface<Args extends any[], Return extends any> {
  args(): Args;
  channel(): string;
}

export type RequestArgs<RequestType extends Request> =
  RequestType extends Request<infer Args> ? Args : never;
export type RequestReturn<RequestType extends Request> =
  RequestType extends Request<any[], infer Return> ? Return : never;

export class Request<Args extends any[] = any[], Return extends any = any>
  implements RequestInterface<Args, Return>
{
  #args: Args;
  #channel: string;

  constructor(channel: string, ...args: Args) {
    this.#args = args;
    this.#channel = channel;
  }

  args(): Args {
    return this.#args;
  }

  channel(): string {
    return this.#channel;
  }
}

export default Request;
