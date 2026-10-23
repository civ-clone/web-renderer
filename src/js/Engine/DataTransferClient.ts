import {
  ChoiceMeta,
  DataForChoiceMeta,
} from '@civ-clone/core-client/ChoiceMeta';
import { Client, IClient } from '@civ-clone/core-client/Client';
import City from '@civ-clone/core-city/City';
import { ObjectMap } from '@civ-clone/core-data-object/DataObject';
import registries from './Client/registries';
import Player from '@civ-clone/core-player/Player';
import PlayerTile from '@civ-clone/core-player-world/PlayerTile';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Tile from '@civ-clone/core-world/Tile';
import { View, playerView } from './Client/View';
import { filterToReference } from './Client/refs';
import PlayerWorld from '@civ-clone/core-player-world/PlayerWorld';
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
  civilizationScore as civilizationScoreFor,
  topCities as topCitiesFor,
} from './Client/requests';
import registerGameEnd, { gameOver as gameOverFor } from './Client/gameEnd';
import registerNotifications from './Client/notifications/registerNotifications';
import registerPatchEvents from './Client/events/patchEvents';
import Talks, { registerTalkEvents } from './Client/Talks';
import ChoicePrompt from './Client/ChoicePrompt';
import registerDiplomatEvents from './Client/diplomatEvents';
import registerObserveCity from './Client/observeCity';
import TurnHandover, {
  registerTurnHandoverEvents,
} from './Client/TurnHandover';
import { handleAction as handleActionFor } from './Client/handleAction';
import { ClientContext, Disposer } from './Client/ClientContext';
// Last, as registering these used to follow every import here.
import './Client/registerAdditionalData';

export class DataTransferClient extends Client implements IClient {
  // Asks the player to choose, each prompt open answered in turn (see `Client/ChoicePrompt.ts`).
  #choicePrompt: ChoicePrompt;
  // What the client's modules share: the player, the transport, the patches, the notifications, automation, the talks
  //  and the registries (see `Client/ClientContext.ts`). Made once, in the constructor.
  #context: ClientContext;
  // Set by `dispose`: a choice or the initial data asked for from then on is never sent.
  #disposed: boolean = false;
  // What undoes each registration below: the engine listeners and the transport receivers (`dispose`).
  #disposers: Disposer[] = [];
  // The turn handed to the UI and back, and each `action` it sends acted on (see `Client/TurnHandover.ts`).
  #turnHandover: TurnHandover;

  constructor(
    player: Player,
    transport: Transport<TransportDataMap>,
    {
      automationEnabled = false,
      readOnly = false,
      view: givenView,
    }: {
      automationEnabled?: boolean;
      // Whose game the client sends (#613): the player's own view unless the observer gives it one of several
      //  civilisations, or of the whole map, with this player as its primary.
      view?: View;
      // An observer's view of the player (#607): everything the player is sent, nothing the UI could do as them. No
      //  cheats, no `action`s, no talks, no retiring or keeping playing, and the notifications are never held for a
      //  hand-over that never comes. The client isn't the player's in the `ClientRegistry`: their own client plays.
      readOnly?: boolean;
    } = {}
  ) {
    super(player);

    // The player's actions as the frontend was last sent them (#411, #323), and what the player may see, which every
    //  payload goes through (see `Client/visibilityFilter.ts`), made with them.
    const actions = new ActionsState(),
      view = givenView ?? playerView(() => this.player(), registries),
      dataFilter = makeDataFilter(() => view, actions),
      notifier = new Notifier(transport, dataFilter, { noticesOnly: readOnly }),
      context = {
        player: () => view.primary(),
        view,
        transport,
        actions,
        dataFilter,
        patches: new PlayerPatches(transport, dataFilter, actions, () => view),
        notifier,
        cityNews: new CityNewsCollector(
          () => this.player(),
          (notification) => notifier.notify(notification),
          (other: Player) => view.owns(other)
        ),
        hasMet: (other: Player) => view.hasMet(other),
        hasSeen: (tile: Tile) => view.hasSeen(tile),
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
    this.#turnHandover = new TurnHandover(this.#context, {
      listenForActions: !readOnly,
    });
    notifier.holdWhile(
      () => !readOnly && this.#turnHandover.holdsNotifications()
    );

    // In this order, which is the order of the receivers and the engine listeners: the cheats and the lists the cheat
    //  menu asks for (`Client/cheats.ts`); what the UI asks for (`Client/requests.ts`); the talks' `unit:moved` before
    //  the patches', which flushes (`Client/Talks.ts`); a GoTo that stopped next to a choice
    //  (`Client/TurnHandover.ts`); what each engine event changes of what the player is sent
    //  (`Client/events/patchEvents.ts`); a Diplomat's embassy report and investigated city (`Client/diplomatEvents.ts`);
    //  how the game ends for us (`Client/gameEnd.ts`); and what the player is told of, last, so that what an event
    //  changes is queued before the player is told of it (`Client/notifications/registerNotifications.ts`).
    const on = (event: string, listener: (...args: any[]) => void): void => {
      engineInstance.on(event, listener);

      this.#disposers.push(() => engineInstance.off(event, listener));
    };

    if (!readOnly) {
      this.#disposers.push(registerCheats(transport, this.#context));
    }

    this.#disposers.push(registerRequests(transport, this.#context));

    on('engine:plugins:load:failed', (packagePath, error) => {
      console.log(packagePath + ' failed to load');
      console.error(error);
    });

    if (!readOnly) {
      this.#disposers.push(
        registerTalkEvents(engineInstance, this.#context),
        registerTurnHandoverEvents(engineInstance, this.#turnHandover)
      );
    }

    this.#disposers.push(registerPatchEvents(engineInstance, this.#context));

    // A Diplomat's report opens a window on the page: not for a watcher, who opens a city of their own accord instead
    //  (#613), for the same read-only screen.
    if (!readOnly) {
      this.#disposers.push(
        registerDiplomatEvents(engineInstance, this.#context)
      );
    } else {
      this.#disposers.push(registerObserveCity(transport, this.#context));
    }

    // Famine (#400). A city shrinks for many reasons, most of them told some other way or not at all (Settlers built,
    //  no Aqueduct), so a shrinking city has no notice of its own. `city:shrink` carries its cause (the Settlers, the
    //  Attack lost, `Aqueduct`, `FoodExhausted`, `Captured`) for any that should have one.
    on('city:food-storage-exhausted', (city: City) => {
      this.#context.cityNews.of(city).famine = true;
    });

    this.#disposers.push(
      registerGameEnd(engineInstance, this.#context, { readOnly })
    );

    // A view of nobody's own (the whole map, #613) has nobody to be told: the notices are the primary player's.
    if (view.owners().length > 0) {
      this.#disposers.push(
        registerNotifications(engineInstance, this.#context)
      );
    }
  }

  /**
   * Stop listening: to every engine event and every message from the UI, the `action`s of the turn under way, and the
   * answers to the choices pending. From then on an engine event sends the player nothing and a message is ignored; a
   * turn under way played by hand never ends, and a choice pending never settles. A hand-over still to come is called
   * off, and a turn, a choice or the initial data asked of the client afterwards sends nothing (and the turn and the
   * choice never settle).
   *
   * Not undone:
   * - what was queued before, which a later `flush()` still sends;
   * - the notifications held until the hand-over, which stay held;
   * - a turn's end 10 ms after `turnEnded`, an action being handled, the talks under way and the news of the engine
   *   call under way, if any of these is pending;
   * - an automated turn under way, which still sends its whole-player patch and ends once automation has played it;
   * - the stand-ins and the AdditionalData providers, which every client shares;
   * - the client's place in the `ClientRegistry`, which is its owner's.
   */
  dispose(): void {
    this.#disposed = true;
    this.#disposers.splice(0).forEach((dispose) => dispose());
    this.#choicePrompt.cancel();
    this.#turnHandover.dispose();
  }

  setAutomationEnabled(enabled: boolean): void {
    this.#context.automation.setEnabled(enabled);
  }

  async chooseFromList<Name extends keyof ChoiceMetaDataMap>(
    meta: ChoiceMeta<Name>
  ): Promise<DataForChoiceMeta<ChoiceMeta<Name>>> {
    // A client done with asks nothing more (`dispose`).
    if (this.#disposed) {
      return new Promise(() => {});
    }

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

    // Sent to the UI to choose, alongside any other prompt open (see `Client/ChoicePrompt.ts`), or chosen at random if
    //  it answers with an unknown id.
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
   * For tests (`patchRefs.ts`): the UI can't ask for it.
   */
  initialData(): void {
    // A client done with sends nothing more (`dispose`).
    if (this.#disposed) {
      return;
    }

    this.#turnHandover.sendInitialData();
  }

  /**
   * Send the player whole again, as a hand-over does on a later turn, with the turn and the year: what an observer's
   * client (#607) does as each turn ends, having no hand-over of its own.
   */
  refresh(): void {
    // A client done with sends nothing more (`dispose`).
    if (this.#disposed) {
      return;
    }

    const { patches, turn, year, view } = this.#context;

    patches.update(turn.id(), () => turn.toPlainObject());
    patches.update(year.id(), () => year.toPlainObject());

    // A view of nobody's own (the whole map, #613) shows nothing of the primary player but its turn and year: it is
    //  not sent whole, nor are its actions.
    if (view.owners().length > 0) {
      patches.wholePlayer(
        filterToReference(PlayerWorld, PlayerTile, Tile),
        'add'
      );
    }

    patches.flush();
  }

  /**
   * Send the patches queued for the player, unless an action is being handled (see `PlayerPatches.flush()`).
   *
   * For tests: the UI can't ask for it, and the client flushes itself after each action, each move and each hand-over.
   */
  flush(): void {
    this.#context.patches.flush();
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
