import { Peace, War } from '@civ-clone/library-diplomacy/Declarations';
import {
  DemandTribute,
  ExchangeKnowledge,
  OfferPeace,
} from '@civ-clone/library-diplomacy/Proposals';
import Abstain from '@civ-clone/core-diplomacy/Proposal/Abstain';
import Accept from '@civ-clone/core-diplomacy/Proposal/Accept';
import Acknowledge from '@civ-clone/core-diplomacy/Proposal/Acknowledge';
import { Contact } from '@civ-clone/library-diplomacy/Interactions';
import Declaration from '@civ-clone/core-diplomacy/Declaration';
import Decline from '@civ-clone/core-diplomacy/Proposal/Decline';
import Dialogue from '@civ-clone/core-diplomacy/Negotiation/Dialogue';
import { Game } from '@civ-clone/core-game/Game';
import Initiate from '@civ-clone/core-diplomacy/Negotiation/Initiate';
import Interaction from '@civ-clone/core-diplomacy/Interaction';
import Negotiation from '@civ-clone/core-diplomacy/Negotiation';
import Never from '@civ-clone/core-diplomacy/Expiries/Never';
import { SaveGame } from '@civ-clone/core-save-game/SaveGame';
import { SaveableClass } from '@civ-clone/core-data-object/ClassRegistry';
import Terminate from '@civ-clone/core-diplomacy/Negotiation/Terminate';

/**
 * Register every diplomacy class a save can name (#80).
 *
 * A save names them from first contact onwards, and none was registered, so
 * every save made after two players met failed to load.
 *
 * The `core-diplomacy` classes are also registered by `registerClasses` from
 * `core-save-game` 0.1.8; they are here too until this build depends on it.
 * Registering the same class twice is a no-op. The rest live in `base-` and
 * `library-` packages, which `core-save-game` cannot depend on.
 */
export const registerDiplomacyClasses = (game: Game): void =>
  game.classes.register(
    ...([
      Abstain,
      Accept,
      Acknowledge,
      Declaration,
      Decline,
      Dialogue,
      Initiate,
      Negotiation,
      Never,
      Terminate,

      Contact,
      DemandTribute,
      ExchangeKnowledge,
      OfferPeace,
      Peace,
      War,
    ] as unknown as SaveableClass[])
  );

/**
 * Drop what saves made before `core-diplomacy` 0.1.6 wrote for every
 * diplomacy entity and should not have.
 *
 * `_ruleRegistry` was written as a list of every rule in the game, which was
 * two thirds of a late save's size, and `_turn` as a reference to a `Turn`
 * that would load as a stale counter. Both are supplied by the loading game,
 * so removing them loses nothing.
 *
 * The `Turn` itself goes too: nothing else refers to one, and no class is
 * registered to load it.
 */
export const stripInteractionCollaborators = (
  file: SaveGame,
  game: Game
): void => {
  file.entities.forEach(({ type, state }): void => {
    const Type = game.classes.get(type) as unknown as Function | null;

    if (!Type || !(Type.prototype instanceof Interaction)) {
      return;
    }

    delete state._ruleRegistry;
    delete state._turn;
  });

  file.entities = file.entities.filter(({ type }) => type !== 'Turn');
};
