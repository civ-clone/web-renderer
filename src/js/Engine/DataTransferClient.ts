import {
  ChoiceMeta,
  DataForChoiceMeta,
} from '@civ-clone/core-client/ChoiceMeta';
import { Client, IClient } from '@civ-clone/core-client/Client';
import City from '@civ-clone/core-city/City';
import CityBuildItem from '@civ-clone/core-city-build/CityBuild';
import { ObjectMap } from '@civ-clone/core-data-object/DataObject';
import registries from './Client/registries';
import Player from '@civ-clone/core-player/Player';
import PlayerTile from '@civ-clone/core-player-world/PlayerTile';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Tile from '@civ-clone/core-world/Tile';
import Transport from './Transport';
import Unit from '@civ-clone/core-unit/Unit';
import ActionsState from './Client/ActionsState';
import Automation from './Client/Automation';
import { instance as engineInstance } from '@civ-clone/core-engine/Engine';
import { instance as playerGovernmentRegistryInstance } from '@civ-clone/core-government/PlayerGovernmentRegistry';
import { TopCitiesRow, defaultTopCitiesLimit } from './lib/topCities';
import { CivilizationScore } from './lib/civilizationScore';
import { GameOverDetails } from './lib/gameOver';
import GameResult from '@civ-clone/core-turn-based-game/GameResult';
import hasMet from './lib/hasMet';
import {
  makeDataFilter,
  serialiseCity,
  serialisePlayer,
  serialiseTile,
  serialiseUnit,
} from './Client/visibilityFilter';
import PlayerPatches from './Client/PlayerPatches';
import Notifier from './Client/Notifier';
import CityNewsCollector from './Client/cityNews';
import registerCheats from './Client/cheats';
import registerRequests, {
  cityBuildAvailable as cityBuildAvailableFor,
  civilizationScore as civilizationScoreFor,
  topCities as topCitiesFor,
} from './Client/requests';
import registerGameEnd, { gameOver as gameOverFor } from './Client/gameEnd';
import registerNotifications from './Client/notifications/registerNotifications';
import registerPatchEvents from './Client/events/patchEvents';
import Talks, { registerTalkEvents } from './Client/Talks';
import ChoicePrompt from './Client/ChoicePrompt';
import registerDiplomatEvents from './Client/diplomatEvents';
import TurnHandover, {
  registerTurnHandoverEvents,
} from './Client/TurnHandover';
import { handleAction as handleActionFor } from './Client/handleAction';
import { ClientContext } from './Client/ClientContext';
// Last, as registering these used to follow every import here.
import './Client/registerAdditionalData';

export class DataTransferClient extends Client implements IClient {
  // Asks the player to choose, one prompt at a time (see `Client/ChoicePrompt.ts`).
  #choicePrompt: ChoicePrompt;
  // What the client's modules share: the player, the transport, the patches, the notifications, automation, the talks
  //  and the registries (see `Client/ClientContext.ts`). Made once, in the constructor.
  #context: ClientContext;
  // The turn handed to the UI and back, and each `action` it sends acted on (see `Client/TurnHandover.ts`).
  #turnHandover: TurnHandover;

  constructor(
    player: Player,
    transport: Transport<TransportDataMap>,
    {
      automationEnabled = false,
    }: {
      automationEnabled?: boolean;
    } = {}
  ) {
    super(player);

    // The player's actions as the frontend was last sent them (#411, #323), and what the player may see, which every
    //  payload goes through (see `Client/visibilityFilter.ts`), made with them.
    const actions = new ActionsState(),
      dataFilter = makeDataFilter(() => this.player(), actions),
      notifier = new Notifier(transport, dataFilter),
      context = {
        player: () => this.player(),
        transport,
        actions,
        dataFilter,
        patches: new PlayerPatches(transport, dataFilter, actions, () =>
          this.player()
        ),
        notifier,
        cityNews: new CityNewsCollector(
          () => this.player(),
          (notification) => notifier.notify(notification)
        ),
        hasMet: (other: Player) => hasMet(this.player(), other, this.#context),
        hasSeen: (tile: Tile) =>
          Boolean(
            registries.playerWorlds.getByPlayer(this.player()).getByTile(tile)
          ),
        unitsOn: (tile: Tile) => registries.units.getByTile(tile),
        government: (player: Player) =>
          playerGovernmentRegistryInstance.getByPlayer(player),
        civilizationScore: () => this.civilizationScore(),
        handleAction: (...args: any[]) => this.handleAction(...args),
        ...registries,
      };

    // Automation and the talks read the context too, so they join it last (see `Client/Automation.ts`,
    //  `Client/Talks.ts`).
    this.#context = Object.assign(context, {
      automation: new Automation(
        new SimpleAIClient(player),
        automationEnabled,
        context
      ),
      talks: new Talks(context),
    });

    this.#choicePrompt = new ChoicePrompt(transport, dataFilter);

    // The turn handed to the UI and back: it listens for the UI's `action`s, and holds our notifications until the
    //  hand-over (see `Client/TurnHandover.ts`).
    this.#turnHandover = new TurnHandover(this.#context);
    notifier.holdWhile(() => this.#turnHandover.holdsNotifications());

    // In this order, which is the order of the receivers and the engine listeners: the cheats and the lists the cheat
    //  menu asks for (`Client/cheats.ts`); what the UI asks for (`Client/requests.ts`); the talks' `unit:moved` before
    //  the patches', which flushes (`Client/Talks.ts`); a GoTo that stopped next to a choice
    //  (`Client/TurnHandover.ts`); what each engine event changes of what the player is sent
    //  (`Client/events/patchEvents.ts`); a Diplomat's embassy report and investigated city (`Client/diplomatEvents.ts`);
    //  how the game ends for us (`Client/gameEnd.ts`); and what the player is told of, last, so that what an event
    //  changes is queued before the player is told of it (`Client/notifications/registerNotifications.ts`).
    registerCheats(transport, this.#context);
    registerRequests(transport, this.#context);

    engineInstance.on('engine:plugins:load:failed', (packagePath, error) => {
      console.log(packagePath + ' failed to load');
      console.error(error);
    });

    registerTalkEvents(engineInstance, this.#context);
    registerTurnHandoverEvents(engineInstance, this.#turnHandover);
    registerPatchEvents(engineInstance, this.#context);
    registerDiplomatEvents(engineInstance, this.#context);

    // Famine (#400). A city shrinks for many reasons, most of them told some other way or not at all (Settlers built,
    //  no Aqueduct), so a shrinking city has no notice of its own. `city:shrink` carries its cause (the Settlers, the
    //  Attack lost, `Aqueduct`, `FoodExhausted`, `Captured`) for any that should have one.
    engineInstance.on('city:food-storage-exhausted', (city: City) => {
      this.#context.cityNews.of(city).famine = true;
    });

    registerGameEnd(engineInstance, this.#context);
    registerNotifications(engineInstance, this.#context);
  }

  setAutomationEnabled(enabled: boolean): void {
    this.#context.automation.setEnabled(enabled);
  }

  async chooseFromList<Name extends keyof ChoiceMetaDataMap>(
    meta: ChoiceMeta<Name>
  ): Promise<DataForChoiceMeta<ChoiceMeta<Name>>> {
    if (this.#context.automation.enabled) {
      return this.#context.automation.client.chooseFromList(meta) as Promise<
        DataForChoiceMeta<ChoiceMeta<Name>>
      >;
    }

    if (meta.choices().length === 1 && 'negotiation.next-step' !== meta.key()) {
      const [choice] = meta.choices();

      return new Promise<DataForChoiceMeta<ChoiceMeta<Name>>>((resolve) =>
        resolve(choice.value())
      );
    }

    // Sent to the UI to choose (see `Client/ChoicePrompt.ts`), or chosen at random if it answers with an unknown id.
    return this.#choicePrompt.promptChoice(meta, () =>
      super.chooseFromList(meta)
    );
  }

  // What the UI sends on `action`, acted on (see `Client/handleAction.ts`). Says whether the turn is over. Not `async`,
  //  so that it settles when the action's handler does, inside the listener's hold on flushes.
  handleAction(...args: any[]): Promise<boolean> {
    return handleActionFor(this.#context, ...args);
  }

  /**
   * Send the player's whole state, as the first hand-over does (see `Client/TurnHandover.ts`).
   *
   * For tests and `Game.ts`: the UI can't ask for it.
   */
  initialData(): void {
    this.#turnHandover.sendInitialData();
  }

  /**
   * Send the patches queued for the player, unless an action is being handled (see `PlayerPatches#flush`).
   *
   * For tests and `Game.ts`: the UI can't ask for it, but the engine flushes after every action and turn.
   */
  flush(): void {
    this.#context.patches.flush();
  }

  cityBuildAvailable(cityBuild: CityBuildItem): ObjectMap {
    return cityBuildAvailableFor(this.#context.dataFilter, cityBuild);
  }

  civilizationScore(): CivilizationScore {
    return civilizationScoreFor(this.#context);
  }

  // How the game ended, for the ending window (#176).
  gameOver(gameResult: GameResult): GameOverDetails {
    return gameOverFor(this.#context, gameResult);
  }

  topCities(limit: number = defaultTopCitiesLimit): TopCitiesRow[] {
    return topCitiesFor(this.#context, limit);
  }

  // One of the player's tiles in full, as a tile patch sends it (#138).
  serialiseTile(playerTile: PlayerTile): ObjectMap {
    return serialiseTile(this.#context.dataFilter, playerTile);
  }

  // The whole player as the frontend should hold it now, for a test to compare with what it does hold (#411).
  serialisePlayer(): ObjectMap {
    return serialisePlayer(
      this.#context.dataFilter,
      this.player(),
      this.#context.actions
    );
  }

  // One of the player's units, as a patch of the unit sends it (#411).
  serialiseUnit(unit: Unit): ObjectMap {
    return serialiseUnit(this.#context.dataFilter, unit);
  }

  // One of the player's cities, as a patch of the city sends it (#411).
  serialiseCity(city: City): ObjectMap {
    return serialiseCity(this.#context.dataFilter, city);
  }

  // The player's turn, handed to the UI, or played by automation (see `Client/TurnHandover.ts`).
  takeTurn(): Promise<void> {
    return this.#turnHandover.takeTurn();
  }
}

export default DataTransferClient;
