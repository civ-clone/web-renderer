import { Player, Unit as UnitData, UnitAction } from '../types';
import ActionWindow from '../components/ActionWindow';
import ConfirmationWindow from '../components/ConfirmationWindow';
import NotificationWindow from '../components/NotificationWindow';
import { openChoice } from '../components/choiceList';
import Window from '../components/Window';
import { t } from 'i18next';

// The windows a unit action can need before it's sent: a sneak attack's confirmation, a treaty partner's land (#287),
//  a Caravan's "Will you?" (#57), a Diplomat's arrival, incite and bribe windows (#58). Shared by the arrow keys and
//  the unit action menu.

type Perform = (action: UnitAction) => void;

export type CostedAction = UnitAction & { cost: number };

export type EnemyAction = UnitAction & { enemy: Player };

// Offered in place of an action that would break a treaty, under a Senate (#133): `action` is what was asked for.
export type OverruledAction = UnitAction & { action: EnemyAction };

const sneakActions = [
    'SneakAttack',
    'SneakCaptureCity',
    'SneakNuclearAttack',
    'SneakStealTechnology',
    'SneakInciteRevolt',
  ],
  // Onto, or pillaging, a treaty partner's land (#287).
  treatyActions = ['SneakMove', 'SneakPillage'],
  caravanActions = ['EstablishTradeRoute', 'HelpBuildWonder'],
  inciteActions = ['InciteRevolt', 'SneakInciteRevolt', 'SubvertCity'],
  // The Diplomat's arrival popup, in Civ1's order, each option standing for the actions that do it.
  diplomatOptions: [string, string[]][] = [
    ['establish-embassy', ['EstablishEmbassy']],
    ['investigate-city', ['InvestigateCity']],
    ['steal-technology', ['StealTechnology', 'SneakStealTechnology']],
    ['industrial-sabotage', ['IndustrialSabotage']],
    ['incite-revolt', inciteActions],
    ['meet-with-king', ['MeetWithKing']],
  ];

const civilization = (
  player: { civilization: { _: string } },
  form: 'name' | 'plural'
): string =>
  t(`${player.civilization._}.${form}`, {
    defaultValue: player.civilization._,
    ns: 'civilization',
  });

const cityName = (action: UnitAction): string => {
  const city = action.to.city!;

  return t('Generic.city-name', {
    civilization: city.originalPlayer.civilization._,
    name: city.name,
  });
};

// The action `action` stands for: what was asked for, if a Senate overrules it (#133), and otherwise itself.
const asked = (action: UnitAction): UnitAction =>
  action._ === 'Overruled' ? (action as OverruledAction).action : action;

export const nameOf = (action: UnitAction): string => asked(action)._;

// Sends `action` once the treaty is to be broken: an overruled one says so first, and is sent for the moves it spends.
const breakTreaty = (action: UnitAction, perform: Perform): void => {
  if (action._ !== 'Overruled') {
    perform(action);

    return;
  }

  new NotificationWindow(t('Senate.title'), t('Senate.overruled'));

  perform(action);
};

export const goldOf = (player: Player): number =>
  player.treasuries?.find((treasury) => treasury.yield._ === 'Gold')?.value ??
  0;

const confirmSneak = (action: UnitAction, perform: Perform): void => {
  const { _: name, enemy } = asked(action) as EnemyAction;

  new ConfirmationWindow(
    t('SneakAttack.title'),
    ['SneakStealTechnology', 'SneakInciteRevolt'].includes(name)
      ? t('Diplomat.peace-treaty', {
          nation: civilization(enemy, 'plural'),
        })
      : t('SneakAttack.body', {
          nation: t(`${enemy.civilization._}.nation`, {
            defaultValue: enemy.civilization._,
            ns: 'civilization',
          }),
        }),
    () => breakTreaty(action, perform),
    ['SneakStealTechnology', 'SneakInciteRevolt'].includes(name)
      ? {
          okLabel: 'Diplomat.break-treaty',
          cancelLabel: 'Diplomat.cancel-action',
        }
      : {}
  );
};

// "We have signed a peace treaty with the Babylonians! Cancel action. Break treaty." (v474.05 `F0_29f3_0c9e`): moving
//  onto, or pillaging, a treaty partner's land (#287). The player must choose: Cancel sends the tile's `AbortMove`,
//  which spends the move's cost as Civ1 does, if there is one. Escape is Cancel (#659).
const treatyWindow = (
  action: UnitAction,
  actionsOnTile: UnitAction[],
  perform: Perform
): ActionWindow => {
  const { enemy } = asked(action) as EnemyAction,
    abort = actionsOnTile.find((tileAction) => tileAction._ === 'AbortMove');

  return new ActionWindow(
    t('Treaty.title'),
    t('Diplomat.peace-treaty', { nation: civilization(enemy, 'plural') }),
    {
      canClose: false,
      actions: {
        primary: {
          label: t('Diplomat.cancel-action'),
          cancel: true,
          action: (window) => {
            window.close();

            if (abort) {
              perform(abort);
            }
          },
        },
        break: {
          label: t('Diplomat.break-treaty'),
          action: (window) => {
            window.close();

            breakTreaty(action, perform);
          },
        },
      },
    }
  );
};

// "Dissidents in Babylon will revolt for 900 coins.": Forget it, Incite revolt if it's affordable, and Subvert city
//  for double if that's offered and affordable (v474.05 `F22_0000_0af5`).
const inciteWindow = (
  actionsOnTile: UnitAction[],
  gold: number,
  perform: Perform
): void => {
  const [incite] = actionsOnTile.filter((action) =>
      ['InciteRevolt', 'SneakInciteRevolt'].includes(nameOf(action))
    ),
    [subvert] = actionsOnTile.filter(
      (action) => action._ === 'SubvertCity'
    ) as CostedAction[],
    { cost } = (incite ? asked(incite) : subvert) as CostedAction,
    city = cityName(incite ?? subvert);

  new ActionWindow(
    t('Diplomat.incite.title'),
    t('Diplomat.incite.body', { city, cost }),
    {
      actions: {
        primary: {
          label: t('Diplomat.incite.forget'),
          action: (window) => window.close(),
        },
        ...(incite && gold >= cost
          ? {
              incite: {
                label: t('Diplomat.incite.incite'),
                action: (window) => {
                  window.close();

                  nameOf(incite) === 'SneakInciteRevolt'
                    ? confirmSneak(incite, perform)
                    : perform(incite);
                },
              },
            }
          : {}),
        ...(subvert && gold >= subvert.cost
          ? {
              subvert: {
                label: t('Diplomat.incite.subvert', { cost: subvert.cost }),
                action: (window) => {
                  window.close();

                  perform(subvert);
                },
              },
            }
          : {}),
      },
    }
  );
};

// "Babylonian Chariot will desert for 120 coins. Our treasury currently contains 300 coins." (v474.05
//  `F22_0000_0639`).
const bribeWindow = (
  action: CostedAction,
  gold: number,
  perform: Perform
): void => {
  const [target] = action.to.units;

  new ActionWindow(
    t('Diplomat.bribe.title'),
    t('Diplomat.bribe.body', {
      nation: target ? civilization(target.player, 'name') : '',
      unit: target
        ? t(`${target._}.name`, { defaultValue: target._, ns: 'unit' })
        : '',
      cost: action.cost,
      gold,
    }),
    {
      actions: {
        primary: {
          label: t('Diplomat.cancel-action'),
          action: (window) => window.close(),
        },
        ...(gold >= action.cost
          ? {
              bribe: {
                label: t('Diplomat.bribe.bribe'),
                action: (window) => {
                  window.close();

                  perform(action);
                },
              },
            }
          : {}),
      },
    }
  );
};

/**
 * Sends `action`, after whatever window it needs: a confirmation for anything that would break a peace treaty, the
 * incite window for inciting or subverting, the bribe window for a bribe. `actionsOnTile` are all the unit's actions
 * for the same tile, which the incite window needs to offer subverting.
 */
export const performWithPrompts = (
  unit: UnitData,
  action: UnitAction,
  actionsOnTile: UnitAction[],
  perform: Perform
): void => {
  const name = nameOf(action);

  // Read only for the windows that offer a price: the own-tile keys come through here too (#287).
  if (inciteActions.includes(name)) {
    inciteWindow(actionsOnTile, goldOf(unit.player), perform);

    return;
  }

  if (action._ === 'BribeUnit') {
    bribeWindow(action as CostedAction, goldOf(unit.player), perform);

    return;
  }

  if (treatyActions.includes(name)) {
    treatyWindow(action, actionsOnTile, perform);

    return;
  }

  if (sneakActions.includes(name)) {
    confirmSneak(action, perform);

    return;
  }

  perform(action);
};

/**
 * The window a unit arriving at a tile chooses from, if it gets one: a Diplomat arriving at a rival city chooses what
 * to do there (#58), a Caravan entering one of your cities chooses whether to stop (#57), a unit next to a treaty
 * partner's land chooses whether to break the treaty (#287). Returns the window, or `null` when there is no choice to
 * offer, without performing anything.
 */
export const openArrivalWindow = (
  unit: UnitData,
  actionsOnTile: UnitAction[],
  perform: Perform
): Window | null => {
  const treaty = actionsOnTile.find((action) => nameOf(action) === 'SneakMove');

  if (treaty) {
    return treatyWindow(treaty, actionsOnTile, perform);
  }

  const move = actionsOnTile.find((action) => action._ === 'Move'),
    caravan = actionsOnTile.filter((action) =>
      caravanActions.includes(action._)
    ),
    diplomat = diplomatOptions.filter(([, names]) =>
      actionsOnTile.some((action) => names.includes(nameOf(action)))
    );

  if (diplomat.length > 0) {
    return openChoice(
      t('Diplomat.arrives', {
        nation: civilization(unit.player, 'name'),
        city: cityName(
          actionsOnTile.find((action) =>
            diplomat[0][1].includes(nameOf(action))
          )!
        ),
      }),
      diplomat.map(([option]) => ({
        label: t(`Diplomat.${option}`),
        value: option,
        // The button says what the Diplomat will do.
        primary: t(`Diplomat.${option}`),
      })),
      (choice) => {
        const [, names] = diplomat.find(([option]) => option === choice)!,
          action = actionsOnTile.find((action) =>
            names.includes(nameOf(action))
          )!;

        performWithPrompts(unit, action, actionsOnTile, perform);
      }
    );
  }

  if (caravan.length > 0 && move) {
    return openChoice(
      t('TradeRoute.will-you'),
      [move, ...caravan].map((action) => {
        const label =
          action === move
            ? t('TradeRoute.keep-moving')
            : t(`Action.${action._}.name`, {
                defaultValue: action._,
                ns: 'unit',
              });

        // The button says what the Caravan will do.
        return { label, value: action._, primary: label };
      }),
      (choice) =>
        perform([move, ...caravan].find((action) => action._ === choice)!)
    );
  }

  return null;
};

/**
 * What the arrow keys do with the actions for the tile a unit moves towards: the arrival window if there is one
 * (`openArrivalWindow`), and otherwise the first action, through `performWithPrompts`.
 */
export const chooseUnitAction = (
  unit: UnitData,
  actionsOnTile: UnitAction[],
  perform: Perform
): void => {
  const [first] = actionsOnTile;

  if (openArrivalWindow(unit, actionsOnTile, perform) !== null) {
    return;
  }

  if (first) {
    performWithPrompts(unit, first, actionsOnTile, perform);
  }
};
