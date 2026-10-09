import {
  City as CityData,
  DataPatch,
  DataPatchContents,
  Dialogue,
  GameData,
  Interactions,
  Negotiation,
  NeighbourDirection,
  PlainObject,
  PlayerAction,
  Resolution,
  Tile,
  Unit,
  UnitAction,
} from './types';
import { emit, off, on, s } from '@dom111/element';
import i18next, { t } from 'i18next';
import { ObjectMap } from './lib/reconstituteData';
import Actions from './components/Actions';
import UnitActions from './components/UnitActions';
import { keyToActionsMap } from './lib/unitActionKeys';
import ActiveUnit from './components/Map/ActiveUnit';
import City from './components/City';
import Cities from './components/Map/Cities';
import CityNames from './components/Map/CityNames';
import CityStatus from './components/CityStatus';
import ConfirmationWindow from './components/ConfirmationWindow';
import Fog from './components/Map/Fog';
import GameDetails from './components/GameDetails';
import GameMenu from './components/GameMenu';
import GamePortal from './components/GamePortal';
import HappinessReport from './components/HappinessReport';
import IntervalHandler from './lib/IntervalHandler';
import Landscape from './components/Map/Landscape';
import LanguageDetector from 'i18next-browser-languagedetector';
import MainMenu from './components/MainMenu';
import { downloadSave, takePendingSave } from './lib/savedGame';
import { allowLeaving, guardLeaving } from './lib/leaveGuard';
import endTurn from './lib/endTurn';
import chooseActiveUnit from './lib/chooseActiveUnit';
import {
  chooseFromListBody,
  chooseFromListChoice,
  chooseFromListTitle,
} from './lib/chooseFromList';
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
import { chooseUnitAction } from './lib/unitActionPrompts';
import {
  UnitActionsRequest,
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
import { assetStore } from './AssetStore';
import { h } from './lib/html';
import { instance as options } from './GameOptionsRegistry';
import { mappedKeyFromEvent } from './lib/mappedKey';
import instanceOf from './lib/instanceOf';
import pruneObjectMap from './lib/pruneObjectMap';
import IncrementalReconstituter from './lib/IncrementalReconstituter';
import ActiveUnitTiles from './lib/ActiveUnitTiles';
import createMemoryTestbed from './lib/memoryTestbed';
import UIStressRunner from './lib/UIStressRunner';
import ActionWindow from './components/ActionWindow';

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

    const parseBooleanParam = (
      value: string | null,
      defaultValue: boolean
    ): boolean => {
      if (value === null) {
        return defaultValue;
      }

      const normalised = value.trim().toLowerCase();

      if (['1', 'true', 'yes', 'on'].includes(normalised)) {
        return true;
      }

      if (['0', 'false', 'no', 'off'].includes(normalised)) {
        return false;
      }

      return defaultValue;
    };

    const debugMode = parseBooleanParam(queryParams.get('debug'), false);

    let automatePlayerEnabled = debugMode,
      stressUiEnabled = debugMode,
      stressUiWindowsEnabled = !debugMode,
      // Once a game is running, F5 is a leader-screen shortcut (TradeReport),
      // not a reload; only Ctrl/Cmd+R stays a reload from that point on.
      gameStarted = false;

    const hasAllAssets = await assetStore.hasAllAssets();

    if (hasAllAssets) {
      const scaledCursor = await assetStore.getScaled(
        './assets/cursor/torch.png',
        2
      );

      document.body.style.cursor = `url('${scaledCursor.toDataURL(
        'image/png'
      )}'), default`;
    }
    // Load translations
    i18next.use(LanguageDetector);

    await i18next.init({
      defaultNS: 'default',
      ns: ['default'],
    });
    await import('../translations');

    on(document, 'keydown', (event) => {
      if (
        (event.key === 'F5' && !gameStarted) ||
        (['R', 'r'].includes(event.key) &&
          (/Mac OS X/.test(navigator.userAgent)
            ? event.metaKey
            : event.ctrlKey))
      ) {
        event.preventDefault();

        new ConfirmationWindow(
          'Quit',
          'Are you sure you want to reload?',
          () => {
            allowLeaving();

            window.location.reload();
          }
        );

        return;
      }
    });

    // These should be stored in localStorage or something...
    options.set('autoEndOfTurn', true);
    options.set('autoEndOfTurnExceptions', ['CivilDisorder']);
    options.set('unitEdgeMargin', 2);
    options.set('mapScale', 2);
    options.set('lockVerticalEdges', false);

    if (debugMode) {
      transport.send('setOption', {
        name: 'automateLocalPlayer',
        value: automatePlayerEnabled,
      });
    }

    try {
      const notificationArea = document.getElementById(
          'notification'
        ) as HTMLElement,
        mainMenuElement = document.querySelector('#mainmenu') as HTMLElement,
        actionArea = document.getElementById('actions') as HTMLElement,
        secondaryActionArea = document.getElementById(
          'other-actions'
        ) as HTMLElement,
        unitActionArea = document.getElementById('unit-actions') as HTMLElement,
        gameMenu = document.getElementById('game-menu') as HTMLElement,
        gameArea = document.getElementById('game') as HTMLElement,
        mapWrapper = document.getElementById('map') as HTMLElement,
        mapPortal = mapWrapper.querySelector('canvas') as HTMLCanvasElement,
        gameInfo = document.getElementById('gameDetails') as HTMLElement,
        playerInfo = document.getElementById('playerDetails') as HTMLElement,
        minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement,
        unitInfo = document.getElementById('unitInfo') as HTMLCanvasElement,
        preloadContainer = document.getElementById('preload') as HTMLDivElement,
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
        // Input-critical state only: keeps `activeUnit`/`lastUnit` and the map
        // layers' active-unit pointers current synchronously, so consecutive
        // moves of a multi-move unit always read the post-move tile. No render.
        applyActiveUnit = (
          unit: Unit | null,
          portal: GamePortal,
          unitsMap: Units,
          activeUnitsMap: ActiveUnit
        ) => {
          activeUnitTiles.change(unit);

          activeUnit = unit;

          portal.setActiveUnit(unit);
          unitsMap.setActiveUnit(unit);
          activeUnitsMap.setActiveUnit(unit);

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

          // A unit on the very edge of the map is visible but easily missed,
          // so it is brought back to the middle before it gets that far.
          if (
            !portal.isVisible(
              unit.tile.x,
              unit.tile.y,
              options.get('unitEdgeMargin', 0)
            )
          ) {
            portal.setCenter(unit.tile.x, unit.tile.y);
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

      // preloaded the images as they could be remote
      assetStore.getAll().then((records) =>
        records.forEach((record) =>
          preloadContainer.append(
            h(
              s<HTMLImageElement>(
                `<img src="${record.uri}" data-path="${record.name}">`
              ),
              {
                error: () =>
                  console.error(
                    `There was a problem preloading '${record.name}', you may have some missing details.`
                  ),
              }
            )
          )
        )
      );

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
        activeUnitTiles = new ActiveUnitTiles();

      let globalNotificationTimer: number | undefined,
        lastUnit: Unit | null = null,
        activeUnit: Unit | null = null,
        uiStressRunner: UIStressRunner | null = null;

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

      const interactionLabel = (interaction: Interactions) => {
          if (instanceOf(interaction, 'Dialogue')) {
            return t(`${interaction._}.${(interaction as Dialogue).key}`, {
              interaction,
              defaultValue: interaction._,
              ns: 'diplomacy',
            });
          }

          if (instanceOf(interaction, 'Proposal')) {
            return t(interaction._, {
              interaction,
              defaultValue: interaction._,
              ns: 'diplomacy',
            });
          }

          if (instanceOf(interaction, 'Resolution')) {
            const { proposal } = interaction as Resolution;

            return t(`Resolution.${proposal._}.${interaction._}`, {
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
          if (
            uiStressRunner &&
            !stressUiWindowsEnabled &&
            choices.length > 0 &&
            uiStressRunner.isAutomatingChoice(choices[0].id)
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
                    label: interactionLabel(choices[0].value as Interactions),
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

            if (uiStressRunner) {
              uiStressRunner.automateChoice(window, choices[0].id, (choiceId) =>
                transport.send('chooseFromList', choiceId)
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
            offerRandom = key === 'choose-civilization' && choices.length > 1;

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
              ...choices.map(({ id, value }) => {
                const label =
                  key === 'negotiation.next-step'
                    ? interactionLabel(value as Interactions)
                    : chooseFromListChoice(key, value);

                return {
                  label,
                  value: id,
                };
              }),
            ],
            (choice) =>
              transport.send(
                'chooseFromList',
                offerRandom && choice === randomChoice
                  ? choices[Math.floor(Math.random() * choices.length)].id
                  : choice
              ),
            body,
            {
              canClose: false,
              displayAll: true,
            }
          );

          if (uiStressRunner && !selectionWindow.autoChosen()) {
            selectionWindow.selectionList().value = choices[0].id;
            uiStressRunner.automateChoice(
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
          data: GameData,
          objectMap: ObjectMap = { objects: {}, hierarchy: {} }
        ) => {
          performance.mark('civ:game-data-received');

          try {
            gameStarted = true;

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

            let lastPrunedTurn = -1,
              lastPrunedObjectCount = Object.keys(objectMap.objects).length,
              currentTurn = Number(data?.turn?.value ?? 0),
              currentObjectCount = Object.keys(objectMap.objects).length;

            const profileMemory = debugMode,
              memoryMaxSamples = debugMode ? 5000 : null,
              memoryTestbed = profileMemory
                ? createMemoryTestbed(
                    () => ({
                      turn: currentTurn,
                      objectCount: currentObjectCount,
                    }),
                    {
                      maxSamples: memoryMaxSamples,
                    }
                  )
                : null;

            if (memoryTestbed) {
              window.__civMemoryTestbed = memoryTestbed;
            }

            let debugControls: HTMLDivElement | null = null,
              debugKeyListener: ((event: KeyboardEvent) => void) | null = null;

            const closeOpenDialogs = (): void => {
                document
                  .querySelectorAll('dialog.window, dialog.window.modal')
                  .forEach((dialogElement) => {
                    const dialog = dialogElement as HTMLDialogElement;

                    if (!dialog.open || typeof dialog.close !== 'function') {
                      return;
                    }

                    try {
                      dialog.close();
                    } catch (error) {
                      console.warn('Failed to close dialog', error);
                    }
                  });
              },
              downloadDebugFile = (
                fileName: string,
                content: string,
                mimeType: string
              ): void => {
                // Direct creation rather than `s`: the `href` is an object
                // URL that has to be assigned as a property, and putting one
                // through `s` would mean interpolating it into markup for no
                // gain. The anchor never enters the tree for longer than the
                // click.
                const blob = new Blob([content], { type: mimeType }),
                  url = URL.createObjectURL(blob),
                  anchor = document.createElement('a');

                anchor.href = url;
                anchor.download = fileName;
                document.body.append(anchor);
                anchor.click();
                anchor.remove();
                URL.revokeObjectURL(url);
              },
              exportDebugJson = (): void => {
                const dialogs = Array.from(
                    document.querySelectorAll(
                      'dialog.window, dialog.window.modal'
                    )
                  ).map((dialogElement) => {
                    const dialog = dialogElement as HTMLDialogElement,
                      titleElement = dialog.querySelector(
                        '.title, h1, h2, h3, legend'
                      ) as HTMLElement | null;

                    return {
                      className: dialog.className,
                      id: dialog.id || null,
                      open: !!dialog.open,
                      title: titleElement?.innerText?.trim() || null,
                    };
                  }),
                  memory = (performance as any).memory,
                  samples = memoryTestbed?.samples ?? [],
                  sampleCount = samples.length,
                  heapValues = samples
                    .map((sample) => sample.usedJSHeapSize)
                    .filter(
                      (value): value is number => typeof value === 'number'
                    ),
                  firstSample = sampleCount > 0 ? samples[0] : null,
                  lastSample =
                    sampleCount > 0 ? samples[sampleCount - 1] : null;

                const payload = {
                    exportedAt: Date.now(),
                    debug: {
                      automatePlayerEnabled,
                      stressUiEnabled,
                      stressUiWindowsEnabled,
                    },
                    stressRunner: uiStressRunner?.getDebugState() ?? null,
                    runtime: {
                      canvasCount: document.querySelectorAll('canvas').length,
                      dialogCount: dialogs.length,
                      dialogs,
                      domNodeCount: document.querySelectorAll('*').length,
                      imageCount: document.querySelectorAll('img').length,
                      objectCount: currentObjectCount,
                      tilesPendingRender: tilesToRender.size,
                      turn: currentTurn,
                    },
                    heap: {
                      currentUsedJSHeapSize:
                        memory && typeof memory.usedJSHeapSize === 'number'
                          ? memory.usedJSHeapSize
                          : null,
                      jsHeapSizeLimit:
                        memory && typeof memory.jsHeapSizeLimit === 'number'
                          ? memory.jsHeapSizeLimit
                          : null,
                      totalJSHeapSize:
                        memory && typeof memory.totalJSHeapSize === 'number'
                          ? memory.totalJSHeapSize
                          : null,
                    },
                    memory: memoryTestbed
                      ? {
                          firstSample,
                          heapMax:
                            heapValues.length > 0
                              ? Math.max(...heapValues)
                              : null,
                          heapMin:
                            heapValues.length > 0
                              ? Math.min(...heapValues)
                              : null,
                          lastSample,
                          sampleCount,
                          samples,
                        }
                      : null,
                  },
                  json = JSON.stringify(payload, null, 2);

                downloadDebugFile(
                  `civ-debug-${Date.now()}.json`,
                  json,
                  'application/json'
                );
              },
              exportDebugCsv = (): void => {
                if (!memoryTestbed) {
                  transport.send(
                    'notification',
                    'No memory sampler active for CSV export.'
                  );

                  return;
                }

                downloadDebugFile(
                  `civ-memory-${Date.now()}.csv`,
                  memoryTestbed.exportCsv(),
                  'text/csv'
                );
              },
              startStressRunner = (): void => {
                if (uiStressRunner) {
                  return;
                }

                transport.send(
                  'notification',
                  `Stress harness: windows ${
                    stressUiWindowsEnabled ? 'enabled' : 'disabled'
                  }`
                );

                uiStressRunner = new UIStressRunner({
                  enableWindows: stressUiWindowsEnabled,
                  getData: () => data,
                  portal,
                  setActiveUnit: (unit) =>
                    setActiveUnit(unit, portal, unitsMap, activeUnitsMap),
                  toggleViewModes: [
                    () => {
                      yieldsMap.setVisible(!yieldsMap.isVisible());
                      portal.render();
                      minimap.update();
                    },
                    () => {
                      unitsMap.setVisible(!unitsMap.isVisible());
                      citiesMap.setVisible(!citiesMap.isVisible());
                      cityNamesMap.setVisible(!cityNamesMap.isVisible());
                      portal.render();
                      minimap.update();
                    },
                  ],
                  transport,
                });
              },
              stopStressRunner = (): void => {
                uiStressRunner?.stop();
                uiStressRunner = null;
              },
              setAutomatePlayer = (enabled: boolean): void => {
                automatePlayerEnabled = enabled;

                transport.send('setOption', {
                  name: 'automateLocalPlayer',
                  value: automatePlayerEnabled,
                });
              },
              setStressUi = (enabled: boolean): void => {
                stressUiEnabled = enabled;

                if (stressUiEnabled) {
                  startStressRunner();

                  return;
                }

                stopStressRunner();
              },
              setStressUiWindows = (enabled: boolean): void => {
                stressUiWindowsEnabled = enabled;
                uiStressRunner?.setWindowsEnabled(stressUiWindowsEnabled);
              },
              renderDebugControls = (): void => {
                if (!debugControls) {
                  return;
                }

                debugControls.innerHTML = '';

                const title = s(
                  '<div style="font-weight: bold; margin-bottom: .5rem">Debug Controls</div>'
                );

                // One button shape, five buttons. The styling was repeated
                // inline nine times per button before; the only things that
                // actually differ are the label, the background and whether
                // the last one carries a bottom margin.
                const debugButton = (
                  label: string,
                  background: string,
                  handler: () => void,
                  extraStyle: string = ''
                ): HTMLButtonElement =>
                  h(
                    s<HTMLButtonElement>(
                      `<button type="button" style="
                        display: block;
                        width: 100%;
                        margin-bottom: .375rem;
                        padding: .375rem .5rem;
                        border: 1px solid #666;
                        background: ${background};
                        color: #fff;
                        cursor: pointer;
                        ${extraStyle}
                      ">${label}</button>`
                    ),
                    { click: handler }
                  );

                const makeToggle = (
                  label: string,
                  enabled: boolean,
                  handler: () => void
                ): HTMLButtonElement =>
                  debugButton(
                    `${label}: ${enabled ? 'ON' : 'OFF'}`,
                    enabled ? '#063' : '#444',
                    handler
                  );

                debugControls.append(
                  title,
                  makeToggle('Stress', stressUiEnabled, () => {
                    setStressUi(!stressUiEnabled);
                    renderDebugControls();
                  }),
                  makeToggle('Automate Player', automatePlayerEnabled, () => {
                    setAutomatePlayer(!automatePlayerEnabled);
                    renderDebugControls();
                  }),
                  makeToggle('Stress Windows', stressUiWindowsEnabled, () => {
                    setStressUiWindows(!stressUiWindowsEnabled);
                    renderDebugControls();
                  })
                );

                const closeDialogsButton = debugButton(
                  'Close open dialogs',
                  '#333',
                  closeOpenDialogs
                );

                const exportJsonButton = debugButton(
                  'Export debug JSON',
                  '#224',
                  exportDebugJson
                );

                const exportCsvButton = debugButton(
                  'Export memory CSV',
                  '#224',
                  exportDebugCsv
                );

                // The last button in the panel, so no bottom margin.
                const stopAllButton = debugButton(
                  'Stop all automation',
                  '#700',
                  () => {
                    setStressUi(false);
                    setAutomatePlayer(false);
                    closeOpenDialogs();
                    renderDebugControls();
                  },
                  'margin-bottom: 0;'
                );

                const hint = s(
                  '<div style="margin-top: .5rem; font-size: 11px; opacity: .85">' +
                    'Hotkeys: Alt+Shift+S/A/W/C/J/X' +
                    '</div>'
                );

                debugControls.append(
                  closeDialogsButton,
                  exportJsonButton,
                  exportCsvButton,
                  stopAllButton,
                  hint
                );
              };

            if (stressUiEnabled) {
              startStressRunner();
            }

            if (debugMode) {
              debugControls = s<HTMLDivElement>(
                `<div style="
                  position: fixed;
                  top: .5rem;
                  right: .5rem;
                  z-index: 2147483647;
                  width: 220px;
                  padding: .5rem;
                  background: rgba(0, 0, 0, .85);
                  color: #fff;
                  border: 1px solid #888;
                  font-family: monospace;
                  font-size: 12px;
                "></div>`
              );

              renderDebugControls();
              document.body.append(debugControls);

              debugKeyListener = (event: KeyboardEvent) => {
                if (!(event.altKey && event.shiftKey)) {
                  return;
                }

                const key = event.key.toLowerCase();

                if (!['s', 'a', 'w', 'c', 'j', 'x'].includes(key)) {
                  return;
                }

                event.preventDefault();
                event.stopPropagation();

                if (key === 's') {
                  setStressUi(!stressUiEnabled);
                }

                if (key === 'a') {
                  setAutomatePlayer(!automatePlayerEnabled);
                }

                if (key === 'w') {
                  setStressUiWindows(!stressUiWindowsEnabled);
                }

                if (key === 'c') {
                  closeOpenDialogs();
                }

                if (key === 'j') {
                  exportDebugJson();
                }

                if (key === 'x') {
                  exportDebugCsv();
                }

                renderDebugControls();
              };

              // Not `h`: this listens on `document` rather than on an
              // element built here, and it needs the capture phase so the
              // debug hotkeys fire before a focused dialog swallows them —
              // neither of which `h(element, handlers)` expresses.
              document.addEventListener('keydown', debugKeyListener, true);
            }

            // `pagehide`, not `beforeunload`: the leave guard can still cancel an unload after `beforeunload`, and a
            //  page restored from the back/forward cache comes back as it was. Tearing down in either case left a
            //  game with nothing listening to the worker.
            on(window, 'pagehide', (event: PageTransitionEvent) => {
              if (event.persisted) {
                return;
              }

              off(window, 'resize', resizeHandler);
              intervalHandler.dispose();
              memoryTestbed?.stop();
              stopStressRunner();
              debugControls?.remove();

              if (debugKeyListener) {
                document.removeEventListener('keydown', debugKeyListener, true);
              }

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

              const primaryActionList = [
                  'ChooseGovernment',
                  'ChooseResearch',
                  'CityBuild',
                  'CivilDisorder',
                  'EndTurn',
                  'Notice',
                ],
                ignoredActionList = [
                  'ActiveUnit',
                  'ChangeProduction',
                  'ChangeSpecialist',
                  'ChangeWorkedTile',
                  'CompleteProduction',
                  'InactiveUnit',
                ],
                allExcludedActions = new Set([
                  ...primaryActionList,
                  ...ignoredActionList,
                ]),
                primaryActionPriority: {
                  [key: string]: number;
                } = {
                  EndTurn: 100,
                  ChooseGovernment: 90,
                  ChooseResearch: 80,
                  CityBuild: 60,
                  CivilDisorder: 10,
                  Notice: 5,
                },
                // Still last turn's actions while waiting, and the worker isn't
                // listening for them: End Turn would come back, clickable.
                playerActions = waitingForTurn
                  ? []
                  : data.player.actions.filter(
                      (action): action is PlayerAction => !!action
                    ),
                primaryActionCandidates = [
                  ...playerActions,
                  ...notices.actions(data),
                ]
                  .sort(
                    (a, b) =>
                      (primaryActionPriority[a._] ?? 0) -
                      (primaryActionPriority[b._] ?? 0)
                  )
                  .filter((action) => primaryActionList.includes(action._));

              primaryActions.build(primaryActionCandidates, data.player);

              secondaryActions.build(
                playerActions.filter(
                  (action) => !allExcludedActions.has(action._)
                )
              );

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
                data.year
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
            const reconstituter = new IncrementalReconstituter();

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

              const turnValue = Number(data?.turn?.value ?? 0),
                objectCount = Object.keys(objectMap.objects).length;

              currentTurn = turnValue;
              currentObjectCount = objectCount;

              const scheduledPrune =
                  Number.isFinite(turnValue) &&
                  turnValue > 0 &&
                  turnValue % 5 === 0 &&
                  turnValue !== lastPrunedTurn,
                // Also prune on unexpected growth so the map can't balloon
                // within the 5-turn window between scheduled prunes.
                growthPrune = objectCount > lastPrunedObjectCount * 1.5;

              if (objectCount > 5000 && (scheduledPrune || growthPrune)) {
                lastPrunedTurn = turnValue;
                reconstituter.forget(pruneObjectMap(objectMap));
                lastPrunedObjectCount = Object.keys(objectMap.objects).length;
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

              const nextUnit = chooseActiveUnit(
                selectableActiveUnits.map((action) => action.value as Unit),
                lastUnit?.id ?? null,
                (x, y) => portal.isVisible(x, y)
              );

              if (nextUnit === null) {
                lastUnit = null;
              }

              applyActiveUnit(nextUnit, portal, unitsMap, activeUnitsMap);

              scheduleRender();

              const autoEndOfTurnExceptions = options.get(
                'autoEndOfTurnExceptions',
                []
              );

              if (
                !waitingForTurn &&
                options.get('autoEndOfTurn') &&
                data.player.mandatoryActions.length === 1 &&
                data.player.mandatoryActions.every(
                  (action) => action._ === 'EndTurn'
                ) &&
                !data.player.actions.some((action) =>
                  autoEndOfTurnExceptions.includes(action._)
                )
              ) {
                // Not `endTurn()`: a turn nobody played should not clear the notices waiting to be read.
                transport.send('action', {
                  name: 'EndTurn',
                });
              }
            };

            updateState(objectMap, true);

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
              transport.receive('gameData', (data, rawData) => {
                unitActionsRequest.dataReceived();

                updateState(rawData as ObjectMap, true);
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

            const pathToParts = (path: string) =>
                path.replace(/]/g, '').split(/[.[]/),
              getPenultimateObject = (
                object: PlainObject,
                path: string
              ): [PlainObject, string | undefined] => {
                const parts = pathToParts(path),
                  lastPart = parts.pop();

                const tmpObj = parts.reduce((tmpObj, part) => {
                  if (!tmpObj || !(part in tmpObj)) {
                    return null;
                  }

                  return tmpObj[part];
                }, object);

                return [tmpObj, lastPart];
              },
              setObjectPath = (
                object: PlainObject,
                path: string,
                value: any
              ): void => {
                const [tmpObj, lastPart] = getPenultimateObject(object, path);

                if (!tmpObj || !lastPart) {
                  console.warn(
                    `unable to set ${path} of ${object} (${lastPart})`
                  );
                  return;
                }

                tmpObj[lastPart] = value;
              },
              removeObjectPath = (object: PlainObject, path: string): void => {
                const [tmpObj, lastPart] = getPenultimateObject(object, path);

                if (!tmpObj || !lastPart) {
                  console.warn(
                    `unable to set ${path} of ${object} (${lastPart})`
                  );
                  return;
                }

                if (Array.isArray(tmpObj) && /^\d+$/.test(lastPart)) {
                  tmpObj.splice(parseInt(lastPart, 10), 1);

                  return;
                }

                delete tmpObj[lastPart];
              };

            transportDisposers.push(
              transport.receive('gameDataPatch', (data: DataPatch[]) => {
                unitActionsRequest.dataReceived();

                data.forEach((patch) =>
                  Object.entries(patch).forEach(
                    ([key, { type, index, value }]: [
                      string,
                      DataPatchContents
                    ]) => {
                      if (type === 'add' || type === 'update') {
                        if (!value!.hierarchy) {
                          console.error('No hierarchy');
                          console.error(value);

                          return;
                        }

                        if (index) {
                          setObjectPath(
                            objectMap.objects[key],
                            index,
                            value!.hierarchy
                          );
                        } else {
                          objectMap.objects[key] = value!.hierarchy;
                        }

                        changedIds.add(key);

                        document.dispatchEvent(
                          new CustomEvent('patchdatareceived', {
                            detail: {
                              value,
                            },
                          })
                        );

                        Object.entries(value!.objects as PlainObject).forEach(
                          ([key, value]) => {
                            objectMap.objects[key] = value;
                            changedIds.add(key);

                            if (value._ === 'PlayerTile') {
                              // Since we only use tilesToRender for x and y this should be fine...
                              queueTileToRender(value);
                            }
                          }
                        );
                      }

                      if (type === 'remove') {
                        changedIds.add(key);

                        if (index) {
                          removeObjectPath(objectMap.objects[key], index);

                          return;
                        }

                        delete objectMap.objects[key];
                      }
                    }
                  )
                );

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

            const directionKeyMap: { [key: string]: NeighbourDirection } = {
                ArrowUp: 'n',
                PageUp: 'ne',
                ArrowRight: 'e',
                PageDown: 'se',
                ArrowDown: 's',
                End: 'sw',
                ArrowLeft: 'w',
                Home: 'nw',
              },
              leaderScreensMap: { [key: string]: () => any } = {
                F1: () => new CityStatus(data.player, portal, transport),
                F3: () => new IntelligenceReport(transport),
                F4: () => new HappinessReport(data.player, portal, transport),
                F5: () => new TradeReport(data.player, portal, transport),
                F6: () => new ScienceReport(data.player),
                F8: () => new TopCitiesReport(transport),
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

              if (activeUnit) {
                if (key in keyToActionsMap) {
                  const actions = [...keyToActionsMap[key]];

                  while (actions.length) {
                    const actionName = actions.shift(),
                      [unitAction] = unitActions(activeUnit).filter(
                        (action): boolean => action._ === actionName
                      );

                    if (unitAction) {
                      transport.send('action', {
                        name: 'ActiveUnit',
                        id: activeUnit.id,
                        unitAction: unitAction._,
                        target: unitAction.to.id,
                      });

                      event.stopPropagation();
                      event.preventDefault();

                      return;
                    }
                  }
                }

                // Where the engine refuses a join, it says why, so the key
                // doesn't do nothing and say nothing.
                if (key === 'b' && activeUnit.joinCityRefusal) {
                  const { reason, ...details } = activeUnit.joinCityRefusal,
                    city = world.get(activeUnit.tile.x, activeUnit.tile.y).city;

                  new NotificationWindow(
                    t(`JoinCity.${reason}.title`),
                    document.createTextNode(
                      t(`JoinCity.${reason}.body`, {
                        ...details,
                        city: city?.name,
                      })
                    )
                  );

                  event.stopPropagation();
                  event.preventDefault();

                  return;
                }

                if (key in directionKeyMap) {
                  const directionActions = neighbourActions(
                      activeUnit,
                      directionKeyMap[key]
                    ),
                    // Taken now: a window below isn't modal, and another unit can be active by the time it's
                    //  answered (#57).
                    unitId = activeUnit.id;

                  if (directionActions.length > 0) {
                    chooseUnitAction(
                      activeUnit,
                      directionActions,
                      (chosen: UnitAction) =>
                        transport.send('action', {
                          name: 'ActiveUnit',
                          id: unitId,
                          unitAction: chosen._,
                          target: chosen.to.id,
                        })
                    );

                    event.stopPropagation();
                    event.preventDefault();

                    return;
                  }
                }
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
