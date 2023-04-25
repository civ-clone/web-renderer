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
import { emit, on, s } from '@dom111/element';
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

    options.set('autoEndOfTurn', true);

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
        activeUnit: Unit | null = null;

      transport.receive('notification', (data: string): void => {
        notificationArea.innerHTML = data;

        if (globalNotificationTimer) {
          window.clearTimeout(globalNotificationTimer);
        }

        globalNotificationTimer = window.setTimeout((): void => {
          globalNotificationTimer = undefined;

          notificationArea.innerText = '';
        }, 4000);
      });

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

      transport.receive('chooseFromList', ({ choices, key, data }) => {
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

          window.once('close', () =>
            transport.send('chooseFromList', choices[0].id)
          );

          return;
        }

        const body =
          key === 'negotiation.next-step'
            ? negotiationLabel(data as Negotiation)
            : t(`ChooseFromList.${key}.body`, {
                data,
                defaultValue: t('ChooseFromList.default.body'),
              });

        new SelectionWindow(
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
      });

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
                  leader: t(
                    `Leader.${data.player.civilization.leader._}.name`,
                    {
                      defaultValue: data.player.civilization.leader._,
                      ns: 'civilization',
                    }
                  ),
                  nation: t(`${data.player.civilization._}.plural`, {
                    defaultValue: data.player.civilization._,
                    ns: 'civilization',
                  }),
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
                data.player,
                portal,
                transport
              );

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

            on(window, 'resize', () => {
              mapPortal.width = (
                mapPortal.parentElement as HTMLElement
              ).offsetWidth;
              mapPortal.height = (
                mapPortal.parentElement as HTMLElement
              ).offsetHeight;
            });

            // This needs wrapping.
            // let lastTurn = 1,
            //   clearNextTurn = false;

            const handler = (objectMap: ObjectMap): void => {
              // TODO: this causes a massive slowdown when its processed. Maybe we just leak for now...
              // let orphanIds: string[] | null = clearNextTurn ? [] : null;
              // let orphanIds: string[] | null = null;

              // TODO: look into if it's possible to have data reconstituted in a worker thread
              data = reconstituteData(
                objectMap
                // orphanIds
              ) as GameData;

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
                primaryActionPriority: {
                  [key: string]: number;
                } = {
                  EndTurn: 100,
                  ChooseResearch: 80,
                  CityBuild: 60,
                  CivilDisorder: 10,
                };

              primaryActions.build(
                data.player.actions
                  .filter((action) => primaryActionList.includes(action._))
                  .sort(
                    (a, b) =>
                      (primaryActionPriority[b._] ?? 0) -
                      (primaryActionPriority[a._] ?? 0)
                  )
              );

              secondaryActions.build(
                data.player.actions.filter(
                  (action) =>
                    ![...primaryActionList, ...ignoredActionList].includes(
                      action._
                    )
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

              activeUnits = data.player.actions.filter(
                (action: PlayerAction): boolean => action._ === 'ActiveUnit'
              );

              // This prioritises units that are already on screen
              const [activeUnitAction] = activeUnits.sort(
                ({ value: unitA }, { value: unitB }): number =>
                  unitB === lastUnit
                    ? 1
                    : unitA === lastUnit
                    ? -1
                    : (portal.isVisible(
                        (unitB as Unit).tile.x,
                        (unitB as Unit).tile.y
                      )
                        ? 1
                        : 0) -
                      (portal.isVisible(
                        (unitA as Unit).tile.x,
                        (unitA as Unit).tile.y
                      )
                        ? 1
                        : 0)
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

              if (
                options.get('autoEndOfTurn') &&
                data.player.mandatoryActions.length === 1 &&
                data.player.mandatoryActions.every(
                  (action) => action._ === 'EndTurn'
                )
              ) {
                transport.send('action', {
                  name: 'EndTurn',
                });

                return;
              }
            };

            handler(objectMap);

            transport.receive('gameData', (data, rawData) =>
              handler(rawData as ObjectMap)
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

                delete tmpObj[lastPart];
              };

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
            });

            transport.receive('gameNotification', (data): void =>
              notifications.receive(data)
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
