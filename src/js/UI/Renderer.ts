import { t } from 'i18next';
import { ObjectMap } from './lib/reconstituteData';
import GameSession from './game/GameSession';
import GameOverWindow from './components/GameOverWindow';
import MainMenu from './components/MainMenu';
import { downloadSave, takePendingSave } from './lib/savedGame';
import Notices from './components/Notices';
import Notifications from './components/Notifications';
import HaltedUnits from './lib/haltedUnits';
import Transport from './Transport';
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
      const elements = appElements(),
        notifications = new Notifications(),
        notices = new Notices(),
        // Taken, not read: one reload loads one save. Read here so the welcome
        // window can be skipped — a loaded game is not a new one.
        pendingSave = await takePendingSave(),
        mainMenu = new MainMenu(elements.mainMenuElement, this.#transport),
        // Units whose GoTo stopped next to a choice (#357).
        haltedUnits = new HaltedUnits();

      preloadAssets(elements.preloadContainer);

      // Made once the game data, and the map it draws on, have arrived. The
      //  choice windows' receiver below, registered before then, forgets the
      //  keys kept for a unit through it.
      let gameSession: GameSession | null = null;

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

      const notificationBar = new NotificationBar(elements.notificationArea);

      transportDisposers.push(notificationBar.listen(transport));

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
