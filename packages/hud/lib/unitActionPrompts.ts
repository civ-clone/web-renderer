import {
  Player,
  Unit as UnitData,
  UnitAction,
} from '@civ-clone/ui-protocol/types';
import ActionWindow from '@civ-clone/ui-component-window/ActionWindow';
import ConfirmationWindow from '@civ-clone/ui-component-window/ConfirmationWindow';
import NotificationWindow from '@civ-clone/ui-component-window/NotificationWindow';
import { ChoiceList, openChoice } from '../components/choiceList';
import Window from '@civ-clone/ui-component-window/Window';
import { t } from 'i18next';

// The windows a unit action can need before it's sent: a sneak attack's confirmation, an attack with part of a move
//  left, a treaty partner's land (#287), a Caravan's "Will you?" (#57), a Diplomat's arrival, incite and bribe windows
//  (#58), and a Spy's choice of what to steal or sabotage (Civ2, M2d part 2). Shared by the arrow keys and the unit
//  action menu.

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
    // Civ2's sabotage and poisoning under a treaty, confirmed as a theft is (M2d part 2).
    'SneakIndustrialSabotage',
    'SneakPoisonWater',
    // Civ2's attack on a player met and not at war with, offered only as what an `Overruled` stands for (#1007).
    'UndeclaredAttack',
    'UndeclaredNuclearAttack',
  ],
  undeclaredActions = ['UndeclaredAttack', 'UndeclaredNuclearAttack'],
  // Onto, or pillaging, a treaty partner's land (#287).
  treatyActions = ['SneakMove', 'SneakPillage'],
  caravanActions = ['EstablishTradeRoute', 'HelpBuildWonder'],
  // The attacks the engine makes at the strength of the moves left, at most one (`base-unit-action-attack`'s `Attack`,
  //  which `SneakAttack` extends). A nuclear attack isn't weakened, so it doesn't ask.
  attackActions = ['Attack', 'SneakAttack'],
  inciteActions = ['InciteRevolt', 'SneakInciteRevolt', 'SubvertCity'],
  // A Diplomat's missions that break a treaty, which ask with Civ1's words and buttons.
  missionSneakActions = [
    'SneakStealTechnology',
    'SneakInciteRevolt',
    'SneakIndustrialSabotage',
    'SneakPoisonWater',
  ],
  // The missions whose `targets` a Spy chooses from (Civ2, M2d part 2), and what each target is: an advance, or a
  //  building (or `production`). Performed with no choice, each takes one at random, as the engine does without one.
  missionTargetKinds: { [action: string]: 'advance' | 'building' } = {
    StealTechnology: 'advance',
    SneakStealTechnology: 'advance',
    IndustrialSabotage: 'building',
    SneakIndustrialSabotage: 'building',
  },
  // A Spy's arrival beside another player's unit (M2b): Civ2's missions against a unit, each standing for its action.
  unitMissionOptions: [string, string][] = [
    ['bribe-unit', 'BribeUnit'],
    ['sabotage-unit', 'SabotageUnit'],
  ],
  // The Diplomat's arrival popup, in Civ1's order, each option standing for the actions that do it.
  diplomatOptions: [string, string[]][] = [
    ['establish-embassy', ['EstablishEmbassy']],
    ['investigate-city', ['InvestigateCity']],
    ['steal-technology', ['StealTechnology', 'SneakStealTechnology']],
    ['industrial-sabotage', ['IndustrialSabotage', 'SneakIndustrialSabotage']],
    // A Spy's, under Civ2's rules (M2d part 2).
    ['poison-water', ['PoisonWater', 'SneakPoisonWater']],
    ['plant-nuclear-device', ['PlantNuclearDevice']],
    ['incite-revolt', inciteActions],
    ['meet-with-leader', ['MeetWithLeader']],
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

// What the rules say a mission does to a treaty (Civ2's `consequence`, M2d part 2), or `null` where they don't say.
const consequenceOf = (action: UnitAction): string | null =>
  asked(action).consequence ?? null;

const confirmSneak = (action: UnitAction, perform: Perform): void => {
  const { _: name, enemy } = asked(action) as EnemyAction;

  // A mission the rules say breaks nothing unless its agent is lost (Civ2's), asked in those words.
  if (consequenceOf(action) === 'incident-if-lost') {
    const confirmation: ConfirmationWindow = new ConfirmationWindow(
      t('Diplomat.treaty-mission.title'),
      t('Diplomat.treaty-mission.body', {
        nation: civilization(enemy, 'plural'),
      }),
      () => {
        confirmation.close();

        perform(action);
      },
      {
        okLabel: 'Diplomat.treaty-mission.go-ahead',
        cancelLabel: 'Diplomat.cancel-action',
      }
    );

    return;
  }

  // Closed before the treaty is broken: breaking it can open the part-of-a-move question, and closing this window after
  //  that would take the focus back from it, so a second Enter dismissed it without attacking.
  const confirmation: ConfirmationWindow = new ConfirmationWindow(
    t(
      undeclaredActions.includes(name)
        ? 'UndeclaredAttack.title'
        : 'SneakAttack.title'
    ),
    undeclaredActions.includes(name)
      ? t('UndeclaredAttack.body', {
          nation: t(`${enemy.civilization._}.nation`, {
            defaultValue: enemy.civilization._,
            ns: 'civilization',
          }),
        })
      : missionSneakActions.includes(name)
      ? t('Diplomat.peace-treaty', {
          nation: civilization(enemy, 'plural'),
        })
      : t('SneakAttack.body', {
          nation: t(`${enemy.civilization._}.nation`, {
            defaultValue: enemy.civilization._,
            ns: 'civilization',
          }),
        }),
    () => {
      confirmation.close();

      breakTreaty(action, perform);
    },
    missionSneakActions.includes(name)
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
    // Asked with one or the other, as `cost` is.
    city = cityName((incite ?? subvert)!);

  // What inciting at each price does to a treaty, where the rules say (Civ2's, M2d part 2).
  const consequences = [incite, subvert]
    .map((action) => (action ? consequenceOf(action) : null))
    .filter((consequence): consequence is string => consequence !== null)
    .map((consequence) => t(`Diplomat.incite.${consequence}`));

  new ActionWindow(
    t('Diplomat.incite.title'),
    [t('Diplomat.incite.body', { city, cost }), ...consequences].join(' '),
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

// Sends an attack with less than a full move left only once the player says so, as Civ1 and Civ2 ask: the engine
//  scales the attack by the moves left. Anything else, and an `Overruled` sneak attack (which attacks nobody), is
//  sent as it is. A GoTo never attacks (it stops short, #357), so only an order the player gives comes through here.
// Within a rounding error of a full move counts as one: moves are kept as fractions such as thirds.
const confirmPartialMove =
  (unit: UnitData, perform: Perform): Perform =>
  (chosen: UnitAction): void => {
    if (!attackActions.includes(chosen._) || unit.moves.value >= 1 - 1e-9) {
      perform(chosen);

      return;
    }

    new ConfirmationWindow(
      t('PartialMoveAttack.title'),
      t('PartialMoveAttack.body', {
        unit: t(`${unit._}.name`, { defaultValue: unit._, ns: 'unit' }),
      }),
      () => perform(chosen),
      { okLabel: 'PartialMoveAttack.attack' }
    );
  };

// Sends an action that offers a choice (its `targets`, such as what a Pillage takes, M2b) with the player's, asked when
//  there's more than one. With one or none it is sent as it is, and the engine takes what there is, as it does for an
//  action that offers no choice or one asked for in another's place (`Overruled`).
// The row that leaves the target to chance: never a type name.
const randomTarget = '(random)';

// What a mission's target is called: an advance, a building, or what the city is building.
const missionTargetLabel = (kind: 'advance' | 'building', target: string) =>
  kind === 'advance'
    ? t(`${target}.name`, { defaultValue: target, ns: 'science' })
    : target === 'production'
    ? t('Spy.target.production')
    : t(`Improvement.${target}.name`, { defaultValue: target, ns: 'city' });

const chooseTarget =
  (perform: Perform): Perform =>
  (chosen: UnitAction): void => {
    const targets = chosen.targets ?? [],
      kind = missionTargetKinds[chosen._];

    // A Spy's theft or sabotage (Civ2): whatever there is to aim at, or one at random, which the engine takes without a
    //  choice. Asked even with one target, as a chosen target and a random one are run differently (the original
    //  asks first whether to choose at all).
    if (kind && targets.length > 0) {
      openChoice(
        t('ChooseTarget.title', {
          action: t(`Action.${chosen._}.name`, {
            defaultValue: chosen._,
            ns: 'unit',
          }),
        }),
        [
          { label: t('Spy.target.random'), value: randomTarget },
          ...targets.map((target) => ({
            label: missionTargetLabel(kind, target),
            value: target,
          })),
        ],
        (choice) =>
          perform(choice === randomTarget ? chosen : { ...chosen, choice }),
        { canClose: true }
      );

      return;
    }

    if (targets.length < 2) {
      perform(chosen);

      return;
    }

    openChoice(
      t('ChooseTarget.title', {
        action: t(`Action.${chosen._}.name`, {
          defaultValue: chosen._,
          ns: 'unit',
        }),
      }),
      targets.map((target) => ({
        label: t(`Improvement.${target}.name`, {
          defaultValue: target,
          ns: 'world',
        }),
        value: target,
      })),
      (choice) => perform({ ...chosen, choice }),
      { canClose: true }
    );
  };

/**
 * Sends `action`, after whatever window it needs: a confirmation for anything that would break a peace treaty, the
 * incite window for inciting or subverting, the bribe window for a bribe, and a confirmation for an attack with part of
 * a move left (after the treaty's, for a sneak attack). `actionsOnTile` are all the unit's actions
 * for the same tile, which the incite window needs to offer subverting.
 */
export const performWithPrompts = (
  unit: UnitData,
  action: UnitAction,
  actionsOnTile: UnitAction[],
  performAsIs: Perform
): void => {
  const name = nameOf(action),
    perform = confirmPartialMove(unit, chooseTarget(performAsIs));

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
): Window | ChoiceList | null => {
  const treaty = actionsOnTile.find((action) => nameOf(action) === 'SneakMove');

  if (treaty) {
    return treatyWindow(treaty, actionsOnTile, perform);
  }

  const move = actionsOnTile.find((action) => action._ === 'Move'),
    caravan = actionsOnTile.filter((action) =>
      caravanActions.includes(action._)
    ),
    missions = unitMissionOptions.filter(([, name]) =>
      actionsOnTile.some((action) => action._ === name)
    ),
    diplomat = diplomatOptions.filter(([, names]) =>
      actionsOnTile.some((action) => names.includes(nameOf(action)))
    );

  if (diplomat.length > 0) {
    return openChoice(
      t('Diplomat.arrives', {
        nation: civilization(unit.player, 'name'),
        // A Diplomat, or a Spy (Civ2).
        unit: t(`${unit._}.name`, { defaultValue: unit._, ns: 'unit' }),
        city: cityName(
          actionsOnTile.find((action) =>
            diplomat[0]![1].includes(nameOf(action))
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

  // A Spy beside a lone unit of another player (M2b), when it can sabotage it: what to do to it, or nothing. A bribe
  //  offered alone keeps its own window (`bribeWindow`), as before.
  if (missions.some(([, name]) => name === 'SabotageUnit')) {
    const [target] = actionsOnTile[0]!.to.units;

    return openChoice(
      t('Spy.arrives-unit', {
        nation: civilization(unit.player, 'name'),
        unit: t(`${unit._}.name`, { defaultValue: unit._, ns: 'unit' }),
        targetNation: target ? civilization(target.player, 'name') : '',
        target: target
          ? t(`${target._}.name`, { defaultValue: target._, ns: 'unit' })
          : '',
      }),
      missions.map(([option]) => ({
        label: t(`Spy.${option}`),
        value: option,
        // The button says what the Spy will do.
        primary: t(`Spy.${option}`),
      })),
      (choice) => {
        const [, name] = missions.find(([option]) => option === choice)!,
          action = actionsOnTile.find((action) => action._ === name)!;

        performWithPrompts(unit, action, actionsOnTile, perform);
      },
      { canClose: true }
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
