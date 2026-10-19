import {
  CancelTreaty,
  DemandTribute,
  ExchangeKnowledge,
  OfferPeace,
  OfferPeaceWithGift,
} from '@civ-clone/library-diplomacy/Proposals';
import {
  Peace,
  ShamPeace,
  Vendetta,
  War,
} from '@civ-clone/library-diplomacy/Declarations';
import AdvanceStolen from '@civ-clone/base-unit-action-steal-technology/AdvanceStolen';
import AdvanceTaken from '@civ-clone/civ1-diplomacy/Dialogues/AdvanceTaken';
import { Contact } from '@civ-clone/library-diplomacy/Interactions';
import Embassy from '@civ-clone/base-unit-action-establish-embassy/Embassy';
import { Game } from '@civ-clone/core-game/Game';
import Interaction from '@civ-clone/core-diplomacy/Interaction';
import { SaveGame } from '@civ-clone/core-save-game/SaveGame';
import { SaveableClass } from '@civ-clone/core-data-object/ClassRegistry';

/**
 * Register the diplomacy classes a save can name that `registerClasses` does
 * not (#80).
 *
 * A save names them from first contact onwards, and none was registered, so
 * every save made after two players met failed to load. `core-save-game`
 * registers the `core-diplomacy` ones; these live in `library-diplomacy`,
 * which it cannot depend on.
 */
export const registerDiplomacyClasses = (game: Game): void =>
  game.classes.register(
    ...([
      // A Diplomat's theft, so a city is robbed only once (#58).
      AdvanceStolen,
      // What a computer player took in an exchange of knowledge (#453).
      AdvanceTaken,
      // A call to cancel a treaty with a third player (#427).
      CancelTreaty,
      Contact,
      DemandTribute,
      // A Diplomat's embassy (#58).
      Embassy,
      ExchangeKnowledge,
      OfferPeace,
      // A peace offer sweetened with an advance or gold (#427).
      OfferPeaceWithGift,
      Peace,
      // A computer player keeping a peace it means to drop, and a grudge (#427).
      ShamPeace,
      Vendetta,
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
