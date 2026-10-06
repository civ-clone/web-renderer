import { Player, Unit as UnitData, UnitAction } from '../types';
import ActionWindow from '../components/ActionWindow';
import ConfirmationWindow from '../components/ConfirmationWindow';
import SelectionWindow from '../components/SelectionWindow';
import { t } from 'i18next';

// The windows a unit action can need before it's sent: a sneak attack's confirmation, a Caravan's "Will you?" (#57),
//  a Diplomat's arrival, incite and bribe windows (#58). Shared by the arrow keys and the unit action menu.

type Perform = (action: UnitAction) => void;

export type CostedAction = UnitAction & { cost: number };

export type EnemyAction = UnitAction & { enemy: Player };

const sneakActions = [
    'SneakAttack',
    'SneakCaptureCity',
    'SneakStealTechnology',
    'SneakInciteRevolt',
  ],
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

export const goldOf = (player: Player): number =>
  player.treasuries?.find((treasury) => treasury.yield._ === 'Gold')?.value ??
  0;

const confirmSneak = (action: EnemyAction, perform: Perform): void => {
  new ConfirmationWindow(
    t('SneakAttack.title'),
    ['SneakStealTechnology', 'SneakInciteRevolt'].includes(action._)
      ? t('Diplomat.peace-treaty', {
          nation: civilization(action.enemy, 'plural'),
        })
      : t('SneakAttack.body', {
          nation: t(`${action.enemy.civilization._}.nation`, {
            defaultValue: action.enemy.civilization._,
            ns: 'civilization',
          }),
        }),
    () => perform(action),
    ['SneakStealTechnology', 'SneakInciteRevolt'].includes(action._)
      ? {
          okLabel: 'Diplomat.break-treaty',
          cancelLabel: 'Diplomat.cancel-action',
        }
      : {}
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
      ['InciteRevolt', 'SneakInciteRevolt'].includes(action._)
    ) as CostedAction[],
    [subvert] = actionsOnTile.filter(
      (action) => action._ === 'SubvertCity'
    ) as CostedAction[],
    { cost } = incite ?? subvert,
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
        ...(incite && gold >= incite.cost
          ? {
              incite: {
                label: t('Diplomat.incite.incite'),
                action: (window) => {
                  window.close();

                  incite._ === 'SneakInciteRevolt'
                    ? confirmSneak(incite as unknown as EnemyAction, perform)
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
  const gold = goldOf(unit.player);

  if (inciteActions.includes(action._)) {
    inciteWindow(actionsOnTile, gold, perform);

    return;
  }

  if (action._ === 'BribeUnit') {
    bribeWindow(action as CostedAction, gold, perform);

    return;
  }

  if (sneakActions.includes(action._)) {
    confirmSneak(action as EnemyAction, perform);

    return;
  }

  perform(action);
};

/**
 * What the arrow keys do with the actions for the tile a unit moves towards: a Diplomat arriving at a rival city
 * chooses what to do there (#58), a Caravan entering one of your cities chooses whether to stop (#57), and anything
 * else takes the first action, through `performWithPrompts`.
 */
export const chooseUnitAction = (
  unit: UnitData,
  actionsOnTile: UnitAction[],
  perform: Perform
): void => {
  const [first] = actionsOnTile,
    move = actionsOnTile.find((action) => action._ === 'Move'),
    caravan = actionsOnTile.filter((action) =>
      caravanActions.includes(action._)
    ),
    diplomat = diplomatOptions.filter(([, names]) =>
      actionsOnTile.some((action) => names.includes(action._))
    );

  if (diplomat.length > 0) {
    new SelectionWindow(
      t('Diplomat.arrives', {
        nation: civilization(unit.player, 'name'),
        city: cityName(
          actionsOnTile.find((action) => diplomat[0][1].includes(action._))!
        ),
      }),
      diplomat.map(([option]) => ({
        label: t(`Diplomat.${option}`),
        value: option,
      })),
      (choice) => {
        const [, names] = diplomat.find(([option]) => option === choice)!,
          action = actionsOnTile.find((action) => names.includes(action._))!;

        performWithPrompts(unit, action, actionsOnTile, perform);
      },
      null,
      {
        displayAll: true,
      }
    );

    return;
  }

  if (caravan.length > 0 && move) {
    new SelectionWindow(
      t('TradeRoute.will-you'),
      [move, ...caravan].map((action) => ({
        label:
          action === move
            ? t('TradeRoute.keep-moving')
            : t(`Action.${action._}.name`, {
                defaultValue: action._,
                ns: 'unit',
              }),
        value: action._,
      })),
      (choice) =>
        perform([move, ...caravan].find((action) => action._ === choice)!),
      null,
      {
        displayAll: true,
      }
    );

    return;
  }

  if (first) {
    performWithPrompts(unit, first, actionsOnTile, perform);
  }
};
