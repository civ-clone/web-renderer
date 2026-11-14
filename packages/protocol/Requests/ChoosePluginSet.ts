import Request from '@civ-clone/core-data-client/Request';

// The set of plugins this worker's game is played with (#668), by id: answered with it once its plugins are loaded.
//  Refused once another set is, as plugins can't be unloaded: the page starts another worker for it.
export class ChoosePluginSet extends Request<[string], string> {
  constructor(id: string) {
    super('choosePluginSet', id);
  }
}

export default ChoosePluginSet;
