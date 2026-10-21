import { City as CityData, DataPatch } from './types';
import { emit, on, s } from '@dom111/element';
import { t } from 'i18next';
import { ObjectMap } from './lib/reconstituteData';
import Actions from './components/Actions';
import UnitActions from './components/UnitActions';
import City from './components/City';
import CityStatus from './components/CityStatus';
import CivilizationScoreReport from './components/CivilizationScoreReport';
import GameDetails from './components/GameDetails';
import GameMenu from './components/GameMenu';
import HappinessReport from './components/HappinessReport';
import GameOverWindow from './components/GameOverWindow';
import MainMenu from './components/MainMenu';
import { downloadSave, takePendingSave } from './lib/savedGame';
import { guardLeaving } from './lib/leaveGuard';
import endTurn from './lib/endTurn';
import NotificationWindow from './components/NotificationWindow';
import Notices from './components/Notices';
import Notifications from './components/Notifications';
import PlayerDetails from './components/PlayerDetails';
import ScienceReport from './components/ScienceReport';
import IntelligenceReport from './components/IntelligenceReport';
import TopCitiesReport from './components/TopCitiesReport';
import HaltedUnits from './lib/haltedUnits';
import TradeReport from './components/TradeReport';
import Transport from './Transport';
import UnitDetails from './components/UnitDetails';
import Window from './components/Window';
import { instance as options } from './GameOptionsRegistry';
import { mappedKeyFromEvent } from './lib/mappedKey';
import partitionActions from './lib/playerActionPanels';
import shouldAutoEndTurn from './lib/autoEndTurn';
import { instance as dataChanges } from './lib/DataChanges';
import ActiveUnitController from './game/ActiveUnitController';
import MapView from './game/MapView';
import GameState from './game/GameState';
import DebugFlags from './debug/DebugFlags';
import DebugPanel from './debug/DebugPanel';
import parseBooleanParam from './lib/parseBooleanParam';
import appElements from './app/elements';
import initI18n from './app/i18n';
import { preloadAssets, setCursor } from './app/assets';
import setOptionDefaults from './app/options';
import ReloadGuard from './app/ReloadGuard';
import NotificationBar from './app/NotificationBar';
import ChoiceHandler from './app/ChoiceHandler';

// TODO: !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//  ! Break this down and use a front-end framework? !
//  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

export class Renderer {
  #transport: Transport;

  constructor(transport: Transport) {
    this.#transport = transport;
  }

  async init() {
    const transport = this.#transport;
    const queryParams = new URLSearchParams(window.location.search);

    const debugFlags = new DebugFlags(
      parseBooleanParam(queryParams.get('debug'), false)
    );

    // Once a game is running, F5 is a leader-screen shortcut (TradeReport),
    // not a reload; only Ctrl/Cmd+R stays a reload from that point on.
    let gameStarted = false;

    await setCursor();
    await initI18n();

    new ReloadGuard(() => gameStarted);

    setOptionDefaults();

    DebugPanel.automateLocalPlayer(debugFlags, transport);

    try {
      const {
          notificationArea,
          mainMenuElement,
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
          preloadContainer,
        } = appElements(),
        notifications = new Notifications(),
        notices = new Notices(),
        // Taken, not read: one reload loads one save. Read here so the welcome
        // window can be skipped — a loaded game is not a new one.
        pendingSave = await takePendingSave(),
        mainMenu = new MainMenu(mainMenuElement, this.#transport),
        // Units whose GoTo stopped next to a choice (#357).
        haltedUnits = new HaltedUnits();

      preloadAssets(preloadContainer);

      // Made once the game data, and the map it draws on, have arrived. The
      //  choice windows' receiver below, registered before then, forgets the
      //  keys kept for a unit through it.
      let activeUnitController: ActiveUnitController | null = null;

      const transportDisposers: Array<() => void> = [];

      transportDisposers.push(
        transport.receive('saveGame', ({ name, data }): void => {
          downloadSave(name, data).catch((error: Error): void =>
            window.alert(
              t('SavedGame.could-not-write', { error: error.message })
            )
          );
        })
      );

      // However the game ends (#176). Listened for from the start: a game loaded at its ending says so before its map
      //  arrives.
      transportDisposers.push(
        transport.receive(
          'gameOver',
          (details): void => void new GameOverWindow(details, transport)
        )
      );

      const notificationBar = new NotificationBar(notificationArea);

      transportDisposers.push(notificationBar.listen(transport));

      transportDisposers.push(
        ChoiceHandler.listen(transport, {
          clearKeys: (): void => activeUnitController?.clearKeys(),
          debugFlags,
        })
      );

      transport.receiveOnce(
        'gameData',
        (
          // The map as it arrived: the transport does not rebuild it, so that
          // it is rebuilt once, here (#333).
          objectMap: ObjectMap
        ) => {
          performance.mark('civ:game-data-received');

          try {
            gameStarted = true;

            // The first rebuild, which everything below that needs the
            // player is built from; each update goes on refilling it.
            const gameState = new GameState(objectMap, {
              tiles: {
                queueTile: (tile): void => mapView.queueTile(tile),
                setTiles: (tiles, changed): void =>
                  world.setTiles(tiles, changed),
              },
            });

            guardLeaving();

            // Only for a new game: "you have risen" is an introduction, and a
            // loaded game has already had one.
            if (pendingSave === null) {
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
                      ...gameState
                        .data()
                        .player.research.complete.map((advance) =>
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

            mapPortal.width = (
              mapPortal.parentElement as HTMLElement
            ).offsetWidth;
            mapPortal.height = (
              mapPortal.parentElement as HTMLElement
            ).offsetHeight;

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
                },
                transport,
                unitsLayer: mapView.unitsLayer,
                world,
              }),
              primaryActions = new Actions(actionArea, portal, this.#transport),
              secondaryActions = new Actions(
                secondaryActionArea,
                portal,
                this.#transport
              ),
              unitActionButtons = new UnitActions(
                unitActionArea,
                this.#transport
              ),
              gameMenuItem = new GameMenu(
                gameMenu,
                // `data` is replaced on a full rebuild, so this always
                // resolves to the current player rather than the turn-0
                // snapshot.
                () => gameState.data().player,
                // Same reason: the turn a save is named after is the turn it
                // was taken on.
                () => Number(gameState.data()?.turn?.value ?? 0),
                portal,
                transport,
                parseBooleanParam(queryParams.get('cheat'), false)
              );

            activeUnitController = unitController;

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

            // The display work — both `Actions` panels, detail panels, the
            // windows watching `dataChanges`, and the full `portal` composite —
            // reads only the latest `data`/`activeUnit`, so it is safe to run at
            // most once per animation frame however many patch flushes arrive.
            let firstRender = true;

            const render = (): void => {
              if (firstRender) {
                firstRender = false;

                performance.mark('civ:first-render');
              }

              dataChanges.notify(gameState.data());

              const { primary, secondary } = partitionActions(
                gameState.data().player.actions,
                notices.actions(gameState.data()),
                gameState.waiting()
              );

              primaryActions.build(primary, gameState.data().player);

              secondaryActions.build(secondary);

              const activeUnit = unitController.active();

              unitActionButtons.build(
                gameState.waiting() ? null : activeUnit,
                activeUnit
                  ? world.get(activeUnit.tile.x, activeUnit.tile.y)
                  : null
              );

              gameArea.append(primaryActions.element());

              const gameDetails = new GameDetails(
                gameInfo,
                gameState.data().turn,
                gameState.data().year,
                gameState.data().difficulty
              );

              gameDetails.build();

              const playerDetails = new PlayerDetails(
                playerInfo,
                gameState.data().player
              );

              playerDetails.build();

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
            gameState.onUpdated((): void => {
              mapView.releaseTiles();

              unitController.next(
                gameState.data().player.actions,
                gameState.waiting()
              );

              scheduleRender();

              // Keys kept while the unit's orders were on their way. Those kept
              // behind a move wait for its `actionHandled` (#326).
              unitController.drain();

              if (
                shouldAutoEndTurn(
                  gameState.data().player,
                  options,
                  gameState.waiting()
                )
              ) {
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
              })
            );

            // The move drawn before its answer (#326), settled by its own
            // acknowledgement.
            transportDisposers.push(
              transport.receive('actionHandled', (action): void =>
                unitController.actionHandled(action)
              )
            );

            transportDisposers.push(
              transport.receive('turnEnded', (): void => {
                gameState.setWaiting(true);
                waitingBanner.textContent = t('Game.waiting');

                gameState.update();
              })
            );

            transportDisposers.push(
              transport.receive('turnStarted', (): void => {
                // Drops the rebuild deferred while waiting: this one replaces
                // it.
                gameState.setWaiting(false);
                waitingBanner.textContent = '';

                gameState.update();

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
                  void new City(
                    city as unknown as CityData,
                    portal,
                    transport,
                    {
                      readOnly: true,
                    }
                  )
              )
            );

            const leaderScreensMap: { [key: string]: () => any } = {
              F1: () =>
                new CityStatus(gameState.data().player, portal, transport),
              F3: () => new IntelligenceReport(transport),
              F4: () =>
                new HappinessReport(gameState.data().player, portal, transport),
              F5: () =>
                new TradeReport(gameState.data().player, portal, transport),
              F6: () => new ScienceReport(gameState.data().player),
              F8: () => new TopCitiesReport(transport),
              F9: () => new CivilizationScoreReport(transport),
            };

            let lastShiftedCode = '';

            on(document, 'keydown', (event) => {
              const key = mappedKeyFromEvent(event);

              if (key in leaderScreensMap) {
                leaderScreensMap[event.key]();

                event.preventDefault();
              }

              const modalWindow = document.querySelector('dialog.window.modal');

              if (document.activeElement === document.body && modalWindow) {
                event.preventDefault();

                emit(
                  modalWindow,
                  new KeyboardEvent('keydown', {
                    key: event.key,
                  })
                );

                return;
              }

              // Kept while a move is answered, and played once it has been
              // (#326).
              if (unitController.pressKey(key)) {
                event.stopPropagation();
                event.preventDefault();

                return;
              }

              if (key === 'Escape' && document.activeElement !== null) {
                (document.activeElement as HTMLElement).blur();

                return;
              }

              if (
                key === 'Enter' &&
                !gameState.waiting() &&
                gameState
                  .data()
                  .player.mandatoryActions.some(
                    (action) => action._ === 'EndTurn'
                  )
              ) {
                endTurn(transport);

                event.stopPropagation();
                event.preventDefault();

                return;
              }

              if (key === 'Tab') {
                const topAction = actionArea.querySelector(
                  'div.action:first-child button'
                ) as HTMLButtonElement | null;

                if (topAction !== null) {
                  topAction.focus();

                  event.preventDefault();
                  event.stopPropagation();

                  return;
                }
              }

              const activeUnit = unitController.active();

              if (key === 'c' && activeUnit) {
                mapView.centre(activeUnit.tile);

                return;
              }

              if (key === 'w' && activeUnit) {
                unitController.wait();

                event.stopPropagation();
                event.preventDefault();

                return;
              }

              if (key === 't') {
                mapView.toggleUnits();

                return;
              }

              if (key === 'y') {
                mapView.toggleYields();

                return;
              }

              // Shift+5 then Shift+6, as in Civ1: turns on the game menu's
              // cheat items for this session. Matched on the physical keys,
              // because what Shift+5 types depends on the keyboard layout.
              const shiftedCode = event.shiftKey ? event.code : '';

              if (lastShiftedCode === 'Digit5' && shiftedCode === 'Digit6') {
                gameMenuItem.enableCheats();

                notificationBar.show(t('GameMenu.cheat.enabled'));

                return;
              }

              lastShiftedCode = shiftedCode;
            });
          } catch (e) {
            console.error(e);
          }
        }
      );

      // Last, because the worker starts hydrating the moment it is told to and
      // the first `gameData` follows immediately: every handler above has to be
      // listening before that. There is no `start` for a loaded game — that is
      // what generates a world.
      if (pendingSave !== null) {
        mainMenu.remove();

        // Marks a DevTools timeline or `performance.getEntriesByType('mark')` can read, for where a load's time goes (#325).
        performance.mark('civ:load-sent');

        transport.send('load', { data: pendingSave });
      }
    } catch (e) {
      console.error(e);
    }
  }
}

export default Renderer;
