// The victim's answer to an espionage incident under a treaty (M2d part 2, #1007): civ2-diplomacy keeps the offer
//  (`INCIDENT_OFFERED`) when a person is the victim, and the person may take it, going to war or ending the alliance
//  (`incidentOfferAccepted`), or let it pass (`incidentOfferDeclined`). The original asks at once; so does the client.

import {
  TreatyLevel,
  treatyLevel,
} from '@civ-clone/base-diplomacy/lib/treatyLevel';
import {
  incidentOfferAccepted,
  incidentOfferDeclined,
} from '@civ-clone/civ2-diplomacy/lib/espionage';
import { Game } from '@civ-clone/core-game/Game';
import Player from '@civ-clone/core-player/Player';
import { WorkerRules } from '@civ-clone/ui-worker-client/workerRules';
import { defaultGame } from '@civ-clone/core-game/defaultGame';
import dependenciesOf from '@civ-clone/civ2-diplomacy/lib/dependenciesOf';

export const incidentOffer = (
  game: Game = defaultGame
): NonNullable<WorkerRules['incidentOffer']> => ({
  // civ2-diplomacy's `espionageIncident` tells its outcome: `offered` when the victim is a person under a treaty.
  event: 'civ2-diplomacy:espionage-incident',
  offer: (perpetrator: Player, victim: Player, outcome: string) =>
    outcome !== 'offered'
      ? null
      : {
          perpetrator,
          victim,
          alliance:
            treatyLevel(
              { interactionRegistry: game.interactions },
              victim,
              perpetrator
            ) === TreatyLevel.Alliance,
        },
  accept: (perpetrator: Player, victim: Player): void => {
    incidentOfferAccepted(dependenciesOf(game), perpetrator, victim);
  },
  decline: (perpetrator: Player, victim: Player): void =>
    incidentOfferDeclined(dependenciesOf(game), perpetrator, victim),
});

export default incidentOffer;
