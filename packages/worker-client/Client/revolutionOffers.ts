// A revolution offered when an advance makes a government available (M2d, #1007), under rules that offer one (Civ2's:
//  civ2-government's offer, `WorkerRules.revolutionOffer`): the player is asked, the refusal first, as it costs nothing,
//  and accepting is the rule set's own (`accept`), which starts Anarchy. While automation plays the player's turns, its
//  computer player decides, as one does for itself.

import {
  ChoiceMeta,
  DataForChoiceMeta,
} from '@civ-clone/core-client/ChoiceMeta';
import AIClient from '@civ-clone/core-ai-client/AIClient';
import Engine from '@civ-clone/core-engine/Engine';
import Government from '@civ-clone/core-government/Government';
import Player from '@civ-clone/core-player/Player';
import { ClientContext, Disposer } from './ClientContext';
import { currentWorkerRules } from '../workerRules';

declare global {
  interface ChoiceMetaDataMap {
    // Whether to start a revolution, to the government named.
    'government.revolution-offer': boolean;
  }
}

export type RevolutionOfferContext = Pick<
  ClientContext,
  'view' | 'automation' | 'patches' | 'rules' | 'turn'
> & {
  // The client's own `chooseFromList`, which asks the player.
  choose: (
    meta: ChoiceMeta<'government.revolution-offer'>
  ) => Promise<DataForChoiceMeta<ChoiceMeta<'government.revolution-offer'>>>;
};

export const registerRevolutionOffers = (
  engine: Pick<Engine, 'on' | 'off'>,
  ctx: RevolutionOfferContext
): Disposer => {
  const offer = currentWorkerRules()?.revolutionOffer;

  if (!offer) {
    return () => {};
  }

  const listener = (
    player: Player,
    GovernmentType: typeof Government
  ): void => {
    if (!ctx.view.owns(player)) {
      return;
    }

    // Automation's computer player takes it as it would its own, if it takes offers at all.
    if (ctx.automation.enabled) {
      const client = ctx.automation.client as AIClient & {
        governmentAvailable?: (GovernmentType: typeof Government) => boolean;
      };

      try {
        if (client.governmentAvailable?.(GovernmentType)) {
          ctx.patches.player();
        }
      } catch (error) {
        console.error(error);
      }

      return;
    }

    ctx
      .choose(
        new ChoiceMeta([false, true], 'government.revolution-offer', {
          government: GovernmentType.name,
        } as any)
      )
      .then((accepted) => {
        if (accepted !== true) {
          return;
        }

        offer.accept(player, GovernmentType, ctx.rules);
        ctx.patches.player();
        ctx.patches.flush();
      })
      .catch((error) => console.error(error));
  };

  engine.on(offer.event, listener);

  return (): void => engine.off(offer.event, listener);
};

export default registerRevolutionOffers;
