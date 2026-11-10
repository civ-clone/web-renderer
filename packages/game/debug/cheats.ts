import { s } from '@dom111/element';
import CheatAdvances from '@civ-clone/ui-protocol/Requests/CheatAdvances';
import CheatUnitTypes from '@civ-clone/ui-protocol/Requests/CheatUnitTypes';
import CheatPlayers, {
  CheatPlayersResult,
} from '@civ-clone/ui-protocol/Requests/CheatPlayers';
import { GameMenuItem } from '@civ-clone/ui-windows/components/mapMenus';
import Portal from '@civ-clone/ui-map/components/Portal';
import Transport from '@civ-clone/ui-client/Transport';
import Window from '@civ-clone/ui-component-window/Window';
import { elementId, h } from '@civ-clone/ui-widgets/lib/html';
import { t } from 'i18next';
import { unlessRequestFailed } from '@civ-clone/ui-client/lib/unlessRequestFailed';

// The local player comes first, labelled "You" with an empty value so leaving
// the select alone sends no `player` at all; every other player follows,
// including civilizations we haven't met, labelled with their civilization, capitalised as a label ("The Aztec
// Empire", #359).
const cheatPlayerSelect = (players: CheatPlayersResult[]): HTMLSelectElement =>
  s<HTMLSelectElement>(
    `<select>${[
      `<option value="">${t('GameMenu.cheat.you')}</option>`,
      ...players
        .filter((player) => !player.isLocal)
        .map(
          (player) =>
            `<option value="${player.id}">${t(
              'Generic.civilization-name.nation-start',
              { civilization: player.civilization }
            )}</option>`
        ),
    ].join('')}</select>`
  );

// A menu item that asks the worker before it opens its window: one that isn't answered opens nothing, the player
//  having been told (#580).
const whenAnswered =
  (action: () => Promise<void>): (() => void) =>
  (): void =>
    void action().catch(unlessRequestFailed);

// Both grant cheats share one form: who receives it, then what they receive.
// The Grant button or Enter submits. `onPlayerChange` refills `control` for
// the chosen player; the player select is disabled until it has, so a reply
// for an earlier choice can't land after a later one.
const cheatGrantWindow = (
  title: string,
  players: CheatPlayersResult[],
  control: HTMLInputElement | HTMLSelectElement,
  label: string,
  onSubmit: (player: string | null) => void,
  onPlayerChange: (player: string | null) => Promise<void> = async () => {}
): Window => {
  const select = cheatPlayerSelect(players),
    button = s<HTMLButtonElement>(
      `<button class="btn-secondary">${t('GameMenu.cheat.grant')}</button>`
    ),
    window = new Window(
      title,
      s(
        '<div class="cheat-grant"></div>',
        ...(
          [
            [select, t('GameMenu.cheat.player')],
            [control, label],
          ] as [HTMLElement, string][]
        ).map(([control, label]) =>
          s(
            `<div class="option"><label for="${elementId(
              control
            )}">${label}</label></div>`,
            control
          )
        ),
        s('<div class="actions"></div>', button)
      )
    ),
    submit = (): void => {
      onSubmit(select.value || null);

      window.close();
    };

  // The player `control` was last filled for.
  let filledFor = select.value;

  h(select, {
    change: async () => {
      select.disabled = true;

      try {
        await onPlayerChange(select.value || null);

        filledFor = select.value;
      } catch (error) {
        // Not answered: the player has been told, and `control` still holds the last player's, so that player is
        //  chosen again, rather than granting them to this one (#580).
        select.value = filledFor;

        unlessRequestFailed(error);
      } finally {
        select.disabled = false;
      }
    },
  });

  h(button, {
    click: () => submit(),
  });

  h(control, {
    keydown: (event: KeyboardEvent) => {
      if (event.key !== 'Enter') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      submit();
    },
  });

  control.focus();

  return window;
};

// Unlike the grant forms this stays open after Create, so several units can be
// placed. While it is open, clicking the map fills in the clicked tile's
// coordinates; the click still does whatever it normally does.
const cheatCreateUnitWindow = (
  players: CheatPlayersResult[],
  unitTypes: string[],
  portal: Portal,
  start: { x: number; y: number },
  onSubmit: (value: {
    player: string | null;
    unitType: string;
    x: number;
    y: number;
  }) => void
): Window => {
  const select = cheatPlayerSelect(players),
    unitType = s<HTMLSelectElement>(
      `<select>${unitTypes
        .map((unitType): [string, string] => [
          unitType,
          t(`${unitType}.name`, {
            defaultValue: unitType,
            ns: 'unit',
          }),
        ])
        .sort(([, a], [, b]) => a.localeCompare(b))
        .map(
          ([unitType, name]) => `<option value="${unitType}">${name}</option>`
        )
        .join('')}</select>`
    ),
    x = s<HTMLInputElement>(
      `<input type="number" step="1" min="0" value="${start.x}">`
    ),
    y = s<HTMLInputElement>(
      `<input type="number" step="1" min="0" value="${start.y}">`
    ),
    button = s<HTMLButtonElement>(
      `<button class="btn-secondary">${t('GameMenu.cheat.create')}</button>`
    ),
    window = new Window(
      t('GameMenu.cheat.create-unit'),
      s(
        '<div class="cheat-grant"></div>',
        ...(
          [
            [select, t('GameMenu.cheat.player')],
            [unitType, t('GameMenu.cheat.unit-type')],
            [x, t('GameMenu.cheat.x')],
            [y, t('GameMenu.cheat.y')],
          ] as [HTMLElement, string][]
        ).map(([control, label]) =>
          s(
            `<div class="option"><label for="${elementId(
              control
            )}">${label}</label></div>`,
            control
          )
        ),
        s(`<p class="hint">${t('GameMenu.cheat.click-map')}</p>`),
        s('<div class="actions"></div>', button)
      )
    ),
    fill = (tileX: number, tileY: number): void => {
      x.value = String(tileX);
      y.value = String(tileY);
    },
    submit = (): void => {
      const tileX = x.valueAsNumber,
        tileY = y.valueAsNumber;

      // A fractional or negative coordinate is refused, not rounded onto another square.
      if (
        !unitType.value ||
        !Number.isInteger(tileX) ||
        !Number.isInteger(tileY) ||
        tileX < 0 ||
        tileY < 0
      ) {
        return;
      }

      onSubmit({
        player: select.value || null,
        unitType: unitType.value,
        x: tileX,
        y: tileY,
      });
    };

  portal.on('tile-clicked', fill);
  window.on('close', () => portal.off('tile-clicked', fill));

  h(button, {
    click: () => submit(),
  });

  [x, y].forEach((control) =>
    h(control, {
      keydown: (event: KeyboardEvent) => {
        if (event.key !== 'Enter') {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        submit();
      },
    })
  );

  return window;
};

// The Game menu's cheat items (`?cheat=1`, or Shift+5 then Shift+6), which `GameMenu` asks for each time it opens while
//  the cheats are on.
export const cheatRows = (
  portal: Portal,
  transport: Transport
): GameMenuItem[] => [
  {
    label: t('GameMenu.cheat.reveal-map'),
    action: () => {
      transport.send('cheat', {
        name: 'RevealMap',
        value: null,
      });
    },
  },
  {
    label: t('GameMenu.cheat.grant-advance'),
    action: whenAnswered(async () => {
      const advances = s<HTMLSelectElement>(
          '<select multiple size="10"></select>'
        ),
        showAdvances = async (player: string | null): Promise<void> => {
          const available: string[] = await transport.request(
            new CheatAdvances(player)
          );

          advances.innerHTML =
            available.length === 0
              ? `<option disabled>${t('GameMenu.cheat.no-advances')}</option>`
              : available
                  .map((advance): [string, string] => [
                    advance,
                    t(`${advance}.name`, {
                      defaultValue: advance,
                      ns: 'science',
                    }),
                  ])
                  .sort(([, a], [, b]) => a.localeCompare(b))
                  .map(
                    ([advance, name]) =>
                      `<option value="${advance}">${name}</option>`
                  )
                  .join('');
        };

      await showAdvances(null);

      cheatGrantWindow(
        t('GameMenu.cheat.grant-advance'),
        await transport.request(new CheatPlayers()),
        advances,
        t('GameMenu.cheat.choose-advances'),
        (player) => {
          const chosen = [...advances.selectedOptions].map(
            (option) => option.value
          );

          if (chosen.length === 0) {
            return;
          }

          transport.send('cheat', {
            name: 'GrantAdvance',
            value: {
              advances: chosen,
              ...(player ? { player } : {}),
            },
          });
        },
        showAdvances
      );
    }),
  },
  {
    label: t('GameMenu.cheat.create-unit'),
    action: whenAnswered(async () => {
      const [players, unitTypes] = await Promise.all([
        transport.request(new CheatPlayers()),
        transport.request(new CheatUnitTypes()),
      ]);

      cheatCreateUnitWindow(
        players,
        unitTypes,
        portal,
        portal.center(),
        ({ player, unitType, x, y }) =>
          transport.send('cheat', {
            name: 'CreateUnit',
            value: {
              unitType,
              x,
              y,
              ...(player ? { player } : {}),
            },
          })
      );
    }),
  },
  {
    label: t('GameMenu.cheat.grant-gold'),
    action: whenAnswered(async () => {
      const amount = s<HTMLInputElement>('<input type="number" step="1">');

      cheatGrantWindow(
        t('GameMenu.cheat.grant-gold'),
        await transport.request(new CheatPlayers()),
        amount,
        t('GameMenu.cheat.enter-gold-amount'),
        (player) => {
          const value = parseInt(amount.value, 10);

          if (Number.isNaN(value)) {
            return;
          }

          transport.send('cheat', {
            name: 'GrantGold',
            value: {
              amount: value,
              ...(player ? { player } : {}),
            },
          });
        }
      );
    }),
  },
];

export default cheatRows;
