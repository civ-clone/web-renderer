import { City as CityData, DataPatch, GameData, Tile } from './types';
import { emit, off, on, s } from '@dom111/element';
import { t } from 'i18next';
import { ObjectMap } from './lib/reconstituteData';
import Actions from './components/Actions';
import UnitActions from './components/UnitActions';
import ActiveUnit from './components/Map/ActiveUnit';
import City from './components/City';
import Cities from './components/Map/Cities';
import CityNames from './components/Map/CityNames';
import CityStatus from './components/CityStatus';
import CivilizationScoreReport from './components/CivilizationScoreReport';
import Fog from './components/Map/Fog';
import GameDetails from './components/GameDetails';
import GameMenu from './components/GameMenu';
import GamePortal from './components/GamePortal';
import HappinessReport from './components/HappinessReport';
import IntervalHandler from './lib/IntervalHandler';
import Landscape from './components/Map/Landscape';
import GameOverWindow from './components/GameOverWindow';
import MainMenu from './components/MainMenu';
import { downloadSave, takePendingSave } from './lib/savedGame';
import { guardLeaving } from './lib/leaveGuard';
import endTurn from './lib/endTurn';
import Minimap from './components/Minimap';
import NotificationWindow from './components/NotificationWindow';
import Notices from './components/Notices';
import Overview from './components/Map/Overview';
import Notifications from './components/Notifications';
import PlayerDetails from './components/PlayerDetails';
import ScienceReport from './components/ScienceReport';
import IntelligenceReport from './components/IntelligenceReport';
import TopCitiesReport from './components/TopCitiesReport';
import HaltedUnits from './lib/haltedUnits';
import TradeReport from './components/TradeReport';
import Transport from './Transport';
import UnitDetails from './components/UnitDetails';
import Units from './components/Map/Units';
import Window from './components/Window';
import World from './components/World';
import Yields from './components/Map/Yields';
import { instance as options } from './GameOptionsRegistry';
import { mappedKeyFromEvent } from './lib/mappedKey';
import pruneObjectMap from './lib/pruneObjectMap';
import PruneSchedule from './lib/PruneSchedule';
import partitionActions from './lib/playerActionPanels';
import shouldAutoEndTurn from './lib/autoEndTurn';
import applyDataPatches from './lib/applyDataPatches';
import IncrementalReconstituter from './lib/IncrementalReconstituter';
import { instance as dataChanges } from './lib/DataChanges';
import ActiveUnitController from './game/ActiveUnitController';
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

      // Keyed by coordinate: a tile resent several times between two renders
      // only needs building once. A layer redraws a tile by looking its
      // coordinates up in `world`, so a patched tile is only ready to render
      // once `updateState` has refreshed `world`: until then it waits in
      // `incomingTiles`. While waiting for the turn that can be a frame or
      // more, and a render in between would draw the tile as it was.
      const incomingTiles = new Map<string, Tile>(),
        tilesToRender = new Map<string, Tile>(),
        queueTileToRender = (tile: Tile): void => {
          incomingTiles.set(`${tile.x},${tile.y}`, tile);
        },
        releaseIncomingTiles = (): void => {
          incomingTiles.forEach((tile, key) => tilesToRender.set(key, tile));
          incomingTiles.clear();
        },
        takeTilesToRender = (): Tile[] => {
          const tiles = [...tilesToRender.values()];

          tilesToRender.clear();

          return tiles;
        };

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

            // Declared here for the first rebuild, which everything below
            // that needs the player is built from; `updateState` goes on
            // refilling it with each patch.
            const reconstituter = new IncrementalReconstituter();

            let data = reconstituter.rebuild(objectMap, null) as GameData;

            guardLeaving();

            // Only for a new game: "you have risen" is an introduction, and a
            // loaded game has already had one.
            if (pendingSave === null) {
              new NotificationWindow(
                'Welcome',
                s(
                  `<div class="welcome">
<p>${t('Welcome.you-have-risen', {
                    player: data.player,
                  })}</p>
<p>${t('Welcome.your-people-have-knowledge-of', {
                    advances: [
                      'Irrigation',
                      'Mining',
                      'Roads',
                      ...data.player.research.complete.map((advance) =>
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

            // From the worker accepting `EndTurn` until it hands the next
            // turn over. Nothing sent in between is listened for, and the
            // data still describes the turn just ended, so there is nothing
            // to select or act on (#61, #130).
            let waitingForTurn = false;

            // Always in the document and emptied rather than hidden, so that
            // setting the text is announced: it explains why the controls
            // have stopped responding.
            const waitingBanner = s(
              `<div class="waiting" role="status" aria-live="polite"></div>`
            );

            mapWrapper.append(waitingBanner);

            const world = new World(data.player.world),
              intervalHandler = new IntervalHandler(),
              portal = new GamePortal(
                world,
                transport,
                mapPortal,
                {
                  lockVerticalEdges: options.get('lockVerticalEdges', false),
                  playerId: data.player.id,
                  scale: options.get('mapScale', 2),
                  // TODO: this needs to come from the theme
                  tileSize: 16,
                },
                Landscape,
                // Never composited onto the map; it rides in the layer list so
                // `portal.build()` feeds it tile updates like any other layer.
                Overview,
                Fog,
                Yields,
                Units,
                Cities,
                CityNames,
                ActiveUnit
              ),
              overviewMap = portal.getLayer(Overview) as Overview,
              yieldsMap = portal.getLayer(Yields) as Yields,
              unitsMap = portal.getLayer(Units) as Units,
              citiesMap = portal.getLayer(Cities) as Cities,
              cityNamesMap = portal.getLayer(CityNames) as CityNames,
              activeUnitsMap = portal.getLayer(ActiveUnit) as ActiveUnit,
              unitController = new ActiveUnitController({
                activeUnitLayer: activeUnitsMap,
                arrivalClosed: (): void => {
                  if (!waitingForTurn) {
                    updateState(objectMap);
                  }
                },
                data: () => data,
                haltedUnits,
                options,
                portal,
                scheduleRender: (): void => scheduleRender(),
                showUnitDetails: (unit): void => {
                  const unitDetails = new UnitDetails(unitInfo, unit);

                  unitDetails.build();
                },
                transport,
                unitsLayer: unitsMap,
                world,
              }),
              minimap = new Minimap(
                minimapCanvas,
                world,
                portal,
                overviewMap,
                // The marker shares the main map's blink phase, so the active
                // unit can be found on the minimap and clicked to centre
                // without reaching for the keyboard.
                () => {
                  const activeUnit = unitController.active();

                  return activeUnit && activeUnitsMap.isVisible()
                    ? activeUnit.tile
                    : null;
                }
              ),
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
                // `data` is reassigned on every patch, so this always resolves
                // to the current player rather than the turn-0 snapshot.
                () => data.player,
                // Same reason: the turn a save is named after is the turn it
                // was taken on.
                () => Number(data?.turn?.value ?? 0),
                portal,
                transport,
                parseBooleanParam(queryParams.get('cheat'), false)
              ),
              resizeHandler = () => {
                const width = (mapPortal.parentElement as HTMLElement)
                    .offsetWidth,
                  height = (mapPortal.parentElement as HTMLElement)
                    .offsetHeight;

                // Assigning either of these clears the canvas even when the
                // value has not changed, and the portal composites what changed
                // rather than everything, so a resize that resizes nothing
                // would wipe the map and put nothing back.
                if (mapPortal.width === width && mapPortal.height === height) {
                  return;
                }

                mapPortal.width = width;
                mapPortal.height = height;

                // The layers are the size of the portal, so resizing them is
                // part of rendering now.
                portal.render();
                minimap.update();
              };

            activeUnitController = unitController;

            gameMenuItem.build();

            yieldsMap.setVisible(false);

            portal.on('focus-changed', () => minimap.update());
            portal.on('activate-unit', (unit) => {
              if (waitingForTurn) {
                return;
              }

              unitController.set(unit);
            });

            intervalHandler.on(() => {
              // With no active unit the layer draws nothing, so toggling it is
              // invisible and there is no reason to composite every layer for
              // it. `unitController.render` sets the layer visible again
              // whenever a unit becomes active, so leaving the flag alone here
              // is safe.
              const blinking = activeUnitsMap.hasActiveUnit();

              if (blinking) {
                activeUnitsMap.setVisible(!activeUnitsMap.isVisible());
              }

              const hasTilesToRender = tilesToRender.size > 0;

              if (hasTilesToRender) {
                portal.build(takeTilesToRender());
              }

              if (blinking || hasTilesToRender) {
                portal.render();
                minimap.update();
              }
            });

            on(window, 'resize', resizeHandler);

            // This needs wrapping.
            // let lastTurn = 1,
            //   clearNextTurn = false;

            const pruneSchedule = new PruneSchedule(
              Object.keys(objectMap.objects).length
            );

            let currentTurn = Number(data?.turn?.value ?? 0),
              currentObjectCount = Object.keys(objectMap.objects).length;

            // The `?debug=1` panel, hotkeys and memory testbed. Built before
            // the game's `keydown` handler below is registered, as it always
            // was; its own hotkey listener is capture-phase.
            const debugPanel = new DebugPanel(debugFlags, {
              citiesMap,
              cityNamesMap,
              currentObjectCount: () => currentObjectCount,
              currentTurn: () => currentTurn,
              data: () => data,
              minimap,
              portal,
              setActiveUnit: (unit) => unitController.set(unit),
              tilesPendingRender: () => tilesToRender.size,
              transport,
              unitsMap,
              yieldsMap,
            });

            // `pagehide`, not `beforeunload`: the leave guard can still cancel an unload after `beforeunload`, and a
            //  page restored from the back/forward cache comes back as it was. Tearing down in either case left a
            //  game with nothing listening to the worker.
            on(window, 'pagehide', (event: PageTransitionEvent) => {
              if (event.persisted) {
                return;
              }

              off(window, 'resize', resizeHandler);
              intervalHandler.dispose();
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

              dataChanges.notify(data);

              const { primary, secondary } = partitionActions(
                data.player.actions,
                notices.actions(data),
                waitingForTurn
              );

              primaryActions.build(primary, data.player);

              secondaryActions.build(secondary);

              const activeUnit = unitController.active();

              unitActionButtons.build(
                waitingForTurn ? null : activeUnit,
                activeUnit
                  ? world.get(activeUnit.tile.x, activeUnit.tile.y)
                  : null
              );

              gameArea.append(primaryActions.element());

              const gameDetails = new GameDetails(
                gameInfo,
                data.turn,
                data.year,
                data.difficulty
              );

              gameDetails.build();

              const playerDetails = new PlayerDetails(playerInfo, data.player);

              playerDetails.build();

              unitController.render(unitController.active());

              // ensure UI looks responsive
              portal.build(takeTilesToRender());
              portal.render();

              minimap.update();
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

            // Rebuilds only what the patches since the last update reached
            // (#322): every id they added, replaced or edited in place goes in
            // `changedIds` until `updateState` takes it, so patches coalesced
            // while waiting for the turn are all accounted for.
            let changedIds = new Set<string>();

            // Runs synchronously on every patch. Reconstitution and all state
            // the input handlers read synchronously (`data`, `world` tiles,
            // `unitController`'s active unit, queue and last unit, the map
            // layers' active-unit pointers) must stay here — deferring any of
            // it (tried 2026-07-02) left `activeUnit` stale for ~1 frame and
            // broke consecutive moves of multi-move units. Only `render()` is coalesced to one run per
            // frame.
            //
            // `rebuildAll` is for a map that did not come from patches, whose
            // changes are not known.
            const updateState = (
              objectMap: ObjectMap,
              rebuildAll = false
            ): void => {
              const changed = rebuildAll ? null : changedIds;

              changedIds = new Set();

              // TODO: look into if it's possible to have data reconstituted in a worker thread
              data = reconstituter.rebuild(objectMap, changed) as GameData;

              // Accumulated until the next render's `notify`: several rebuilds
              //  can come between two renders, and `filledIds` is the last
              //  one's alone. It adds the owners of refs that have just
              //  arrived; `changed` adds the ids removed.
              dataChanges.collect(
                changed === null
                  ? null
                  : [...changed, ...reconstituter.filledIds()]
              );

              const turnValue = Number(data?.turn?.value ?? 0),
                objectCount = Object.keys(objectMap.objects).length;

              currentTurn = turnValue;
              currentObjectCount = objectCount;

              if (pruneSchedule.due(turnValue, objectCount)) {
                reconstituter.forget(pruneObjectMap(objectMap));
                pruneSchedule.pruned(
                  turnValue,
                  Object.keys(objectMap.objects).length
                );
              }

              // Refilled when a patch re-sent the world, as it does for a tile
              // newly seen. The tiles keep their objects otherwise, so the
              // lookup stays as it is.
              world.setTiles(
                data.player.world.tiles,
                reconstituter.refilled(data.player.world.id)
              );
              releaseIncomingTiles();

              unitController.next(data.player.actions, waitingForTurn);

              scheduleRender();

              // Keys kept while the unit's orders were on their way. Those kept
              // behind a move wait for its `actionHandled` (#326).
              unitController.drain();

              if (shouldAutoEndTurn(data.player, options, waitingForTurn)) {
                // Not `endTurn()`: a turn nobody played should not clear the notices waiting to be read.
                transport.send('action', {
                  name: 'EndTurn',
                });
              }
            };

            // Not `rebuildAll`: `data` was built from this map above and
            // nothing has changed in it since, so the incremental rebuild
            // finds nothing to fill. The rest (the turn, the prune check, the
            // actions) still runs.
            updateState(objectMap);

            // While waiting there is no input to keep up with, so however many
            // patches the other civilizations' moves send, the data is rebuilt
            // at most once a frame (#61). During the player's own turn it has
            // to stay synchronous: see `updateState`.
            let stateFrame: number | null = null;

            const cancelStateUpdate = (): void => {
                if (stateFrame !== null) {
                  cancelAnimationFrame(stateFrame);

                  stateFrame = null;
                }
              },
              scheduleStateUpdate = (): void => {
                if (stateFrame !== null) {
                  return;
                }

                stateFrame = requestAnimationFrame(() => {
                  stateFrame = null;

                  updateState(objectMap);
                });
              };

            transportDisposers.push(cancelStateUpdate);

            transportDisposers.push(
              transport.receive('gameData', (rawData) => {
                unitController.dataReceived();

                updateState(rawData, true);
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
                waitingForTurn = true;
                waitingBanner.textContent = t('Game.waiting');

                updateState(objectMap);
              })
            );

            transportDisposers.push(
              transport.receive('turnStarted', (): void => {
                waitingForTurn = false;
                waitingBanner.textContent = '';

                cancelStateUpdate();
                updateState(objectMap);

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

                applyDataPatches(objectMap, data, {
                  changed: (id) => changedIds.add(id),
                  // Since we only use tilesToRender for x and y this should be fine...
                  tile: (tile) => queueTileToRender(tile as Tile),
                });

                if (waitingForTurn) {
                  scheduleStateUpdate();

                  return;
                }

                updateState(objectMap);
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

                if (!waitingForTurn) {
                  updateState(objectMap);
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
              F1: () => new CityStatus(data.player, portal, transport),
              F3: () => new IntelligenceReport(transport),
              F4: () => new HappinessReport(data.player, portal, transport),
              F5: () => new TradeReport(data.player, portal, transport),
              F6: () => new ScienceReport(data.player),
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
                !waitingForTurn &&
                data.player.mandatoryActions.some(
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
                portal.setCenter(activeUnit.tile.x, activeUnit.tile.y);

                portal.render();
                minimap.update();

                return;
              }

              if (key === 'w' && activeUnit) {
                unitController.wait();

                event.stopPropagation();
                event.preventDefault();

                return;
              }

              if (key === 't') {
                unitsMap.setVisible(!unitsMap.isVisible());
                citiesMap.setVisible(!citiesMap.isVisible());
                cityNamesMap.setVisible(!cityNamesMap.isVisible());

                portal.render();

                return;
              }

              if (key === 'y') {
                yieldsMap.setVisible(!yieldsMap.isVisible());

                portal.render();

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
