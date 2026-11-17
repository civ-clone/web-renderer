// A chance to answer an incident (M2d part 2, #1007), under rules that give one (Civ2's: an espionage incident under a
//  treaty, `WorkerRules.incidentOffer`): the victim is asked whether to go to war, or to end the alliance, letting it
//  pass first, as that changes nothing. While automation plays the player's turns, the offer is let pass, as no
//  computer player is ever made one.
//
// Asked when the incident happens. The rules keep the offer until it is answered, so one still open when the game is
//  saved isn't asked again after a load; a war or a treaty between the two answers it, as the rules say.

import {
  ChoiceMeta,
  DataForChoiceMeta,
} from '@civ-clone/core-client/ChoiceMeta';
import Engine from '@civ-clone/core-engine/Engine';
import Player from '@civ-clone/core-player/Player';
import { ClientContext, Disposer } from './ClientContext';
import { currentWorkerRules } from '../workerRules';

declare global {
  interface ChoiceMetaDataMap {
    // Whether to go to war over an incident.
    'diplomacy.incident-offer': boolean;
    // Whether to end an alliance over an incident.
    'diplomacy.incident-offer-alliance': boolean;
  }
}

type IncidentOfferKey =
  | 'diplomacy.incident-offer'
  | 'diplomacy.incident-offer-alliance';

export type IncidentOfferContext = Pick<
  ClientContext,
  'view' | 'automation' | 'patches'
> & {
  // The client's own `chooseFromList`, which asks the player.
  choose: (
    meta: ChoiceMeta<IncidentOfferKey>
  ) => Promise<DataForChoiceMeta<ChoiceMeta<IncidentOfferKey>>>;
};

export const registerIncidentOffers = (
  engine: Pick<Engine, 'on' | 'off'>,
  ctx: IncidentOfferContext
): Disposer => {
  const rules = currentWorkerRules()?.incidentOffer;

  if (!rules) {
    return () => {};
  }

  const listener = (...args: unknown[]): void => {
    const offer = rules.offer(...args);

    if (offer === null || !ctx.view.owns(offer.victim)) {
      return;
    }

    const { perpetrator, victim, alliance } = offer;

    if (ctx.automation.enabled) {
      rules.decline(perpetrator, victim);

      return;
    }

    ctx
      .choose(
        new ChoiceMeta(
          [false, true],
          alliance
            ? 'diplomacy.incident-offer-alliance'
            : 'diplomacy.incident-offer',
          { player: perpetrator } as any
        )
      )
      .then((accepted) => {
        if (accepted === true) {
          rules.accept(perpetrator, victim);
        } else {
          rules.decline(perpetrator, victim);
        }

        ctx.patches.player();
        ctx.patches.flush();
      })
      .catch((error) => console.error(error));
  };

  engine.on(rules.event, listener);

  return (): void => engine.off(rules.event, listener);
};

export default registerIncidentOffers;
