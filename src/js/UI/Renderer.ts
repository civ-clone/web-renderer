import {
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
  SneakAttack,
  Tile,
  Unit,
} from './types';
import { emit, off, on, s } from '@dom111/element';
import i18next, { t } from 'i18next';
import { reconstituteData, ObjectMap } from './lib/reconstituteData';
import Actions from './components/Actions';
import ActiveUnit from './components/Map/ActiveUnit';
import Cities from './components/Map/Cities';
import CityNames from './components/Map/CityNames';
import CityStatus from './components/CityStatus';
import ConfirmationWindow from './components/ConfirmationWindow';
import Feature from './components/Map/Feature';
import Fog from './components/Map/Fog';
import GameDetails from './components/GameDetails';
import GameMenu from './components/GameMenu';
import GamePortal from './components/GamePortal';
import GoodyHuts from './components/Map/GoodyHuts';
import HappinessReport from './components/HappinessReport';
import Improvements from './components/Map/Improvements';
import IntervalHandler from './lib/IntervalHandler';
import Irrigation from './components/Map/Irrigation';
import Land from './components/Map/Land';
import LanguageDetector from 'i18next-browser-languagedetector';
import MainMenu from './components/MainMenu';
import Minimap from './components/Minimap';
import NotificationWindow from './components/NotificationWindow';
import Notifications from './components/Notifications';
import PlayerDetails from './components/PlayerDetails';
import ScienceReport from './components/ScienceReport';
import SelectionWindow from './components/SelectionWindow';
import Terrain from './components/Map/Terrain';
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
      stressUiWindowsEnabled = !debugMode;

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
        event.key === 'F5' ||
        (['R', 'r'].includes(event.key) &&
          (/Mac OS X/.test(navigator.userAgent)
            ? event.metaKey
            : event.ctrlKey))
      ) {
        event.preventDefault();

        new ConfirmationWindow('Quit', 'Are you sure you want to reload?', () =>
          window.location.reload()
        );

        return;
      }
    });

    // These should be stored in localStorage or something...
    options.set('autoEndOfTurn', true);
    options.set('autoEndOfTurnExceptions', ['CivilDisorder']);

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
        mainMenu = new MainMenu(mainMenuElement, this.#transport),
        setActiveUnit = (
          unit: Unit | null,
          portal: GamePortal,
          unitsMap: Units,
          activeUnitsMap: ActiveUnit
        ) => {
          const unitDetails = new UnitDetails(unitInfo, unit);

          activeUnit = unit;

          unitDetails.build();

          portal.setActiveUnit(unit);
          unitsMap.setActiveUnit(unit);
          unitsMap.render();
          unitsMap.setVisible(true);
          activeUnitsMap.setActiveUnit(unit);
          activeUnitsMap.render();
          activeUnitsMap.setVisible(true);

          if (unit === null) {
            portal.render();

            return;
          }

          lastUnit = unit;

          unitsMap.update([
            ...(lastUnit?.tile ? [lastUnit.tile] : []),
            unit.tile,
          ]);

          if (!portal.isVisible(unit.tile.x, unit.tile.y)) {
            portal.setCenter(unit.tile.x, unit.tile.y);
          }

          portal.render();
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

      const tilesToRender: Tile[] = [];

      let globalNotificationTimer: number | undefined,
        lastUnit: Unit | null = null,
        activeUnit: Unit | null = null,
        uiStressRunner: UIStressRunner | null = null;

      const transportDisposers: Array<() => void> = [];

      transportDisposers.push(
        transport.receive('notification', (data: string): void => {
          notificationArea.innerHTML = data;

          if (globalNotificationTimer) {
            window.clearTimeout(globalNotificationTimer);
          }

          globalNotificationTimer = window.setTimeout((): void => {
            globalNotificationTimer = undefined;

            notificationArea.innerText = '';
          }, 4000);
        })
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

          const title = t(`ChooseFromList.${key}.title`, {
            data,
            defaultValue: t('ChooseFromList.default.body'),
          });

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
              : t(`ChooseFromList.${key}.body`, {
                  data,
                  defaultValue: t('ChooseFromList.default.body'),
                });

          const selectionWindow = new SelectionWindow(
            title,
            choices.map(({ id, value }) => {
              const label =
                key === 'negotiation.next-step'
                  ? interactionLabel(value as Interactions)
                  : t(`ChooseFromList.${key}.choice`, {
                      value,
                      defaultValue: value?._,
                    });

              return {
                label,
                value: id,
              };
            }),
            (choice) => transport.send('chooseFromList', choice),
            body,
            {
              canClose: false,
              displayAll: true,
            }
          );

          if (uiStressRunner) {
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
          try {
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

            gameArea.classList.add('active');

            mapPortal.width = (
              mapPortal.parentElement as HTMLElement
            ).offsetWidth;
            mapPortal.height = (
              mapPortal.parentElement as HTMLElement
            ).offsetHeight;

            let activeUnits: PlayerAction[] = [];

            const scale = 2,
              world = new World(data.player.world),
              intervalHandler = new IntervalHandler(),
              portal = new GamePortal(
                world,
                transport,
                mapPortal,
                {
                  playerId: data.player.id,
                  // TODO: this needs to be a user-controllable item
                  scale,
                  // TODO: this needs to come from the theme
                  tileSize: 16,
                },
                Land,
                Irrigation,
                Terrain,
                Improvements,
                Feature,
                GoodyHuts,
                Fog,
                Yields,
                Units,
                Cities,
                CityNames,
                ActiveUnit
              ),
              landMap = portal.getLayer(Land) as Land,
              yieldsMap = portal.getLayer(Yields) as Yields,
              unitsMap = portal.getLayer(Units) as Units,
              citiesMap = portal.getLayer(Cities) as Cities,
              cityNamesMap = portal.getLayer(CityNames) as CityNames,
              activeUnitsMap = portal.getLayer(ActiveUnit) as ActiveUnit,
              minimap = new Minimap(
                minimapCanvas,
                world,
                portal,
                landMap,
                citiesMap,
                activeUnitsMap
              ),
              primaryActions = new Actions(actionArea, portal, this.#transport),
              secondaryActions = new Actions(
                secondaryActionArea,
                portal,
                this.#transport
              ),
              gameMenuItem = new GameMenu(
                gameMenu,
                // `data` is reassigned on every patch, so this always resolves
                // to the current player rather than the turn-0 snapshot.
                () => data.player,
                portal,
                transport
              ),
              resizeHandler = () => {
                mapPortal.width = (
                  mapPortal.parentElement as HTMLElement
                ).offsetWidth;
                mapPortal.height = (
                  mapPortal.parentElement as HTMLElement
                ).offsetHeight;
              };

            gameMenuItem.build();

            yieldsMap.setVisible(false);

            portal.on('focus-changed', () => minimap.update());
            portal.on('activate-unit', (unit) =>
              setActiveUnit(unit, portal, unitsMap, activeUnitsMap)
            );

            intervalHandler.on(() => {
              activeUnitsMap.setVisible(!activeUnitsMap.isVisible());

              if (tilesToRender.length > 0) {
                portal.build(tilesToRender.splice(0));
              }

              portal.render();
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
                      tilesPendingRender: tilesToRender.length,
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

                const title = document.createElement('div');
                title.innerText = 'Debug Controls';
                title.style.fontWeight = 'bold';
                title.style.marginBottom = '0.5rem';

                const makeToggle = (
                  label: string,
                  enabled: boolean,
                  handler: () => void
                ): HTMLButtonElement => {
                  const button = document.createElement('button');

                  button.type = 'button';
                  button.innerText = `${label}: ${enabled ? 'ON' : 'OFF'}`;
                  button.style.display = 'block';
                  button.style.width = '100%';
                  button.style.marginBottom = '0.375rem';
                  button.style.padding = '0.375rem 0.5rem';
                  button.style.border = '1px solid #666';
                  button.style.background = enabled ? '#063' : '#444';
                  button.style.color = '#fff';
                  button.style.cursor = 'pointer';
                  button.addEventListener('click', handler);

                  return button;
                };

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

                const closeDialogsButton = document.createElement('button');
                closeDialogsButton.type = 'button';
                closeDialogsButton.innerText = 'Close open dialogs';
                closeDialogsButton.style.display = 'block';
                closeDialogsButton.style.width = '100%';
                closeDialogsButton.style.marginBottom = '0.375rem';
                closeDialogsButton.style.padding = '0.375rem 0.5rem';
                closeDialogsButton.style.border = '1px solid #666';
                closeDialogsButton.style.background = '#333';
                closeDialogsButton.style.color = '#fff';
                closeDialogsButton.style.cursor = 'pointer';
                closeDialogsButton.addEventListener('click', closeOpenDialogs);

                const exportJsonButton = document.createElement('button');
                exportJsonButton.type = 'button';
                exportJsonButton.innerText = 'Export debug JSON';
                exportJsonButton.style.display = 'block';
                exportJsonButton.style.width = '100%';
                exportJsonButton.style.marginBottom = '0.375rem';
                exportJsonButton.style.padding = '0.375rem 0.5rem';
                exportJsonButton.style.border = '1px solid #666';
                exportJsonButton.style.background = '#224';
                exportJsonButton.style.color = '#fff';
                exportJsonButton.style.cursor = 'pointer';
                exportJsonButton.addEventListener('click', exportDebugJson);

                const exportCsvButton = document.createElement('button');
                exportCsvButton.type = 'button';
                exportCsvButton.innerText = 'Export memory CSV';
                exportCsvButton.style.display = 'block';
                exportCsvButton.style.width = '100%';
                exportCsvButton.style.marginBottom = '0.375rem';
                exportCsvButton.style.padding = '0.375rem 0.5rem';
                exportCsvButton.style.border = '1px solid #666';
                exportCsvButton.style.background = '#224';
                exportCsvButton.style.color = '#fff';
                exportCsvButton.style.cursor = 'pointer';
                exportCsvButton.addEventListener('click', exportDebugCsv);

                const stopAllButton = document.createElement('button');
                stopAllButton.type = 'button';
                stopAllButton.innerText = 'Stop all automation';
                stopAllButton.style.display = 'block';
                stopAllButton.style.width = '100%';
                stopAllButton.style.padding = '0.375rem 0.5rem';
                stopAllButton.style.border = '1px solid #666';
                stopAllButton.style.background = '#700';
                stopAllButton.style.color = '#fff';
                stopAllButton.style.cursor = 'pointer';
                stopAllButton.addEventListener('click', () => {
                  setStressUi(false);
                  setAutomatePlayer(false);
                  closeOpenDialogs();
                  renderDebugControls();
                });

                const hint = document.createElement('div');
                hint.innerText = 'Hotkeys: Alt+Shift+S/A/W/C/J/X';
                hint.style.marginTop = '0.5rem';
                hint.style.fontSize = '11px';
                hint.style.opacity = '0.85';

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
              debugControls = document.createElement('div');
              debugControls.style.position = 'fixed';
              debugControls.style.top = '0.5rem';
              debugControls.style.right = '0.5rem';
              debugControls.style.zIndex = '2147483647';
              debugControls.style.width = '220px';
              debugControls.style.padding = '0.5rem';
              debugControls.style.background = 'rgba(0, 0, 0, 0.85)';
              debugControls.style.color = '#fff';
              debugControls.style.border = '1px solid #888';
              debugControls.style.fontFamily = 'monospace';
              debugControls.style.fontSize = '12px';

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

              document.addEventListener('keydown', debugKeyListener, true);
            }

            on(
              window,
              'beforeunload',
              () => {
                off(window, 'resize', resizeHandler);
                intervalHandler.dispose();
                memoryTestbed?.stop();
                stopStressRunner();
                debugControls?.remove();

                if (debugKeyListener) {
                  document.removeEventListener(
                    'keydown',
                    debugKeyListener,
                    true
                  );
                }

                transportDisposers.forEach((dispose) => dispose());
              },
              {
                once: true,
              }
            );

            const handler = (objectMap: ObjectMap): void => {
              // TODO: this causes a massive slowdown when its processed. Maybe we just leak for now...
              // let orphanIds: string[] | null = clearNextTurn ? [] : null;
              // let orphanIds: string[] | null = null;

              // TODO: look into if it's possible to have data reconstituted in a worker thread
              data = reconstituteData(
                objectMap
                // orphanIds
              ) as GameData;

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
                pruneObjectMap(objectMap);
                lastPrunedObjectCount = Object.keys(objectMap.objects).length;
              }

              // A bit crude, I'd like to run this as as background job too
              // if (orphanIds) {
              //   // clean up orphan data - late game there can be tens of thousands of these to clean up
              //   ((orphanIds) => {
              //     const maxCount = 1000,
              //       delay = 200;
              //
              //     for (
              //       let i = 0, max = Math.ceil(orphanIds.length / maxCount);
              //       i < max;
              //       i++
              //     ) {
              //       setTimeout(
              //         () =>
              //           orphanIds
              //             .slice(i * maxCount, (i + 1) * maxCount - 1)
              //             .forEach((id) => delete objectMap.objects[id]),
              //         (i + 1) * delay
              //       );
              //     }
              //   })(orphanIds);
              //
              //   clearNextTurn = false;
              // }

              document.dispatchEvent(
                new CustomEvent('dataupdated', {
                  detail: {
                    data,
                  },
                })
              );

              // if (lastTurn !== data.turn.value) {
              //   clearNextTurn = true;
              //   lastTurn = data.turn.value;
              // }

              const primaryActionList = [
                  'ChooseResearch',
                  'CityBuild',
                  'CivilDisorder',
                  'EndTurn',
                ],
                ignoredActionList = [
                  'ActiveUnit',
                  'ChangeProduction',
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
                  ChooseResearch: 80,
                  CityBuild: 60,
                  CivilDisorder: 10,
                },
                playerActions = data.player.actions.filter(
                  (action): action is PlayerAction => !!action
                ),
                primaryActionCandidates = [...playerActions]
                  .sort(
                    (a, b) =>
                      (primaryActionPriority[a._] ?? 0) -
                      (primaryActionPriority[b._] ?? 0)
                  )
                  .filter((action) => primaryActionList.includes(action._));

              primaryActions.build(primaryActionCandidates);

              secondaryActions.build(
                playerActions.filter(
                  (action) => !allExcludedActions.has(action._)
                )
              );

              gameArea.append(primaryActions.element());

              world.setTiles(data.player.world.tiles);

              const gameDetails = new GameDetails(
                gameInfo,
                data.turn,
                data.year
              );

              gameDetails.build();

              const playerDetails = new PlayerDetails(playerInfo, data.player);

              playerDetails.build();

              activeUnits = playerActions.filter(
                (action: PlayerAction): boolean => action._ === 'ActiveUnit'
              );

              const activeUnitAction = activeUnits.reduce(
                (bestAction: PlayerAction | null, action: PlayerAction) => {
                  const unit = action.value as Unit;
                  const unitScore =
                    unit === lastUnit
                      ? 2
                      : portal.isVisible(unit.tile.x, unit.tile.y)
                      ? 1
                      : 0;

                  if (bestAction === null) {
                    return action;
                  }

                  const bestUnit = bestAction.value as Unit;
                  const bestScore =
                    bestUnit === lastUnit
                      ? 2
                      : portal.isVisible(bestUnit.tile.x, bestUnit.tile.y)
                      ? 1
                      : 0;

                  return unitScore > bestScore ? action : bestAction;
                },
                null
              );

              if (lastUnit !== activeUnitAction?.value) {
                lastUnit = null;
              }

              setActiveUnit(
                lastUnit?.active
                  ? lastUnit
                  : activeUnitAction
                  ? (activeUnitAction.value as Unit)
                  : null,
                portal,
                unitsMap,
                activeUnitsMap
              );

              // ensure UI looks responsive
              portal.build(tilesToRender.splice(0));
              portal.render();

              minimap.update();

              const autoEndOfTurnExceptions = options.get(
                'autoEndOfTurnExceptions',
                []
              );

              if (
                options.get('autoEndOfTurn') &&
                data.player.mandatoryActions.length === 1 &&
                data.player.mandatoryActions.every(
                  (action) => action._ === 'EndTurn'
                ) &&
                !data.player.actions.some((action) =>
                  autoEndOfTurnExceptions.includes(action._)
                )
              ) {
                transport.send('action', {
                  name: 'EndTurn',
                });

                return;
              }
            };

            handler(objectMap);

            transportDisposers.push(
              transport.receive('gameData', (data, rawData) =>
                handler(rawData as ObjectMap)
              )
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

                            if (value._ === 'PlayerTile') {
                              // Since we only use tilesToRender for x and y this should be fine...
                              tilesToRender.push(value);
                            }
                          }
                        );
                      }

                      if (type === 'remove') {
                        if (index) {
                          removeObjectPath(objectMap.objects[key], index);

                          return;
                        }

                        delete objectMap.objects[key];
                      }
                    }
                  )
                );

                handler(objectMap);
              })
            );

            transportDisposers.push(
              transport.receive('gameNotification', (data): void =>
                notifications.receive(data)
              )
            );

            const keyToActionsMap: {
                [key: string]: string[];
              } = {
                ' ': ['NoOrders'],
                b: ['FoundCity'],
                D: ['Disband'],
                f: ['Fortify', 'BuildFortress'],
                i: [
                  'BuildIrrigation',
                  'ClearForest',
                  'ClearSwamp',
                  'ClearJungle',
                ],
                m: ['BuildMine', 'PlantForest'],
                P: ['Pillage'],
                r: ['BuildRoad', 'BuildRailroad'],
                s: ['Sleep'],
                u: ['Unload'],
                w: ['Wait'],
              },
              directionKeyMap: { [key: string]: NeighbourDirection } = {
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
                F4: () => new HappinessReport(data.player, portal, transport),
                F5: () => new TradeReport(data.player, portal, transport),
                F6: () => new ScienceReport(data.player),
              };

            let lastKey = '';

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
                      [unitAction] = activeUnit.actions.filter(
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

                if (key in directionKeyMap) {
                  const [unitAction] =
                      activeUnit.actionsForNeighbours[directionKeyMap[key]],
                    perform = () => {
                      transport.send('action', {
                        name: 'ActiveUnit',
                        id: activeUnit!.id,
                        unitAction: unitAction._,
                        target: unitAction.to.id,
                      });

                      event.stopPropagation();
                      event.preventDefault();
                    };

                  if (unitAction) {
                    if (
                      ['SneakAttack', 'SneakCaptureCity'].includes(unitAction._)
                    ) {
                      new ConfirmationWindow(
                        t('SneakAttack.title'),
                        t('SneakAttack.body', {
                          nation: t(
                            `${
                              (unitAction as SneakAttack).enemy.civilization._
                            }.nation`,
                            {
                              defaultValue: (unitAction as SneakAttack).enemy
                                .civilization._,
                              ns: 'civilization',
                            }
                          ),
                        }),
                        () => perform()
                      );

                      return;
                    }

                    perform();

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
                data.player.mandatoryActions.some(
                  (action) => action._ === 'EndTurn'
                )
              ) {
                transport.send('action', {
                  name: 'EndTurn',
                });

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

              if (key === 'w' && activeUnit && activeUnits.length > 1) {
                const units = activeUnits.map(
                    (unitAction) => unitAction.value as Unit
                  ),
                  current = units.indexOf(activeUnit),
                  unit = units[current === units.length - 1 ? 0 : current + 1];

                setActiveUnit(unit, portal, unitsMap, activeUnitsMap);
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

              if (lastKey === '%' && key === '^') {
                transport.send('cheat', { name: 'RevealMap', value: null });

                return;
              }

              lastKey = key;
            });
          } catch (e) {
            console.error(e);
          }
        }
      );
    } catch (e) {
      console.error(e);
    }
  }
}

export default Renderer;
