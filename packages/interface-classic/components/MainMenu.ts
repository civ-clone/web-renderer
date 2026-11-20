import { Element, s } from '@dom111/element';
import GameSetupWindow from './GameSetupWindow';
import HallOfFameWindow from '@civ-clone/ui-reports/components/HallOfFameWindow';
import LibraryWindow from '@civ-clone/ui-menus/components/LibraryWindow';
import ReleaseWindow, {
  fetchReleases,
} from '@civ-clone/ui-menus/components/ReleaseWindow';
import Transport from '@civ-clone/ui-client/Transport';
import { chooseSave } from '@civ-clone/ui-menus/components/LoadGameWindow';
import { h } from '@civ-clone/ui-widgets/lib/html';
import { mappedKeyFromEvent } from '@civ-clone/ui-platform/lib/mappedKey';
import build from '@civ-clone/ui-client/lib/build';
import { t } from 'i18next';
import { unlessRequestFailed } from '@civ-clone/ui-client/lib/unlessRequestFailed';
import { askEarth, askNewGame } from '@civ-clone/ui-menus/components/newGame';
import { canLoad, cantPlayReason } from '@civ-clone/ui-menus/lib/playable';

export class MainMenu extends Element {
  #transport: Transport;

  constructor(element: HTMLElement, transport: Transport) {
    super(element);

    this.#transport = transport;

    this.build();

    this.addClass('active');
  }

  async build() {
    // A game is offered whenever there's art to draw it with (#1063): civ.one's own, or the player's import. Without
    //  any, on a first visit offline with nothing imported, the menu says why in place of the game's items. A save
    //  loads wherever its art is there, on a grid new games don't offer yet too (`canLoad`).
    const reason = cantPlayReason(),
      playable = reason === null,
      loadable = canLoad(),
      why = s<HTMLParagraphElement>('<p class="no-art" role="alert"></p>');

    why.textContent = reason ?? '';
    why.hidden = playable;

    this.append(
      h(
        s(
          '<nav></nav>',
          why,
          // New Game as it has always been, and beside it the game setup (#605), for seats, civilizations and the rest.
          s(
            `<div class="row"></div>`,
            h(
              s(
                `<button class="btn-bare" autofocus${
                  playable ? '' : ' hidden'
                }>${t('MainMenu.new-game')}</button>`
              ),
              {
                // Each game, or Customise… for the game setup (#1247).
                click: () => {
                  askNewGame(
                    this.#transport,
                    () => this.remove(),
                    () =>
                      // Not answered: the player has been told, and the menu is still here (#580).
                      GameSetupWindow.ask(this.#transport, () =>
                        this.remove()
                      ).catch(unlessRequestFailed)
                  );
                },
              }
            ),
            h(
              s(
                `<button class="btn-bare secondary"${
                  playable ? '' : ' hidden'
                }>${t('MainMenu.customise')}</button>`
              ),
              {
                // Not answered: the player has been told, and the menu is still here (#580).
                click: () =>
                  GameSetupWindow.ask(this.#transport, () =>
                    this.remove()
                  ).catch(unlessRequestFailed),
              }
            )
          ),
          h(
            s(
              `<button class="btn-bare"${playable ? '' : ' hidden'}>${t(
                'MainMenu.earth'
              )}</button>`
            ),
            {
              click: () => askEarth(this.#transport, () => this.remove()),
            }
          ),
          h(
            s(
              `<button class="btn-bare"${playable ? '' : ' hidden'}>${t(
                'MainMenu.customize-world'
              )}</button>`
            ),
            {
              // The same setup, with the world's exact size and land to hand (#605).
              click: () =>
                GameSetupWindow.ask(this.#transport, () => this.remove(), {
                  advanced: true,
                }).catch(unlessRequestFailed),
            }
          ),
          h(
            s(
              `<button class="btn-bare"${loadable ? '' : ' hidden'}>${t(
                'MainMenu.load-game'
              )}</button>`
            ),
            {
              // An autosave (#653) or a file, its seats shown first, to reassign (#608).
              click: () => void chooseSave(this.#transport),
            }
          ),
          h(
            s(
              `<button class="btn-bare">${t('MainMenu.hall-of-fame')}</button>`
            ),
            {
              click: () => new HallOfFameWindow(),
            }
          ),
          h(s(`<button class="btn-bare">${t('MainMenu.library')}</button>`), {
            // The library of art and sound (#1063), where each set is imported.
            click: () => new LibraryWindow(),
          })
        ),
        {
          keydown(event: KeyboardEvent) {
            const currentTarget = document.activeElement,
              key = mappedKeyFromEvent(event);

            if (
              currentTarget === null ||
              !currentTarget.matches('#mainmenu nav button')
            ) {
              return;
            }

            // In the order shown, whichever row a button is in.
            const buttons = Array.from(
                document.querySelectorAll<HTMLElement>(
                  '#mainmenu nav button:not([hidden])'
                )
              ),
              index = buttons.indexOf(currentTarget as HTMLElement),
              step = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0;

            if (step !== 0 && buttons[index + step]) {
              buttons[index + step]!.focus();
            }
          },
        }
      ),
      s(
        `<footer></footer>`,
        h(
          s(
            `<a href="#releases">${t('MainMenu.version', {
              version: build.version,
            })}</a>`
          ),
          {
            click(event) {
              event.preventDefault();

              new ReleaseWindow(() => fetchReleases(build.version));
            },
          }
        )
      )
    );
  }

  override remove(): void {
    this.queryAll('button').forEach((button) =>
      button.setAttribute('disabled', '')
    );

    this.removeClass('active');

    setTimeout((): void => super.remove(), 2000);
  }
}

export default MainMenu;
