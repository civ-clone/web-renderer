import { t } from 'i18next';
import { ObjectMap } from '@civ-clone/core-data-object/DataObject';
import GameSession from './GameSession';
import GameOverWindow from '@civ-clone/ui-reports/components/GameOverWindow';
import { ObserverState } from '@civ-clone/ui-protocol/observer';
import titleScreen from '@civ-clone/ui-menus/components/titleScreen';
import {
  downloadFile,
  saveFile,
  savedTopologyId,
  discardPendingSave,
  readPendingSave,
} from '@civ-clone/ui-menus/lib/savedGame';
import { keepSave } from '@civ-clone/ui-client/lib/browserSaves';
import Notices from '@civ-clone/ui-hud/components/Notices';
import Notifications from '@civ-clone/ui-hud/components/Notifications';
import HaltedUnits from '@civ-clone/ui-client/lib/haltedUnits';
import Transport from '@civ-clone/ui-client/Transport';
import DebugFlags from '@civ-clone/ui-client/debug/DebugFlags';
import DebugPanel from './debug/DebugPanel';
import parseBooleanParam from '@civ-clone/ui-client/lib/parseBooleanParam';
import appElements from './app/elements';
import initI18n from './app/i18n';
import { setCursor, setTilesetSizes } from './app/assets';
import installPacks, {
  ensureMapArt,
} from '@civ-clone/ui-assets/lib/installPacks';
import prepareMapArt, {
  sayMapArtFellBack,
} from '@civ-clone/ui-menus/lib/mapArt';
import { followSavedRuleSet } from '@civ-clone/ui-menus/lib/pluginSets';
import { provideStartPreparation } from '@civ-clone/ui-client/lib/startPreparation';
import setOptionDefaults from './app/options';
import { instance as options } from '@civ-clone/ui-platform/GameOptionsRegistry';
import {
  applyColourScheme,
  applyUiTheme,
  currentUiTheme,
  uiThemeArt,
  uiThemeFrom,
} from '@civ-clone/ui-widgets/lib/theme';
import {
  interfaceArt,
  provideInterfaceArt,
} from '@civ-clone/ui-assets/lib/interfaceArt';
import {
  applyInterface,
  currentInterface,
} from '@civ-clone/ui-platform/lib/interfaceMode';
import { installGlyphs } from '@civ-clone/ui-platform/lib/glyphs';
import { offerUnfinishedGrids } from '@civ-clone/ui-assets/lib/tilesets';
import offersUnfinishedGrids from './app/unfinishedGrids';
import ReloadGuard from './app/ReloadGuard';
import NotificationBar from './app/NotificationBar';
import ChoiceHandler from './app/ChoiceHandler';
import WorkerFailures from './app/WorkerFailures';
import buildSidebar from './app/sidebar';
import music from './app/music';
import showStartFailure from './app/startFailure';
import EventSounds from '@civ-clone/ui-audio/eventSounds';

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

  // Whatever stops the game starting is said, not only logged (#850): the page would otherwise stay blank.
  async init(): Promise<void> {
    try {
      await this.#start();
    } catch (error) {
      console.error(error);
      showStartFailure(error);
    }
  }

  async #start(): Promise<void> {
    const transport = this.#transport;
    const queryParams = new URLSearchParams(window.location.search);

    // The options first, and the look from them before anything is drawn, so nothing shows in the wrong colours
    //  first (#736, #706).
    setOptionDefaults();
    // The interface (#735), before any window is made: `Window` reads it (#738). Then its theme, unless the player has
    //  chosen one (#824).
    applyInterface(queryParams.get('interface'), options.get('interface'));
    applyUiTheme(
      uiThemeFrom(
        queryParams.get('theme'),
        options.get('uiTheme'),
        currentInterface().theme
      )
    );
    // The interface's art is the theme's (#1063), as it is now: what's drawn with it stays drawn, so a theme chosen with
    //  other art changes it at the next load.
    const art = uiThemeArt(currentUiTheme());

    provideInterfaceArt(() => art);
    applyColourScheme(options.get('colourScheme', 'system'));
    // The interface's glyphs, for every `glyph()` to refer to (#741).
    installGlyphs();

    const debugFlags = new DebugFlags(
      parseBooleanParam(queryParams.get('debug'), false)
    );
    // Hex isn't offered for new games until its overlays and city screen are done, except on a page loaded with
    //  `?hex=1` (#1063). A save on it loads either way.
    offerUnfinishedGrids(offersUnfinishedGrids(window.location.search));

    // Once a game is running, F5 is a leader-screen shortcut (TradeReport),
    // not a reload; only Ctrl/Cmd+R stays a reload from that point on.
    let gameStarted = false;

    // Every sprite of the tilesets there are, decoded before anything is drawn from them (#730), and the ones whose
    //  sprites have all been imported installed, so their grids are offered (#97). A hosted set's sheet is fetched now
    //  only when the interface draws from it; a game's map's, as that game starts or loads (#1063).
    await installPacks();
    provideStartPreparation(prepareMapArt);
    // Then the interface's art, settled from the sets installed (#1063): its sizes and cursor, and every icon after.
    setTilesetSizes(interfaceArt());
    await setCursor();
    await initI18n();
    // Silent without an ASOUND.CVL; with one, waits for the player's first key or click (#126).
    await music.init();

    new ReloadGuard(() => gameStarted);

    DebugPanel.automateLocalPlayer(debugFlags, transport);

    try {
      const elements = appElements(),
        notifications = new Notifications(),
        notices = new Notices(),
        // Read here so the welcome window can be skipped — a loaded game is
        // not a new one — and forgotten once its load is sent, so a reload
        // tries again a load that stopped before then (#1114).
        pendingLoad = await readPendingSave(),
        pendingSave = pendingLoad === null ? null : pendingLoad.data,
        // The list, or the classic menu (#749).
        mainMenu = new (titleScreen.current())(
          elements.mainMenuElement,
          this.#transport
        ),
        // Units whose GoTo stopped next to a choice (#357).
        haltedUnits = new HaltedUnits(),
        // The game's moments as Civ1's tunes (#126).
        sounds = new EventSounds({ jukebox: music });

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
      // A game loaded at its ending plays the ending's tune before its map arrives, which the game's start doesn't fade.
      let endingHeard = false;

      transportDisposers.push(
        transport.receive('observer', (state): void => {
          observerState = state;
        })
      );

      // However the game ends (#176). Listened for from the start: a game loaded at its ending says so before its map
      //  arrives.
      transportDisposers.push(
        transport.receive('gameOver', (details): void => {
          // Ours to celebrate or lament: not a watcher's.
          if (observerState === null) {
            endingHeard = true;
            sounds.gameOver(details);
          }

          new GameOverWindow(details, transport, {
            observer: observerState !== null,
          }).on('close', () => sounds.gameOverClosed());
        })
      );

      const notificationBar = new NotificationBar(elements.notificationArea);

      // Saves are kept in the browser (#653), and downloaded from Load Game. One the browser won't keep is downloaded
      //  now instead, so it isn't lost.
      transportDisposers.push(
        transport.receive('saveGame', ({ name, data, details }): void => {
          saveFile(data)
            .then(async (file: Blob): Promise<void> => {
              let refused: Error | null = null;

              if (
                await keepSave(
                  name,
                  file,
                  'player',
                  (error: Error): void => {
                    refused = error;
                  },
                  undefined,
                  details ?? null
                )
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
        transport.receive(
          'autosaveGame',
          ({ name, kind, data, details }): void => {
            void keepSave(
              name,
              data,
              kind,
              (error: Error): void =>
                notificationBar.show(
                  t('SavedGame.autosave-failed', { error: describe(error) })
                ),
              undefined,
              details ?? null
            );
          }
        )
      );

      transportDisposers.push(notificationBar.listen(transport));

      // From the start: a load or a new game can fail before there is a game to show (#470).
      transportDisposers.push(WorkerFailures.listen(transport));

      transportDisposers.push(
        ChoiceHandler.listen(transport, {
          clearKeys: (): void => gameSession?.clearKeys(),
          debugFlags,
          meeting: (meeting): void => gameSession?.meeting(meeting),
          sounds,
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
              // The title menu's music fades as the game begins (#126).
              if (!endingHeard) {
                music.stop();
              }
            },
            transportDisposers,
            sounds,
          });

          gameSession.start(objectMap);
        }
      );

      // Last, because the worker starts hydrating the moment it is told to and
      // the first `gameData` follows immediately: every handler above has to be
      // listening before that. There is no `start` for a loaded game — that is
      // what generates a world.
      if (pendingLoad === null) {
        // Evolution on the title menu, as the original's menu plays it, on until the game begins (#126).
        music.play(4);
      } else {
        const save = JSON.parse(pendingLoad.data);

        // The art the save's map is drawn with, its rule set's when that names some (#1114), fetched first if it has
        //  to be (#1063), or another set ready for its grid, which is said, when it can't be (#1141). With none, the
        //  start stops, saying why, and the save waits for a reload to try again.
        await followSavedRuleSet(transport, save?.pluginSet);
        sayMapArtFellBack(await ensureMapArt(savedTopologyId(save)));

        mainMenu.remove();
        await discardPendingSave();

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
      showStartFailure(e);
    }
  }
}

export default Renderer;
