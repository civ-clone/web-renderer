// The AdditionalData providers the client's payloads carry (#449) that every rule set shares: a rule set's own come with
//  its worker rules (#865). Imported by `DataTransferClient` for its side effect, as registering them used to be part
//  of evaluating that file; `register` does it once however often it is called.

import actionResult from '../AdditionalData/actionResult';
import { instance as additionalDataRegistryInstance } from '@civ-clone/core-data-object/AdditionalDataRegistry';
import researchCosts from '../AdditionalData/researchCosts';
import tradeRoutes from '../AdditionalData/tradeRoutes';

let registered = false;

export const register = (): void => {
  if (registered) {
    return;
  }

  registered = true;

  additionalDataRegistryInstance.register(
    actionResult(),
    researchCosts(),
    tradeRoutes()
  );
};

register();

export default register;
