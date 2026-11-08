import Request from '@civ-clone/core-data-client/Request';

export class Options<Key extends string> extends Request<
  [Key[]],
  Record<Key, any>
> {
  constructor(args: Key[]) {
    super('getOptions', args);
  }
}

export default Options;
