import {
  City as CityData,
  DataPatch,
  Dialogue,
  GameData,
  Interactions,
  Negotiation,
  PlayerAction,
  Resolution,
  Tile,
  Unit,
  UnitAction,
} from './types';
import { emit, off, on, s } from '@dom111/element';
import { t } from 'i18next';
import { ObjectMap } from './lib/reconstituteData';
import Actions from './components/Actions';
import UnitActions from './components/UnitActions';
import { directionKeyMap, keyToActionsMap } from './lib/unitActionKeys';
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
import chooseActiveUnit from './lib/chooseActiveUnit';
import {
  chooseFromListBody,
  chooseFromListChoice,
  chooseFromListTitle,
} from './lib/chooseFromList';
import {
  difficultyLabels,
  preselectedDifficulty,
  rememberDifficulty,
} from './lib/difficulty';
import Minimap from './components/Minimap';
import NotificationWindow from './components/NotificationWindow';
import Notices from './components/Notices';
import Overview from './components/Map/Overview';
import Notifications from './components/Notifications';
import PlayerDetails from './components/PlayerDetails';
import ScienceReport from './components/ScienceReport';
import IntelligenceReport from './components/IntelligenceReport';
import TopCitiesReport from './components/TopCitiesReport';
import SelectionWindow from './components/SelectionWindow';
import { chooseUnitAction, openArrivalWindow } from './lib/unitActionPrompts';
import HaltedUnits from './lib/haltedUnits';
import {
  UnitActionsRequest,
  hasUnitActions,
  neighbourActions,
  unitActions,
} from './lib/unitActions';
import TradeReport from './components/TradeReport';
import Transport from './Transport';
import UnitDetails from './components/UnitDetails';
import Units from './components/Map/Units';
import Window from './components/Window';
import World from './components/World';
import Yields from './components/Map/Yields';
import { instance as options } from './GameOptionsRegistry';
import { mappedKeyFromEvent } from './lib/mappedKey';
import instanceOf from './lib/instanceOf';
import pruneObjectMap from './lib/pruneObjectMap';
import PruneSchedule from './lib/PruneSchedule';
import partitionActions from './lib/playerActionPanels';
import shouldAutoEndTurn from './lib/autoEndTurn';
import applyDataPatches from './lib/applyDataPatches';
import IncrementalReconstituter from './lib/IncrementalReconstituter';
import { instance as dataChanges } from './lib/DataChanges';
import ActiveUnitTiles from './lib/ActiveUnitTiles';
import PendingMove, { plainMove } from './lib/PendingMove';
import ActionWindow from './components/ActionWindow';
import DebugFlags from './debug/DebugFlags';
import DebugPanel from './debug/DebugPanel';
import parseBooleanParam from './lib/parseBooleanParam';
import appElements from './app/elements';
import initI18n from './app/i18n';
import { preloadAssets, setCursor } from './app/assets';
import setOptionDefaults from './app/options';
import ReloadGuard from './app/ReloadGuard';

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
        // The worker sends a unit's actions only once asked for them (#323).
        unitActionsRequest = new UnitActionsRequest((unitId) =>
          transport.send('unitActions', unitId)
        ),
        // Units whose GoTo stopped next to a choice (#357).
        haltedUnits = new HaltedUnits(),
        // Input-critical state only: keeps `activeUnit`/`lastUnit` and the map
        // layers' active-unit pointers current synchronously, so consecutive
        // moves of a multi-move unit always read the post-move tile. No render.
        applyActiveUnit = (
          unit: Unit | null,
          portal: GamePortal,
          unitsMap: Units,
          activeUnitsMap: ActiveUnit
        ) => {
          // The keys kept for one unit were meant for it, not the next (#326).
          pendingMove.activate(unit?.id ?? null);

          // While its move is answered, the unit is drawn on the tile it is
          // moving to.
          const pendingTile = pendingMove.destination(unit?.id ?? null);

          activeUnitTiles.change(
            unit === null ? null : { tile: unit.tile, pendingTile }
          );

          activeUnit = unit;

          portal.setActiveUnit(unit);
          unitsMap.setActiveUnit(unit, pendingTile);
          activeUnitsMap.setActiveUnit(unit, pendingTile);

          if (unit !== null) {
            lastUnit = unit;
            waitedUnits.delete(unit.id);
          }

          // Every way a unit becomes active comes through here: the next unit after an update, a click, the stack
          //  window and Wait.
          unitActionsRequest.activate(unit);
        },
        // Display half: safe to defer/coalesce (canvas composites + unit info).
        renderActiveUnit = (
          unit: Unit | null,
          portal: GamePortal,
          unitsMap: Units,
          activeUnitsMap: ActiveUnit
        ) => {
          const unitDetails = new UnitDetails(unitInfo, unit);

          unitDetails.build();

          // Only the tiles an active-unit change actually invalidated, rather
          // than a full-world re-render of the layer on every unit selection
          // and move. Every other tile reaches this layer the same way it
          // reaches the others, through `portal.build(tilesToRender)`.
          unitsMap.update(activeUnitTiles.take());

          unitsMap.setVisible(true);
          activeUnitsMap.render();
          activeUnitsMap.setVisible(true);

          if (unit === null) {
            portal.render();

            return;
          }

          const tile = pendingMove.destination(unit.id) ?? unit.tile;

          // A unit on the very edge of the map is visible but easily missed,
          // so it is brought back to the middle before it gets that far.
          if (
            !portal.isVisible(tile.x, tile.y, options.get('unitEdgeMargin', 0))
          ) {
            portal.setCenter(tile.x, tile.y);
          }

          portal.render();
        },
        // For input call sites (unit selection/cycling), where immediate visual
        // feedback is wanted: apply state then render synchronously.
        setActiveUnit = (
          unit: Unit | null,
          portal: GamePortal,
          unitsMap: Units,
          activeUnitsMap: ActiveUnit
        ) => {
          applyActiveUnit(unit, portal, unitsMap, activeUnitsMap);
          renderActiveUnit(unit, portal, unitsMap, activeUnitsMap);
        };

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
        },
        // Collected in `applyActiveUnit`, which is the only point that still
        // knows the outgoing unit — by the time the coalesced
        // `renderActiveUnit` runs, `lastUnit` has already been pointed at the
        // incoming one.
        activeUnitTiles = new ActiveUnitTiles(),
        // A move drawn before the engine has answered it, and the keys typed
        // while it is (#326).
        pendingMove = new PendingMove<Tile>();

      let globalNotificationTimer: number | undefined,
        lastUnit: Unit | null = null,
        activeUnit: Unit | null = null;

      // Ids of units deferred with `w` (wait), oldest first: held out of
      // auto-selection until every other active unit has had its turn. Ids,
      // not objects, because a full rebuild (a loaded game) makes every object
      // afresh.
      const waitedUnits = new Set<string>();

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

      const showNotification = (data: string): void => {
        notificationArea.innerHTML = data;

        if (globalNotificationTimer) {
          window.clearTimeout(globalNotificationTimer);
        }

        globalNotificationTimer = window.setTimeout((): void => {
          globalNotificationTimer = undefined;

          notificationArea.innerText = '';
        }, 4000);
      };

      transportDisposers.push(
        transport.receive('notification', (data: string): void =>
          showNotification(data)
        )
      );

      // The wording can depend on what kind of proposal it is (a demand for gold or for an advance, say) and on whether
      //  it's one of our own choices: i18next's `context` picks `key_own-gold` over `key_gold` over `key` (#427).
      const interactionContext = (
          interaction: Interactions,
          own: boolean
        ): string | undefined => {
          const kind =
            (interaction as { kind?: string }).kind ??
            (interaction as { proposal?: { kind?: string } }).proposal?.kind;

          return (
            [own ? 'own' : null, kind ?? null]
              .filter((part) => part !== null)
              .join('-') || undefined
          );
        },
        interactionLabel = (interaction: Interactions, own = false) => {
          const context = interactionContext(interaction, own);

          if (instanceOf(interaction, 'Dialogue')) {
            return t(`${interaction._}.${(interaction as Dialogue).key}`, {
              interaction,
              defaultValue: interaction._,
              ns: 'diplomacy',
            });
          }

          if (instanceOf(interaction, 'Proposal')) {
            return t(interaction._, {
              context,
              interaction,
              defaultValue: interaction._,
              ns: 'diplomacy',
            });
          }

          if (instanceOf(interaction, 'Resolution')) {
            const { proposal } = interaction as Resolution;

            return t(`Resolution.${proposal._}.${interaction._}`, {
              context,
              interaction,
              defaultValue: interaction._,
              ns: 'diplomacy',
            });
          }

          return t(`Action.${interaction._}`, {
            interaction,
            defaultValue: interaction._,
            ns: 'diplomacy',
          });
        },
        negotiationLabel = (negotiation: Negotiation) => {
          const currentInteraction = negotiation.lastInteraction;

          if (currentInteraction === null) {
            return 'negotiation.missing-label';
          }

          return interactionLabel(currentInteraction);
        };

      transportDisposers.push(
        transport.receive('chooseFromList', ({ choices, key, data }) => {
          // The worker waits for this before it answers the action that asked
          // (talks a move started, say), so the window can close before the
          // move's answer arrives: the keys kept while it was answered were
          // typed without knowing it would be there. The move stays drawn
          // ahead until its answer (#326).
          pendingMove.clearKeys();

          if (
            debugFlags.uiStressRunner &&
            !debugFlags.stressUiWindowsEnabled &&
            choices.length > 0 &&
            debugFlags.uiStressRunner.isAutomatingChoice(choices[0].id)
          ) {
            transport.send('chooseFromList', choices[0].id);

            return;
          }

          const title = chooseFromListTitle(key, data);

          if (key === 'negotiation.next-step' && choices.length === 1) {
            const window = new ActionWindow(
              title,
              negotiationLabel(data as Negotiation),
              {
                canClose: false,
                actions: {
                  primary: {
                    label: interactionLabel(
                      choices[0].value as Interactions,
                      true
                    ),
                    action: (actionWindow) => actionWindow.close(),
                  },
                },
              }
            );

            window.on('keydown', (event) => {
              if (event.key !== 'Enter') {
                return;
              }

              window.close();

              event.preventDefault();
              event.stopPropagation();
            });

            if (debugFlags.uiStressRunner) {
              debugFlags.uiStressRunner.automateChoice(
                window,
                choices[0].id,
                (choiceId) => transport.send('chooseFromList', choiceId)
              );
            } else {
              window.once('close', () =>
                transport.send('chooseFromList', choices[0].id)
              );
            }

            return;
          }

          const body =
            key === 'negotiation.next-step'
              ? negotiationLabel(data as Negotiation)
              : chooseFromListBody(key, data);

          // Picked client-side, among the choices offered (#15). Not a valid choice id, so it can't collide with one.
          const randomChoice = '@random',
            offerRandom = key === 'choose-civilization' && choices.length > 1,
            // A save from before there were levels (#173): labelled and preselected as the new game menu does it. The
            //  engine sends the levels easiest first.
            difficulties =
              key === 'choose-difficulty'
                ? choices.map(({ value }, level) => ({
                    name: (value as { _: string })._,
                    level,
                  }))
                : null,
            difficultyChoiceLabels = difficulties
              ? difficultyLabels(difficulties)
              : null;

          const selectionWindow = new SelectionWindow(
            title,
            [
              ...(offerRandom
                ? [
                    {
                      label: t(`ChooseFromList.${key}.random`),
                      value: randomChoice,
                    },
                  ]
                : []),
              ...choices.map(({ id, value }, index) => {
                const label =
                  key === 'negotiation.next-step'
                    ? interactionLabel(value as Interactions, true)
                    : difficultyChoiceLabels
                    ? difficultyChoiceLabels[index].label
                    : chooseFromListChoice(key, value);

                return {
                  label,
                  value: id,
                };
              }),
            ],
            (choice) => {
              if (difficulties) {
                const chosen = choices.findIndex(({ id }) => id === choice);

                if (chosen > -1) {
                  rememberDifficulty(difficulties[chosen].name);
                }
              }

              transport.send(
                'chooseFromList',
                offerRandom && choice === randomChoice
                  ? choices[Math.floor(Math.random() * choices.length)].id
                  : choice
              );
            },
            body,
            {
              canClose: false,
              displayAll: true,
            }
          );

          if (difficulties && !selectionWindow.autoChosen()) {
            const preselected = preselectedDifficulty(difficulties),
              preselectedIndex = difficulties.findIndex(
                ({ name }) => name === preselected
              );

            if (preselectedIndex > -1) {
              selectionWindow.selectionList().value =
                choices[preselectedIndex].id;
            }
          }

          if (debugFlags.uiStressRunner && !selectionWindow.autoChosen()) {
            selectionWindow.selectionList().value = choices[0].id;
            debugFlags.uiStressRunner.automateChoice(
              selectionWindow,
              choices[0].id,
              (choiceId) => transport.send('chooseFromList', choiceId)
            );
          }
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

            let activeUnits: PlayerAction[] = [],
              // From the worker accepting `EndTurn` until it hands the next
              // turn over. Nothing sent in between is listened for, and the
              // data still describes the turn just ended, so there is nothing
              // to select or act on (#61, #130).
              waitingForTurn = false;

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
              minimap = new Minimap(
                minimapCanvas,
                world,
                portal,
                overviewMap,
                // The marker shares the main map's blink phase, so the active
                // unit can be found on the minimap and clicked to centre
                // without reaching for the keyboard.
                () =>
                  activeUnit && activeUnitsMap.isVisible()
                    ? activeUnit.tile
                    : null
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

            gameMenuItem.build();

            yieldsMap.setVisible(false);

            portal.on('focus-changed', () => minimap.update());
            portal.on('activate-unit', (unit) => {
              if (waitingForTurn) {
                return;
              }

              setActiveUnit(unit, portal, unitsMap, activeUnitsMap);
            });

            intervalHandler.on(() => {
              // With no active unit the layer draws nothing, so toggling it is
              // invisible and there is no reason to composite every layer for
              // it. `renderActiveUnit` sets the layer visible again whenever a
              // unit becomes active, so leaving the flag alone here is safe.
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
              setActiveUnit: (unit) =>
                setActiveUnit(unit, portal, unitsMap, activeUnitsMap),
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
            // `dataupdated` window rebuilds, and the full `portal` composite —
            // reads only the latest `data`/`activeUnit`, so it is safe to run at
            // most once per animation frame however many patch flushes arrive.
            let firstRender = true;

            const render = (): void => {
              if (firstRender) {
                firstRender = false;

                performance.mark('civ:first-render');
              }

              document.dispatchEvent(
                new CustomEvent('dataupdated', {
                  detail: {
                    data,
                  },
                })
              );

              dataChanges.notify(data);

              const { primary, secondary } = partitionActions(
                data.player.actions,
                notices.actions(data),
                waitingForTurn
              );

              primaryActions.build(primary, data.player);

              secondaryActions.build(secondary);

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

              renderActiveUnit(activeUnit, portal, unitsMap, activeUnitsMap);

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

            // What a unit key does to the active unit, typed now or kept while
            // a move was answered (#326): 'sent' when it sent an action,
            // 'prompted' when it opened a window to choose or confirm first,
            // and `null` when it does nothing.
            const playUnitKey = (key: string): 'sent' | 'prompted' | null => {
                const unit = activeUnit;

                if (unit === null) {
                  return null;
                }

                if (key in keyToActionsMap) {
                  const actions = [...keyToActionsMap[key]];

                  while (actions.length) {
                    const actionName = actions.shift(),
                      [unitAction] = unitActions(unit).filter(
                        (action): boolean => action._ === actionName
                      );

                    if (unitAction) {
                      transport.send('action', {
                        name: 'ActiveUnit',
                        id: unit.id,
                        unitAction: unitAction._,
                        target: unitAction.to.id,
                      });

                      return 'sent';
                    }
                  }
                }

                // Where the engine refuses a join, it says why, so the key
                // doesn't do nothing and say nothing.
                if (key === 'b' && unit.joinCityRefusal) {
                  const { reason, ...details } = unit.joinCityRefusal,
                    city = world.get(unit.tile.x, unit.tile.y).city;

                  new NotificationWindow(
                    t(`JoinCity.${reason}.title`),
                    document.createTextNode(
                      t(`JoinCity.${reason}.body`, {
                        ...details,
                        city: city?.name,
                      })
                    )
                  );

                  return 'prompted';
                }

                if (!(key in directionKeyMap)) {
                  return null;
                }

                const directionActions = neighbourActions(
                    unit,
                    directionKeyMap[key]
                  ),
                  // Taken now: a window below isn't modal, and another unit can be active by the time it's answered
                  //  (#57).
                  unitId = unit.id,
                  move = plainMove(directionActions),
                  send = (chosen: UnitAction): void =>
                    transport.send('action', {
                      name: 'ActiveUnit',
                      id: unitId,
                      unitAction: chosen._,
                      target: chosen.to.id,
                    });

                // Drawn on the tile it is moving to now, rather than once the
                // engine has answered and the frame after that has drawn it.
                if (move !== null) {
                  send(move);

                  pendingMove.start(unitId, move.to);

                  applyActiveUnit(unit, portal, unitsMap, activeUnitsMap);

                  scheduleRender();

                  return 'sent';
                }

                if (directionActions.length === 0) {
                  return null;
                }

                let sent = false;

                chooseUnitAction(unit, directionActions, (chosen) => {
                  sent = true;

                  send(chosen);
                });

                return sent ? 'sent' : 'prompted';
              },
              // Plays the keys kept while the last move was answered, each
              // read against the unit as the answer left it, as if typed now.
              drainKeys = (): void => {
                if (
                  activeUnit === null ||
                  !hasUnitActions(activeUnit) ||
                  !pendingMove.queued()
                ) {
                  return;
                }

                // A window the answer opened (a hut's news, talks) has the
                // keys now, as it would a key typed now: the rest were typed
                // without knowing it would be there.
                if (
                  document.querySelector('dialog.window.modal') !== null ||
                  document.activeElement?.closest('dialog.window')
                ) {
                  pendingMove.clear();

                  return;
                }

                pendingMove.drain((key) => {
                  const played = playUnitKey(key);

                  // So does one a key opened, to confirm an attack, say.
                  if (played === 'prompted') {
                    pendingMove.clear();
                  }

                  return played !== null;
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
            // `activeUnit`/`activeUnits`/`lastUnit`, the map layers' active-unit
            // pointers) must stay here — deferring any of it (tried 2026-07-02)
            // left `activeUnit` stale for ~1 frame and broke consecutive moves
            // of multi-move units. Only `render()` is coalesced to one run per
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

              const playerActions = data.player.actions.filter(
                (action): action is PlayerAction => !!action
              );

              // No unit to blink as if it could move, and none for the keys to move.
              activeUnits = waitingForTurn
                ? []
                : playerActions.filter(
                    (action: PlayerAction): boolean => action._ === 'ActiveUnit'
                  );

              waitedUnits.forEach((id) => {
                if (
                  !activeUnits.some(
                    (action) => (action.value as Unit).id === id
                  )
                ) {
                  waitedUnits.delete(id);
                }
              });

              // Only waited units left: the longest-waiting one is up next.
              if (
                activeUnits.length > 0 &&
                activeUnits.every((action) =>
                  waitedUnits.has((action.value as Unit).id)
                )
              ) {
                const [oldestId] = waitedUnits;

                waitedUnits.delete(oldestId);
              }

              const selectableActiveUnits = activeUnits.filter(
                (action) => !waitedUnits.has((action.value as Unit).id)
              );

              // A unit whose GoTo stopped next to a choice goes first, and is offered it once its actions are in.
              const halted = haltedUnits.next(
                  activeUnits.map((action) => action.value as Unit)
                ),
                nextUnit =
                  halted?.unit ??
                  chooseActiveUnit(
                    selectableActiveUnits.map((action) => action.value as Unit),
                    lastUnit?.id ?? null,
                    (x, y) => portal.isVisible(x, y)
                  );

              if (halted?.actions?.length) {
                const unitId = halted.unit.id,
                  arrival = openArrivalWindow(
                    halted.unit,
                    halted.actions,
                    (chosen: UnitAction) =>
                      transport.send('action', {
                        name: 'ActiveUnit',
                        id: unitId,
                        unitAction: chosen._,
                        target: chosen.to.id,
                      })
                  );

                // Chosen or dismissed, the next halted unit is up once it closes.
                if (arrival !== null) {
                  haltedUnits.opened();

                  arrival.on('close', () => {
                    haltedUnits.closed();

                    if (!waitingForTurn) {
                      updateState(objectMap);
                    }
                  });
                }
              }

              if (nextUnit === null) {
                lastUnit = null;
              }

              applyActiveUnit(nextUnit, portal, unitsMap, activeUnitsMap);

              scheduleRender();

              // Keys kept while the unit's orders were on their way. Those kept
              // behind a move wait for its `actionHandled` (#326).
              drainKeys();

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
                unitActionsRequest.dataReceived();

                updateState(rawData, true);
              })
            );

            // The move drawn before its answer (#326), settled by its own
            // acknowledgement, which follows the patch with its result: any
            // other patch, the answer to a `unitActions` request say, can come
            // first with the unit still on the tile it left. Arrived, it is
            // where it was drawn. Refused (a zone of control, no moves left),
            // it goes back to the tile it left, and the keys typed after it go
            // too: they were typed for a unit that didn't move.
            transportDisposers.push(
              transport.receive('actionHandled', (action): void => {
                if (!pendingMove.answeredBy(action)) {
                  return;
                }

                const arrived = pendingMove.settle(
                  data.player.units.find((unit) => unit.id === action.id) ??
                    null
                );

                if (!arrived) {
                  pendingMove.clear();
                }

                applyActiveUnit(activeUnit, portal, unitsMap, activeUnitsMap);

                scheduleRender();

                drainKeys();
              })
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
                unitActionsRequest.dataReceived();

                applyDataPatches(objectMap, data, {
                  changed: (id) => changedIds.add(id),
                  received: (key, value) =>
                    document.dispatchEvent(
                      new CustomEvent('patchdatareceived', {
                        detail: {
                          key,
                          value,
                        },
                      })
                    ),
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
              if (
                activeUnit &&
                (key in keyToActionsMap || key in directionKeyMap) &&
                pendingMove.press(
                  key,
                  hasUnitActions(activeUnit),
                  (key) => playUnitKey(key) !== null
                )
              ) {
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

              if (key === 'c' && activeUnit) {
                portal.setCenter(activeUnit.tile.x, activeUnit.tile.y);

                portal.render();
                minimap.update();

                return;
              }

              if (key === 'w' && activeUnit) {
                const current = activeUnit,
                  others = activeUnits
                    .map((unitAction) => unitAction.value as Unit)
                    .filter((unit) => unit.id !== current.id);

                if (others.length > 0) {
                  waitedUnits.add(current.id);

                  // When everything else is waiting too, the queue wraps round
                  // to whichever unit has waited longest.
                  const [oldestId] = waitedUnits,
                    next =
                      others.find((unit) => !waitedUnits.has(unit.id)) ??
                      others.find((unit) => unit.id === oldestId) ??
                      others[0];

                  setActiveUnit(next, portal, unitsMap, activeUnitsMap);
                }

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

                showNotification(t('GameMenu.cheat.enabled'));

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
