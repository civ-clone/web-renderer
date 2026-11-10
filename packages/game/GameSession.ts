import { City as CityData, DataPatch } from '@civ-clone/ui-protocol/types';
import { TransportHandledAction } from '@civ-clone/ui-protocol/Transport';
import { s } from '@dom111/element';
import { t } from 'i18next';
import { ObjectMap } from '@civ-clone/core-data-object/DataObject';
import openCity from '@civ-clone/ui-city/components/openCity';
import CitiesList from '@civ-clone/ui-hud/components/CitiesList';
import GameMenu from '@civ-clone/ui-menus/components/GameMenu';
import { GameMenuItem } from '@civ-clone/ui-menus/components/mapMenus';
import cheatRows from './debug/cheats';
import openFindCity from '@civ-clone/ui-city/components/FindCity';
import {
  allowLeaving,
  guardLeaving,
} from '@civ-clone/ui-component-window/leaveGuard';
import { gridName } from '@civ-clone/ui-menus/lib/savedGame';
import { autosaveDue } from '@civ-clone/ui-client/lib/browserSaves';
import { isSupportedTopology } from '@civ-clone/ui-map/lib/supportedTopologies';
import NotificationWindow from '@civ-clone/ui-component-window/NotificationWindow';
import Notices from '@civ-clone/ui-hud/components/Notices';
import Notifications, {
  Notification,
} from '@civ-clone/ui-hud/components/Notifications';
import PowerList from '@civ-clone/ui-hud/components/PowerList';
import { openIntelligenceReport } from '@civ-clone/ui-reports/components/reports';
import HaltedUnits from '@civ-clone/ui-client/lib/haltedUnits';
import Transport from '@civ-clone/ui-client/Transport';
import unitPanel from '@civ-clone/ui-hud/components/unitPanel';
import { instance as options } from '@civ-clone/ui-platform/GameOptionsRegistry';
import Dismissals from '@civ-clone/ui-client/lib/dismissals';
import { actionKey } from '@civ-clone/ui-client/lib/nextTurnQueue';
import shouldAutoEndTurn from '@civ-clone/ui-client/lib/autoEndTurn';
import { instance as dataChanges } from '@civ-clone/ui-client/lib/DataChanges';
import ActiveUnitController from './ActiveUnitController';
import MapView from './MapView';
import Hud from './Hud';
import GameState from '@civ-clone/ui-client/game/GameState';
import InputController from './InputController';
import DebugFlags from '@civ-clone/ui-client/debug/DebugFlags';
import DebugPanel from './debug/DebugPanel';
import EventSounds from '@civ-clone/ui-audio/eventSounds';
import { AppElements } from './app/elements';
import { PendingMeeting } from '@civ-clone/ui-hud/components/turnControls';
import NotificationBar from './app/NotificationBar';
import ObserverBar from '@civ-clone/ui-hud/components/ObserverBar';
import {
  observerCityOpener,
  playerCityOpener,
} from '@civ-clone/ui-hud/lib/cityOpeners';
import { ObserverState } from '@civ-clone/ui-protocol/observer';
import sendBuildPreferences from '@civ-clone/ui-client/lib/buildPreferences';

// One game, from its first `gameData` (#344): the welcome, the map, the active unit, the panels, the menu, the debug
//  panel and the keyboard, the render pair, the order each update runs in, and the game's receivers.
//
// `start` registers every receiver synchronously, before it returns: the worker sends a `gameDataPatch` or
//  `turnStarted` straight after `gameData`, and one that arrived before its receiver would be lost. Nothing in it may
//  `await`.
//
// What belongs to the page rather than the game (the reload guard, which reads whether the game has started; the
//  choice windows; the save and game over receivers; the notification bar) is made in `Renderer` and handed in.

export type GameSessionDeps = {
  // The page's elements, looked up once; only the game's are read here.
  elements: AppElements;
  transport: Transport;
  notifications: Notifications;
  notices: Notices;
  // Units whose GoTo stopped next to a choice (#357).
  haltedUnits: HaltedUnits;
  debugFlags: DebugFlags;
  notificationBar: NotificationBar;
  // The save being loaded, or `null` for a new game: only a new game is welcomed.
  pendingSave: string | null;
  // `?cheat=1`, for the game menu.
  cheatsEnabled: boolean;
  // The game watched rather than played (#607): the observer's state as last sent, or `null` for a game of our own,
  //  which is what a session without one plays.
  observer?: () => ObserverState | null;
  // Once a game is running, F5 is a leader-screen shortcut: the reload guard reads this live.
  setGameStarted: () => void;
  // The page's transport disposers, which the `pagehide` teardown runs: the game's are added after them.
  transportDisposers: Array<() => void>;
  // The game's moments as Civ1's tunes (#126): the welcome, and each notice as it's shown. Not for a game being
  //  watched, which is nobody's own to hear.
  sounds?: Pick<
    EventSounds,
    | 'attach'
    | 'newGame'
    | 'welcomeClosed'
    | 'notificationShown'
    | 'noticeAdded'
    | 'battle'
  >;
};

export class GameSession {
  #deps: GameSessionDeps;
  // Made once the game data, and the map it draws on, have arrived.
  #hud: Hud | null = null;
  #unitController: ActiveUnitController | null = null;

  // What `start`'s phases share (#869), each made by the phase named beside it and read by the ones after it.
  // Watching, not playing (#607): set as `start` begins.
  #observing: boolean = false;
  #sounds: GameSessionDeps['sounds'];
  // `#rebuild`'s.
  #gameState!: GameState;
  // `#buildInterface`'s.
  #waitingBanner!: HTMLElement;
  #mapView!: MapView;
  #dismissals!: Dismissals;
  #gameMenuItem!: GameMenu;
  // `#render` and `#scheduleRender`'s.
  #renderFrame: number | null = null;
  #firstRender: boolean = true;
  // Whether an End Turn is on its way, sent by hand or by auto end of turn, until the worker answers it. The patch
  //  that answers it comes before `turnEnded`, and still has End Turn as the only thing left, so without this auto
  //  end of turn would send a second one, which could end the next turn before it started (#151).
  #endTurnSent: boolean = false;
  // `#followUpdates`'s.
  #turnShown: number = 0;
  // The first turn handed over is saved only for a new game (#653): see `autosaveDue`.
  #firstTurnStarted: boolean = true;

  constructor(deps: GameSessionDeps) {
    this.#deps = deps;
  }

  /** Talks waiting on the player's answer, for the Next Turn button (#702): the choice windows' receiver calls this. */
  meeting(meeting: PendingMeeting | null): void {
    this.#hud?.nextTurn()?.meeting(meeting);
  }

  /** Forgets the keys kept for a unit: the choice windows' receiver, registered before the game, calls this. */
  clearKeys(): void {
    this.#unitController?.clearKeys();
  }

  // Each phase in turn (#869), all of them synchronous: see the note at the top of this file.
  start(
    // The map as it arrived: the transport does not rebuild it, so that
    // it is rebuilt once, here (#333).
    objectMap: ObjectMap
  ): void {
    const { observer = (): ObserverState | null => null, sounds: gameSounds } =
      this.#deps;

    // Watching, not playing (#607): no welcome, nothing to lose on leaving, and a bar to choose the view and the pace.
    this.#observing = observer() !== null;
    this.#sounds = this.#observing ? undefined : gameSounds;

    performance.mark('civ:game-data-received');

    try {
      this.#rebuild(objectMap);

      if (!this.#canBeDrawn()) {
        return;
      }

      this.#begin();
      this.#welcome();
      this.#buildInterface(observer);

      const debugPanel = this.#buildDebugPanel();

      this.#tearDownOnPageHide(debugPanel);
      this.#noteEndTurnSent();
      this.#stopRenderingOnTearDown();
      this.#followUpdates();
      this.#receiveGame();
      this.#showObserverBar(observer);
      this.#receiveDiplomatReports();
      this.#bindKeyboard();
    } catch (e) {
      console.error(e);
    }
  }

  #turn(): number {
    return Number(this.#gameState.data()?.turn?.value ?? 0);
  }

  // The game's data, rebuilt from the map as it arrived.
  #rebuild(objectMap: ObjectMap): void {
    // The first rebuild, which everything below that needs the
    // player is built from; each update goes on refilling it.
    this.#gameState = new GameState(objectMap, {
      tiles: {
        queueTile: (tile): void => this.#mapView.queueTile(tile),
        setTiles: (tiles, changed): void =>
          this.#mapView.world.setTiles(tiles, changed),
      },
    });
  }

  // Whether the game's map can be drawn here at all: if not, it says so and goes back to the menu.
  #canBeDrawn(): boolean {
    // A world on a grid that can't be drawn here (#89). Loading a save checks first, so this is for any other way in:
    //  say so and go back to the menu, rather than draw a map of nonsense.
    const { topologyId } = this.#gameState.data().player.world;

    if (!isSupportedTopology(topologyId)) {
      window.alert(t('SavedGame.needs-grid', { grid: gridName(topologyId!) }));

      allowLeaving();
      window.location.reload();

      return false;
    }

    return true;
  }

  // The game has begun: the page's sounds are the player's, leaving asks first, and the worker hears what the player
  //  wants their cities to choose.
  #begin(): void {
    const { transport, notifications, setGameStarted } = this.#deps,
      gameState = this.#gameState,
      sounds = this.#sounds;

    setGameStarted();

    // Heard as the player they're told to: ours, whose themes they are.
    sounds?.attach(() => gameState.data()?.player ?? null);
    notifications.onShown(
      sounds ? (notification) => sounds.notificationShown(notification) : null
    );

    if (!this.#observing) {
      guardLeaving();

      // What the player has asked their cities to choose by themselves, before they found any (#690, #691).
      sendBuildPreferences(transport);
    }
  }

  // The welcome window, for a new game.
  #welcome(): void {
    const gameState = this.#gameState,
      sounds = this.#sounds;

    // Only for a new game: "you have risen" is an introduction, and a
    // loaded game has already had one. A watched game is nobody's to be welcomed to.
    if (this.#deps.pendingSave === null && !this.#observing) {
      const welcome = new NotificationWindow(
        'Welcome',
        s(
          `<div class="welcome">
<p>${t('Welcome.you-have-risen', {
            player: gameState.data().player,
          })}</p>
<p>${t('Welcome.your-people-have-knowledge-of', {
            advances: [
              'Irrigation',
              'Mining',
              'Roads',
              ...gameState.data().player.research.complete.map((advance) =>
                t(`${advance._}.name`, {
                  defaultValue: advance._,
                  ns: 'science',
                })
              ),
            ],
          })}</p>
</div>`
        )
      );

      // The civilization's own theme, as Civ1 plays it over the welcome, faded as it closes (#126).
      sounds?.newGame();
      welcome.on('close', () => sounds?.welcomeClosed());
    }
  }

  // What the player sees and uses: the map, the active unit's panel, the sidebar's lists, the HUD and the game menu.
  #buildInterface(observer: () => ObserverState | null): void {
    const {
        elements: {
          actionArea,
          secondaryActionArea,
          unitActionArea,
          gameMenu,
          gameArea,
          mapWrapper,
          mapPortal,
          gameInfo,
          playerInfo,
          minimapCanvas,
          unitInfo,
          citiesList: citiesListElement,
          powerList: powerListElement,
        },
        transport,
        notices,
        haltedUnits,
        cheatsEnabled,
        transportDisposers,
      } = this.#deps,
      gameState = this.#gameState,
      observing = this.#observing;

    gameArea.classList.add('active');

    mapPortal.width = (mapPortal.parentElement as HTMLElement).offsetWidth;
    mapPortal.height = (mapPortal.parentElement as HTMLElement).offsetHeight;

    // Always in the document and emptied rather than hidden, so that
    // setting the text is announced: it explains why the controls
    // have stopped responding.
    const waitingBanner = s(
      `<div class="waiting" role="status" aria-live="polite"></div>`
    );

    this.#waitingBanner = waitingBanner;

    mapWrapper.append(waitingBanner);

    const mapView: MapView = new MapView({
      activateUnit: (unit): void => {
        if (gameState.waiting()) {
          return;
        }

        unitController.set(unit);
      },
      activeUnit: () => unitController.active(),
      // A watcher opens any city of a civilisation watched, read-only (#613).
      cityOpener: observing
        ? observerCityOpener(transport, observer)
        : playerCityOpener(),
      // The sidebar's sections float over the map (#697).
      coveredBy: Array.from(
        document.querySelectorAll<HTMLElement>('#sidebar > .sidebar-section')
      ),
      mapPortal,
      minimapCanvas,
      options,
      playerId: gameState.data().player.id,
      transport,
      world: gameState.data().player.world,
    });

    this.#mapView = mapView;

    const { portal, world } = mapView,
      // The active unit and its actions, as the interface shows them (#860): kept for the game, redrawing only what
      //  has changed.
      unitDetails = unitPanel.current()(
        { unitInfo, unitActionArea },
        {
          portal,
          transport,
          // As the map's stack window does: nothing while waiting for the turn.
          setActiveUnit: (unit): void => {
            if (gameState.waiting()) {
              return;
            }

            unitController.set(unit);
          },
          unitAction: (unitId, unitAction): void =>
            void unitController.act(unitId, unitAction),
        }
      ),
      // The sidebar's cities (#700), following them through `dataChanges`, and power (#701, #708), told the turn by the HUD.
      citiesList = citiesListElement
        ? new CitiesList(citiesListElement, gameState.data().player, portal)
        : null,
      powerList = powerListElement
        ? new PowerList(powerListElement, transport)
        : null,
      unitController = new ActiveUnitController({
        activeUnitLayer: mapView.activeUnitLayer,
        arrivalClosed: (): void => {
          if (!gameState.waiting()) {
            gameState.update();
          }
        },
        data: () => gameState.data(),
        haltedUnits,
        options,
        portal,
        scheduleRender: (): void => this.#scheduleRender(),
        showUnitDetails: (unit): void => {
          // With no unit active, its section goes rather than standing empty over the map (#697). Shown before the
          //  card is drawn, so the card can measure itself (#743).
          const section = unitInfo.closest<HTMLElement>('.sidebar-section');

          if (section) {
            section.hidden = unit === null;
          }

          unitDetails.update(unit);

          // Its unit is checked against the map next: the section's new size first (#697).
          mapView.measureCovered();
        },
        transport,
        unitsLayer: mapView.unitsLayer,
        world,
      }),
      // The notifications dismissed this turn (#416): the HUD leaves them out, and auto end turn looks past them.
      dismissals = new Dismissals();

    this.#dismissals = dismissals;

    const hud = new Hud({
        actionArea,
        changed: (): void => {
          this.#scheduleRender();
          this.#autoEndTurn();
        },
        dismissals,
        turn: (): number => Number(gameState.data().turn?.value ?? 0),
        centreActiveUnit: (): void => {
          const unit = unitController.active();

          if (unit !== null) {
            mapView.centre(unit.tile);
          }
        },
        gameArea,
        gameInfo,
        notices,
        playerInfo,
        portal,
        power: powerList,
        secondaryActionArea,
        transport,
        unitActions: unitDetails,
        world,
      }),
      findCity = (): void => {
        openFindCity(gameState.data().player.world.tiles, (tile): void =>
          mapView.centre(tile)
        );
      },
      gameMenuItem = new GameMenu(
        gameMenu,
        // `data` is replaced on a full rebuild, so this always
        // resolves to the current player rather than the turn-0
        // snapshot.
        () => gameState.data().player,
        // Same reason: the turn a save is named after is the turn it
        // was taken on.
        (): number => this.#turn(),
        () => Number(gameState.data()?.year?.value ?? 0),
        portal,
        transport,
        cheatsEnabled,
        findCity,
        // The cheat items (#863): the debug code's, as the menu can't reach the game's.
        (): GameMenuItem[] => cheatRows(portal, transport)
      );

    this.#gameMenuItem = gameMenuItem;

    this.#unitController = unitController;
    this.#hud = hud;

    transportDisposers.push((): void => unitDetails.dispose());

    if (citiesList) {
      transportDisposers.push((): void => citiesList.dispose());
    }

    gameMenuItem.build();

    // This needs wrapping.
    // let lastTurn = 1,
    //   clearNextTurn = false;
  }

  // The `?debug=1` panel, hotkeys and memory testbed. Built before
  // the game's `keydown` handler below is registered, as it always
  // was; its own hotkey listener is capture-phase.
  #buildDebugPanel(): DebugPanel {
    const { debugFlags, notificationBar, transport } = this.#deps,
      gameState = this.#gameState,
      mapView = this.#mapView,
      unitController = this.#unitController!;

    return new DebugPanel(debugFlags, {
      citiesMap: mapView.citiesLayer,
      cityNamesMap: mapView.cityNamesLayer,
      currentObjectCount: () => gameState.currentObjectCount(),
      currentTurn: () => gameState.currentTurn(),
      data: () => gameState.data(),
      minimap: mapView.minimap,
      notificationBar,
      portal: mapView.portal,
      setActiveUnit: (unit) => unitController.set(unit),
      tilesPendingRender: () => mapView.tilesPending(),
      transport,
      unitsMap: mapView.unitsLayer,
      yieldsMap: mapView.yieldsLayer,
    });
  }

  // Everything the game set up is taken down as the page goes.
  #tearDownOnPageHide(debugPanel: DebugPanel): void {
    const { transportDisposers } = this.#deps,
      mapView = this.#mapView;

    // `pagehide`, not `beforeunload`: the leave guard can still cancel an unload after `beforeunload`, and a
    //  page restored from the back/forward cache comes back as it was. Tearing down in either case left a
    //  game with nothing listening to the worker.
    window.addEventListener('pagehide', (event) => {
      if (event.persisted) {
        return;
      }

      mapView.dispose();
      debugPanel.dispose();

      transportDisposers.forEach((dispose) => dispose());
    });
  }

  // An End Turn sent by hand is noted, so that auto end of turn doesn't send another.
  #noteEndTurnSent(): void {
    const { transportDisposers } = this.#deps;

    const endTurnListener = (): void => {
      this.#endTurnSent = true;
    };

    document.addEventListener('endturn', endTurnListener);
    transportDisposers.push((): void =>
      document.removeEventListener('endturn', endTurnListener)
    );
  }

  // After each update, and when a notification is dismissed (#416): ends the turn if there's nothing left to do.
  #autoEndTurn(): void {
    const { transport } = this.#deps,
      gameState = this.#gameState,
      dismissals = this.#dismissals,
      data = gameState.data();

    if (
      !this.#endTurnSent &&
      shouldAutoEndTurn(data.player, options, gameState.waiting(), (action) =>
        dismissals.has(actionKey(action), Number(data.turn?.value ?? 0))
      )
    ) {
      this.#endTurnSent = true;

      // Not `endTurn()`: a turn nobody played should not clear the notices waiting to be read.
      transport.send('action', {
        name: 'EndTurn',
      });
    }
  }

  // The display work — the windows watching `dataChanges`, `hud`'s
  // panels, the active unit and the full `portal` composite — reads only
  // the latest `data`/`activeUnit`, so it is safe to run at most once per
  // animation frame however many patch flushes arrive.
  #render(): void {
    const gameState = this.#gameState,
      hud = this.#hud!,
      unitController = this.#unitController!;

    if (this.#firstRender) {
      this.#firstRender = false;

      performance.mark('civ:first-render');
    }

    dataChanges.notify(gameState.data());

    hud.build(gameState.data(), unitController.active(), gameState.waiting());

    unitController.render(unitController.active());

    this.#mapView.flush();
  }

  #scheduleRender(): void {
    if (this.#renderFrame !== null) {
      return;
    }

    this.#renderFrame = requestAnimationFrame(() => {
      this.#renderFrame = null;

      this.#render();
    });
  }

  // A render still waiting for its frame is dropped as the game is taken down.
  #stopRenderingOnTearDown(): void {
    this.#deps.transportDisposers.push(() => {
      if (this.#renderFrame !== null) {
        cancelAnimationFrame(this.#renderFrame);

        this.#renderFrame = null;
      }
    });
  }

  // What follows each rebuild of the game's data, and the first run of it, on the data as it arrived.
  #followUpdates(): void {
    const { notices, transportDisposers } = this.#deps,
      gameState = this.#gameState,
      mapView = this.#mapView,
      unitController = this.#unitController!,
      observing = this.#observing;

    // Runs synchronously on every patch during the player's turn, in
    // this order, after `gameState` has rebuilt the data, pruned the
    // map and set the world's tiles. All state the input handlers
    // read synchronously (`unitController`'s active unit, queue and
    // last unit, the map layers' active-unit pointers) must stay
    // here — deferring any of it (tried 2026-07-02) left `activeUnit`
    // stale for ~1 frame and broke consecutive moves of multi-move
    // units. Only `render()` is coalesced to one run per frame.
    // A watcher's notices are the turn's, as a player's are, but no End Turn clears them (#607): a new turn in the
    //  rebuilt data rolls them, before the render that would show them, and the last turn's stay while the game is
    //  paused between turns.
    this.#turnShown = this.#turn();

    gameState.onUpdated((): void => {
      if (observing && this.#turn() !== this.#turnShown) {
        this.#turnShown = this.#turn();

        notices.rollTurn();
      }

      mapView.releaseTiles();

      unitController.next(gameState.data().player.actions, gameState.waiting());

      this.#scheduleRender();

      // Keys kept while the unit's orders were on their way. Those kept
      // behind a move or another order wait for its `actionHandled`
      // (#326, #543).
      unitController.drain();

      this.#autoEndTurn();
    });

    // Not a full rebuild: `data` was built from this map above and
    // nothing has changed in it since, so the incremental rebuild
    // finds nothing to fill. The rest (the turn, the prune check, the
    // actions) still runs.
    gameState.update();

    transportDisposers.push((): void => gameState.dispose());
  }

  // What the worker sends during the game, each to its own handler below, in the order they have always been
  //  registered.
  #receiveGame(): void {
    const { transport, transportDisposers } = this.#deps;

    transportDisposers.push(
      transport.receive('gameData', (rawData): void =>
        this.#gameDataReceived(rawData)
      )
    );

    // The move drawn before its answer (#326), or any other order
    // (#543), settled by its own acknowledgement.
    transportDisposers.push(
      transport.receive('actionHandled', (action): void =>
        this.#actionHandled(action)
      )
    );

    // Whose turn it is, for the Next Turn button while waiting (#702): the notice the line along the top of the page
    //  shows (#588), which names only a civilization the player has met.
    transportDisposers.push(
      transport.receive('notification', (notice): void => {
        if (typeof notice !== 'string') {
          this.#hud!.nextTurn()?.waitingFor(notice);
        }
      })
    );

    transportDisposers.push(
      transport.receive('turnEnded', (): void => this.#turnEnded())
    );

    transportDisposers.push(
      transport.receive('turnStarted', (): void => this.#turnStarted())
    );

    transportDisposers.push(
      transport.receive('gameDataPatch', (data: DataPatch[]) => {
        this.#unitController!.dataReceived();

        // Rebuilt now, or once a frame while waiting for the turn.
        this.#gameState.applyPatches(data);
      })
    );

    transportDisposers.push(
      transport.receive('gameNotification', (notification): void =>
        this.#gameNotification(notification)
      )
    );

    transportDisposers.push(
      transport.receive('battle', (battle): void =>
        this.#sounds?.battle(battle)
      )
    );

    transportDisposers.push(
      transport.receive('unitHalted', (halt): void => {
        this.#deps.haltedUnits.add(halt);

        if (!this.#gameState.waiting()) {
          this.#gameState.update();
        }
      })
    );
  }

  #gameDataReceived(rawData: ObjectMap): void {
    const { transport, notices } = this.#deps,
      gameState = this.#gameState,
      mapView = this.#mapView;

    this.#unitController!.dataReceived();

    gameState.replace(rawData);

    // A new client's whole game: it knows nothing of the build options yet (#690, #691).
    if (!this.#observing) {
      sendBuildPreferences(transport);
    }

    // A whole new game's data, as an observer's change of view sends (#613): every square is drawn again, since
    //  what was unknown may now be known, which no patch has said, and the notices were the old view's.
    if (this.#observing) {
      notices.clear();
    }

    gameState
      .data()
      .player.world.tiles.forEach((tile) => mapView.queueTile(tile));
    mapView.releaseTiles();
    this.#scheduleRender();
  }

  #actionHandled(action: TransportHandledAction): void {
    // Answered: the turn ends (`turnEnded` follows at once), or it goes on, as when talks are open (#491), and End
    //  Turn may be sent again.
    if (action.name === 'EndTurn') {
      this.#endTurnSent = false;
    }

    this.#unitController!.actionHandled(action);
  }

  #turnEnded(): void {
    this.#gameState.setWaiting(true);
    this.#mapView.portal.setWaiting(true);
    this.#waitingBanner.textContent = t(
      this.#observing ? 'Observer.watching' : 'Game.waiting'
    );

    this.#gameState.update();
  }

  #turnStarted(): void {
    const { pendingSave } = this.#deps,
      gameState = this.#gameState,
      mapView = this.#mapView,
      observing = this.#observing;

    // A new turn: an End Turn sent before it was handed over is never answered, as the worker wasn't listening
    //  (#151).
    this.#endTurnSent = false;

    // Nor is any unit's order sent while waiting: the keys are free for the new turn (#543).
    this.#unitController!.turnStarted();

    // Drops the rebuild deferred while waiting: this one replaces
    // it.
    gameState.setWaiting(false);
    mapView.portal.setWaiting(false);
    this.#waitingBanner.textContent = '';
    this.#hud!.nextTurn()?.waitingFor(null);

    gameState.update();

    // Kept in the browser (#653), now that the worker has nothing to do until the player does something. Never
    //  for a game being watched: nobody's turn here is handed over.
    const autosave = observing
      ? null
      : autosaveDue(this.#turn(), options.get('autosave', '5'), {
          firstOfSession: this.#firstTurnStarted,
          newGame: pendingSave === null,
        });

    if (autosave !== null) {
      this.#gameMenuItem.autosave(autosave);
    }

    // A new game opens on the player's start, not wherever that happens to be in view from the map's corner
    //  (#705). A loaded one opens on the player's first city, or their first unit if they have no city (#826): the
    //  map's corner is often unexplored, and black. A unit waiting for orders elsewhere is then brought into view
    //  as usual. One being watched stays as it is.
    const { player } = gameState.data(),
      start =
        this.#firstTurnStarted && !observing
          ? (pendingSave === null ? undefined : player.cities[0]?.tile) ??
            player.units[0]?.tile
          : undefined;

    if (start) {
      mapView.centre(start);
    }

    this.#firstTurnStarted = false;

    // Now rather than next frame: the turn's messages follow
    // straight away, and should open over the new turn, not the
    // last one.
    if (this.#renderFrame !== null) {
      cancelAnimationFrame(this.#renderFrame);

      this.#renderFrame = null;
    }

    this.#render();
  }

  #gameNotification(notification: Notification): void {
    const { notifications, notices } = this.#deps;

    if (!notification.bubble) {
      notifications.receive(notification);

      return;
    }

    notices.add(notification);
    this.#sounds?.noticeAdded(notification);

    this.#scheduleRender();
  }

  // The observer's bar (#607), redrawn as the worker's `observer` state changes: a new view's `gameData` follows,
  //  and replaces the game's data as a load does.
  #showObserverBar(observer: () => ObserverState | null): void {
    const {
      elements: { mapWrapper, playerInfo },
      transport,
      transportDisposers,
    } = this.#deps;

    if (this.#observing) {
      const observerBar = new ObserverBar(mapWrapper, transport, observer()!),
        // The whole map is nobody's game (#613): the player's panel would show whoever shapes the payload.
        showPlayer = (state: ObserverState): void => {
          playerInfo.hidden = state.view.kind === 'world';
        };

      showPlayer(observer()!);
      transportDisposers.push(
        transport.receive('observer', (state): void => {
          observerBar.update(state);
          showPlayer(state);
        })
      );
    }
  }

  // A Diplomat's embassy opens the report on that civilization, and an investigated city's screen opens
  //  read-only (#58).
  #receiveDiplomatReports(): void {
    const { transport, transportDisposers } = this.#deps,
      { portal } = this.#mapView;

    transportDisposers.push(
      transport.receive(
        'embassyEstablished',
        (civilization): void =>
          void openIntelligenceReport(transport, civilization)
      ),
      transport.receive(
        'investigateCity',
        (city): void =>
          void openCity(city as unknown as CityData, portal, transport, {
            readOnly: true,
          })
      )
    );
  }

  // The game's keyboard. Registered here, as the handler always
  // was: after `ReloadGuard` and the debug panel's capture-phase
  // hotkeys, so it is the last `keydown` bubble listener on
  // `document`.
  #bindKeyboard(): void {
    const {
        elements: { actionArea },
        notificationBar,
        transport,
      } = this.#deps,
      gameState = this.#gameState,
      mapView = this.#mapView,
      hud = this.#hud!;

    new InputController({
      actionArea,
      data: () => gameState.data(),
      gameMenu: this.#gameMenuItem,
      mapView,
      nextTurn: () => hud.nextTurn(),
      notificationBar,
      portal: mapView.portal,
      transport,
      unitController: this.#unitController!,
      waiting: () => gameState.waiting(),
    });
  }
}

export default GameSession;
