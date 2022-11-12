export interface RequestInterface<Args extends any[], Return extends any> {
  channel(): string;
}
export declare type RequestArgs<RequestType extends Request> =
  RequestType extends Request<infer Args> ? Args : never;
export declare type RequestReturn<RequestType extends Request> =
  RequestType extends Request<any[], infer Return> ? Return : never;
export declare class Request<
  Args extends any[] = any[],
  Return extends any = any
> implements RequestInterface<Args, Return>
{
  #private;
  constructor(channel: string);
  channel(): string;
}
export default Request;
