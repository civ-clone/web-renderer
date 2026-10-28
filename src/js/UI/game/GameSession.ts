import { City as CityData, DataPatch } from '../types';
import { on, s } from '@dom111/element';
import { t } from 'i18next';
import { ObjectMap } from '../lib/reconstituteData';
import City from '../components/City';
import GameMenu from '../components/GameMenu';
import { allowLeaving, guardLeaving } from '../lib/leaveGuard';
import { gridName } from '../lib/savedGame';
import { autosaveDue } from '../lib/browserSaves';
import { isSupportedTopology } from '../lib/supportedTopologies';
import NotificationWindow from '../components/NotificationWindow';
import Notices from '../components/Notices';
import Notifications from '../components/Notifications';
import IntelligenceReport from '../components/IntelligenceReport';
import HaltedUnits from '../lib/haltedUnits';
import Transport from '../Transport';
import UnitDetails from '../components/UnitDetails';
import { instance as options } from '../GameOptionsRegistry';
import shouldAutoEndTurn from '../lib/autoEndTurn';
import { instance as dataChanges } from '../lib/DataChanges';
import ActiveUnitController from './ActiveUnitController';
import MapView from './MapView';
import Hud from './Hud';
import GameState from './GameState';
import InputController from './InputController';
import DebugFlags from '../debug/DebugFlags';
import DebugPanel from '../debug/DebugPanel';
import { AppElements } from '../app/elements';
import NotificationBar from '../app/NotificationBar';
import ObserverBar from '../components/ObserverBar';
import { observerCityOpener, playerCityOpener } from '../lib/cityOpeners';
import { ObserverState } from '../../Engine/Observer';

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
};

export class GameSession {
  #deps: GameSessionDeps;
  // Made once the game data, and the map it draws on, have arrived.
  #unitController: ActiveUnitController | null = null;

  constructor(deps: GameSessionDeps) {
    this.#deps = deps;
  }

  /** Forgets the keys kept for a unit: the choice windows' receiver, registered before the game, calls this. */
  clearKeys(): void {
    this.#unitController?.clearKeys();
  }

  start(
    // The map as it arrived: the transport does not rebuild it, so that
    // it is rebuilt once, here (#333).
    objectMap: ObjectMap
  ): void {
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
      },
      transport,
      notifications,
      notices,
      haltedUnits,
      debugFlags,
      notificationBar,
      pendingSave,
      cheatsEnabled,
      observer = (): ObserverState | null => null,
      setGameStarted,
      transportDisposers,
    } = this.#deps;

    // Watching, not playing (#607): no welcome, nothing to lose on leaving, and a bar to choose the view and the pace.
    const observing = observer() !== null;

    performance.mark('civ:game-data-received');

    try {
      // The first rebuild, which everything below that needs the
      // player is built from; each update goes on refilling it.
      const gameState = new GameState(objectMap, {
        tiles: {
          queueTile: (tile): void => mapView.queueTile(tile),
          setTiles: (tiles, changed): void => world.setTiles(tiles, changed),
        },
      });

      const turn = (): number => Number(gameState.data()?.turn?.value ?? 0);

      // A world on a grid that can't be drawn here (#89). Loading a save checks first, so this is for any other way in:
      //  say so and go back to the menu, rather than draw a map of nonsense.
      const { topologyId } = gameState.data().player.world;

      if (!isSupportedTopology(topologyId)) {
        window.alert(
          t('SavedGame.needs-grid', { grid: gridName(topologyId!) })
        );

        allowLeaving();
        window.location.reload();

        return;
      }

      setGameStarted();

      if (!observing) {
        guardLeaving();
      }

      // Only for a new game: "you have risen" is an introduction, and a
      // loaded game has already had one. A watched game is nobody's to be welcomed to.
      if (pendingSave === null && !observing) {
        new NotificationWindow(
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
      }

      gameArea.classList.add('active');

      mapPortal.width = (mapPortal.parentElement as HTMLElement).offsetWidth;
      mapPortal.height = (mapPortal.parentElement as HTMLElement).offsetHeight;

      // Always in the document and emptied rather than hidden, so that
      // setting the text is announced: it explains why the controls
      // have stopped responding.
      const waitingBanner = s(
        `<div class="waiting" role="status" aria-live="polite"></div>`
      );

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
            document.querySelectorAll<HTMLElement>(
              '#sidebar > .sidebar-section'
            )
          ),
          mapPortal,
          minimapCanvas,
          options,
          playerId: gameState.data().player.id,
          transport,
          world: gameState.data().player.world,
        }),
        { portal, world } = mapView,
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
          scheduleRender: (): void => scheduleRender(),
          showUnitDetails: (unit): void => {
            const unitDetails = new UnitDetails(unitInfo, unit);

            unitDetails.build();

            // With no unit active, its section goes rather than standing empty over the map (#697).
            const section = unitInfo.closest<HTMLElement>('.sidebar-section');

            if (section) {
              section.hidden = unit === null;
            }

            // Its unit is checked against the map next: the section's new size first (#697).
            mapView.measureCovered();
          },
          transport,
          unitsLayer: mapView.unitsLayer,
          world,
        }),
        hud = new Hud({
          actionArea,
          gameArea,
          gameInfo,
          notices,
          playerInfo,
          portal,
          secondaryActionArea,
          transport,
          unitAction: (unitId, unitAction): void =>
            void unitController.act(unitId, unitAction),
          unitActionArea,
          world,
        }),
        gameMenuItem = new GameMenu(
          gameMenu,
          // `data` is replaced on a full rebuild, so this always
          // resolves to the current player rather than the turn-0
          // snapshot.
          () => gameState.data().player,
          // Same reason: the turn a save is named after is the turn it
          // was taken on.
          turn,
          portal,
          transport,
          cheatsEnabled
        );

      this.#unitController = unitController;

      gameMenuItem.build();

      // This needs wrapping.
      // let lastTurn = 1,
      //   clearNextTurn = false;

      // The `?debug=1` panel, hotkeys and memory testbed. Built before
      // the game's `keydown` handler below is registered, as it always
      // was; its own hotkey listener is capture-phase.
      const debugPanel = new DebugPanel(debugFlags, {
        citiesMap: mapView.citiesLayer,
        cityNamesMap: mapView.cityNamesLayer,
        currentObjectCount: () => gameState.currentObjectCount(),
        currentTurn: () => gameState.currentTurn(),
        data: () => gameState.data(),
        minimap: mapView.minimap,
        notificationBar,
        portal,
        setActiveUnit: (unit) => unitController.set(unit),
        tilesPendingRender: () => mapView.tilesPending(),
        transport,
        unitsMap: mapView.unitsLayer,
        yieldsMap: mapView.yieldsLayer,
      });

      // `pagehide`, not `beforeunload`: the leave guard can still cancel an unload after `beforeunload`, and a
      //  page restored from the back/forward cache comes back as it was. Tearing down in either case left a
      //  game with nothing listening to the worker.
      on(window, 'pagehide', (event: PageTransitionEvent) => {
        if (event.persisted) {
          return;
        }

        mapView.dispose();
        debugPanel.dispose();

        transportDisposers.forEach((dispose) => dispose());
      });

      let renderFrame: number | null = null;

      // Whether an End Turn is on its way, sent by hand or by auto end of turn, until the worker answers it. The patch
      //  that answers it comes before `turnEnded`, and still has End Turn as the only thing left, so without this auto
      //  end of turn would send a second one, which could end the next turn before it started (#151).
      let endTurnSent = false;

      const endTurnListener = (): void => {
        endTurnSent = true;
      };

      document.addEventListener('endturn', endTurnListener);
      transportDisposers.push((): void =>
        document.removeEventListener('endturn', endTurnListener)
      );

      // The display work — the windows watching `dataChanges`, `hud`'s
      // panels, the active unit and the full `portal` composite — reads only
      // the latest `data`/`activeUnit`, so it is safe to run at most once per
      // animation frame however many patch flushes arrive.
      let firstRender = true;

      const render = (): void => {
        if (firstRender) {
          firstRender = false;

          performance.mark('civ:first-render');
        }

        dataChanges.notify(gameState.data());

        hud.build(
          gameState.data(),
          unitController.active(),
          gameState.waiting()
        );

        unitController.render(unitController.active());

        mapView.flush();
      };

      const scheduleRender = (): void => {
        if (renderFrame !== null) {
          return;
        }

        renderFrame = requestAnimationFrame(() => {
          renderFrame = null;

          render();
        });
      };

      transportDisposers.push(() => {
        if (renderFrame !== null) {
          cancelAnimationFrame(renderFrame);

          renderFrame = null;
        }
      });

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
      let turnShown = turn();

      gameState.onUpdated((): void => {
        if (observing && turn() !== turnShown) {
          turnShown = turn();

          notices.rollTurn();
        }

        mapView.releaseTiles();

        unitController.next(
          gameState.data().player.actions,
          gameState.waiting()
        );

        scheduleRender();

        // Keys kept while the unit's orders were on their way. Those kept
        // behind a move or another order wait for its `actionHandled`
        // (#326, #543).
        unitController.drain();

        if (
          !endTurnSent &&
          shouldAutoEndTurn(
            gameState.data().player,
            options,
            gameState.waiting()
          )
        ) {
          endTurnSent = true;

          // Not `endTurn()`: a turn nobody played should not clear the notices waiting to be read.
          transport.send('action', {
            name: 'EndTurn',
          });
        }
      });

      // Not a full rebuild: `data` was built from this map above and
      // nothing has changed in it since, so the incremental rebuild
      // finds nothing to fill. The rest (the turn, the prune check, the
      // actions) still runs.
      gameState.update();

      transportDisposers.push((): void => gameState.dispose());

      transportDisposers.push(
        transport.receive('gameData', (rawData) => {
          unitController.dataReceived();

          gameState.replace(rawData);

          // A whole new game's data, as an observer's change of view sends (#613): every square is drawn again, since
          //  what was unknown may now be known, which no patch has said, and the notices were the old view's.
          if (observing) {
            notices.clear();
          }

          gameState
            .data()
            .player.world.tiles.forEach((tile) => mapView.queueTile(tile));
          mapView.releaseTiles();
          scheduleRender();
        })
      );

      // The move drawn before its answer (#326), or any other order
      // (#543), settled by its own acknowledgement.
      transportDisposers.push(
        transport.receive('actionHandled', (action): void => {
          // Answered: the turn ends (`turnEnded` follows at once), or it goes on, as when talks are open (#491), and End
          //  Turn may be sent again.
          if (action.name === 'EndTurn') {
            endTurnSent = false;
          }

          unitController.actionHandled(action);
        })
      );

      transportDisposers.push(
        transport.receive('turnEnded', (): void => {
          gameState.setWaiting(true);
          waitingBanner.textContent = t(
            observing ? 'Observer.watching' : 'Game.waiting'
          );

          gameState.update();
        })
      );

      // The first turn handed over is saved only for a new game (#653): see `autosaveDue`.
      let firstTurnStarted = true;

      transportDisposers.push(
        transport.receive('turnStarted', (): void => {
          // A new turn: an End Turn sent before it was handed over is never answered, as the worker wasn't listening
          //  (#151).
          endTurnSent = false;

          // Nor is any unit's order sent while waiting: the keys are free for the new turn (#543).
          unitController.turnStarted();

          // Drops the rebuild deferred while waiting: this one replaces
          // it.
          gameState.setWaiting(false);
          waitingBanner.textContent = '';

          gameState.update();

          // Kept in the browser (#653), now that the worker has nothing to do until the player does something. Never
          //  for a game being watched: nobody's turn here is handed over.
          const autosave = observing
            ? null
            : autosaveDue(turn(), options.get('autosave', '5'), {
                firstOfSession: firstTurnStarted,
                newGame: pendingSave === null,
              });

          if (autosave !== null) {
            gameMenuItem.autosave(autosave);
          }

          firstTurnStarted = false;

          // Now rather than next frame: the turn's messages follow
          // straight away, and should open over the new turn, not the
          // last one.
          if (renderFrame !== null) {
            cancelAnimationFrame(renderFrame);

            renderFrame = null;
          }

          render();
        })
      );

      transportDisposers.push(
        transport.receive('gameDataPatch', (data: DataPatch[]) => {
          unitController.dataReceived();

          // Rebuilt now, or once a frame while waiting for the turn.
          gameState.applyPatches(data);
        })
      );

      transportDisposers.push(
        transport.receive('gameNotification', (notification): void => {
          if (!notification.bubble) {
            notifications.receive(notification);

            return;
          }

          notices.add(notification);

          scheduleRender();
        })
      );

      transportDisposers.push(
        transport.receive('unitHalted', (halt): void => {
          haltedUnits.add(halt);

          if (!gameState.waiting()) {
            gameState.update();
          }
        })
      );

      // The observer's bar (#607), redrawn as the worker's `observer` state changes: a new view's `gameData` follows,
      //  and replaces the game's data as a load does.
      if (observing) {
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

      // A Diplomat's embassy opens the report on that civilization, and an investigated city's screen opens
      //  read-only (#58).
      transportDisposers.push(
        transport.receive(
          'embassyEstablished',
          (civilization): void =>
            void new IntelligenceReport(transport, civilization)
        ),
        transport.receive(
          'investigateCity',
          (city): void =>
            void new City(city as unknown as CityData, portal, transport, {
              readOnly: true,
            })
        )
      );

      // The game's keyboard. Registered here, as the handler always
      // was: after `ReloadGuard` and the debug panel's capture-phase
      // hotkeys, so it is the last `keydown` bubble listener on
      // `document`.
      new InputController({
        actionArea,
        data: () => gameState.data(),
        gameMenu: gameMenuItem,
        mapView,
        notificationBar,
        portal,
        transport,
        unitController,
        waiting: () => gameState.waiting(),
      });
    } catch (e) {
      console.error(e);
    }
  }
}

export default GameSession;
