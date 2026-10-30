import { t } from 'i18next';
import { ObjectMap } from './lib/reconstituteData';
import GameSession from './game/GameSession';
import GameOverWindow from './components/GameOverWindow';
import { ObserverState } from '../Engine/Observer';
import MainMenu from './components/MainMenu';
import { downloadFile, saveFile, takePendingSave } from './lib/savedGame';
import { keepSave } from './lib/browserSaves';
import Notices from './components/Notices';
import Notifications from './components/Notifications';
import HaltedUnits from './lib/haltedUnits';
import Transport from './Transport';
import DebugFlags from './debug/DebugFlags';
import DebugPanel from './debug/DebugPanel';
import parseBooleanParam from './lib/parseBooleanParam';
import appElements from './app/elements';
import initI18n from './app/i18n';
import { setCursor, setTilesetSizes } from './app/assets';
import { assetStore } from './AssetStore';
import setOptionDefaults from './app/options';
import ReloadGuard from './app/ReloadGuard';
import NotificationBar from './app/NotificationBar';
import ChoiceHandler from './app/ChoiceHandler';
import WorkerFailures from './app/WorkerFailures';
import buildSidebar from './app/sidebar';

// TODO: !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//  ! Break this down and use a front-end framework? !
//  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

// An error's message, for saying: anything thrown, `Error` or not.
const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

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

    setTilesetSizes();
    // Every sprite of the tileset in use, decoded before anything is drawn from them (#730).
    await assetStore.load();
    await setCursor();
    await initI18n();

    new ReloadGuard(() => gameStarted);

    setOptionDefaults();

    DebugPanel.automateLocalPlayer(debugFlags, transport);

    try {
      const elements = appElements(),
        notifications = new Notifications(),
        notices = new Notices(),
        // Taken, not read: one reload loads one save. Read here so the welcome
        // window can be skipped — a loaded game is not a new one.
        pendingLoad = await takePendingSave(),
        pendingSave = pendingLoad === null ? null : pendingLoad.data,
        mainMenu = new MainMenu(elements.mainMenuElement, this.#transport),
        // Units whose GoTo stopped next to a choice (#357).
        haltedUnits = new HaltedUnits();

      const sidebar = document.getElementById('sidebar');

      if (sidebar) {
        buildSidebar(sidebar, elements);
      }

      // Made once the game data, and the map it draws on, have arrived. The
      //  choice windows' receiver below, registered before then, forgets the
      //  keys kept for a unit through it.
      let gameSession: GameSession | null = null;

      const transportDisposers: Array<() => void> = [];

      // A game nobody here plays is watched (#607): the worker says so, with the players to see it as, before the first
      //  `gameData`. Kept for the session to build on, and for the ending, which is then nobody's own.
      let observerState: ObserverState | null = null;

      transportDisposers.push(
        transport.receive('observer', (state): void => {
          observerState = state;
        })
      );

      // However the game ends (#176). Listened for from the start: a game loaded at its ending says so before its map
      //  arrives.
      transportDisposers.push(
        transport.receive(
          'gameOver',
          (details): void =>
            void new GameOverWindow(details, transport, {
              observer: observerState !== null,
            })
        )
      );

      const notificationBar = new NotificationBar(elements.notificationArea);

      // Saves are kept in the browser (#653), and downloaded from Load Game. One the browser won't keep is downloaded
      //  now instead, so it isn't lost.
      transportDisposers.push(
        transport.receive('saveGame', ({ name, data }): void => {
          saveFile(data)
            .then(async (file: Blob): Promise<void> => {
              let refused: Error | null = null;

              if (
                await keepSave(name, file, 'player', (error: Error): void => {
                  refused = error;
                })
              ) {
                notificationBar.show(t('SavedGame.saved', { name }));

                return;
              }

              await downloadFile(name, file);

              notificationBar.show(
                t('SavedGame.downloaded-instead', {
                  error: describe(refused),
                })
              );
            })
            .catch((error: Error): void =>
              window.alert(
                t('SavedGame.could-not-write', { error: describe(error) })
              )
            );
        })
      );

      // A new game's first turn, and every few after (#653). Storage that is full or refused is said, and the game goes
      //  on.
      transportDisposers.push(
        transport.receive('autosaveGame', ({ name, kind, data }): void => {
          void keepSave(name, data, kind, (error: Error): void =>
            notificationBar.show(
              t('SavedGame.autosave-failed', { error: describe(error) })
            )
          );
        })
      );

      transportDisposers.push(notificationBar.listen(transport));

      // From the start: a load or a new game can fail before there is a game to show (#470).
      transportDisposers.push(WorkerFailures.listen(transport));

      transportDisposers.push(
        ChoiceHandler.listen(transport, {
          clearKeys: (): void => gameSession?.clearKeys(),
          debugFlags,
        })
      );

      transport.receiveOnce(
        'gameData',
        (
          // The map as it arrived: the transport does not rebuild it, so that
          // it is rebuilt once, here (#333).
          objectMap: ObjectMap
        ): void => {
          gameSession = new GameSession({
            elements,
            transport,
            notifications,
            notices,
            haltedUnits,
            debugFlags,
            notificationBar,
            pendingSave,
            cheatsEnabled: parseBooleanParam(queryParams.get('cheat'), false),
            observer: (): ObserverState | null => observerState,
            setGameStarted: (): void => {
              gameStarted = true;
            },
            transportDisposers,
          });

          gameSession.start(objectMap);
        }
      );

      // Last, because the worker starts hydrating the moment it is told to and
      // the first `gameData` follows immediately: every handler above has to be
      // listening before that. There is no `start` for a loaded game — that is
      // what generates a world.
      if (pendingLoad !== null) {
        mainMenu.remove();

        // Marks a DevTools timeline or `performance.getEntriesByType('mark')` can read, for where a load's time goes
        //  (#325).
        performance.mark('civ:load-sent');

        transport.send('load', {
          data: pendingLoad.data,
          seats: pendingLoad.seats,
        });
      }
    } catch (e) {
      console.error(e);
    }
  }
}

export default Renderer;
