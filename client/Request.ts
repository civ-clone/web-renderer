export interface RequestInterface<Args extends any[], Return extends any> {
  channel(): string;
}

export type RequestArgs<RequestType extends Request> =
  RequestType extends Request<infer Args> ? Args : never;
export type RequestReturn<RequestType extends Request> =
  RequestType extends Request<any[], infer Return> ? Return : never;

export class Request<Args extends any[] = any[], Return extends any = any>
  implements RequestInterface<Args, Return>
{
  #channel: string;

  constructor(channel: string) {
    this.#channel = channel;
  }

  channel(): string {
    return this.#channel;
  }
}

export default Request;
