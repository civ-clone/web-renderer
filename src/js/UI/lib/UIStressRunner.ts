import {
  City as CityData,
  GameData,
  PlayerAction,
  Unit,
  UnitAction,
} from '../types';
import City from '../components/City';
import CityStatus from '../components/CityStatus';
import HappinessReport from '../components/HappinessReport';
import Portal from '../components/Portal';
import ScienceReport from '../components/ScienceReport';
import TradeReport from '../components/TradeReport';
import Transport from '../Transport';

interface WindowLike {
  close(): void;
}

export type UIStressRunnerOptions = {
  choiceDelayMs?: number;
  enableWindows?: boolean;
  getData: () => GameData | null;
  intervalMs?: number;
  portal: Portal;
  screenDurationMs?: number;
  setActiveUnit: (unit: Unit | null) => void;
  toggleViewModes: (() => void)[];
  transport: Transport;
};

const preferredUnitActionOrder = [
  'BuildRoad',
  'BuildRailroad',
  'BuildIrrigation',
  'BuildMine',
  'PlantForest',
  'ClearForest',
  'ClearSwamp',
  'ClearJungle',
  'Fortify',
  'BuildFortress',
  'NoOrders',
  'Wait',
  'Sleep',
  'Unload',
  'Move',
];

const blockedUnitActions = new Set([
  'SneakAttack',
  'SneakCaptureCity',
  'Attack',
  'CaptureCity',
]);

export class UIStressRunner {
  #choiceDelayMs: number;
  #enableWindows: boolean;
  #automatingChoiceIds = new Set<string>();
  #getData: UIStressRunnerOptions['getData'];
  #interval: number;
  #openedWindows = new Set<WindowLike>();
  #portal: Portal;
  #screenDurationMs: number;
  #setActiveUnit: UIStressRunnerOptions['setActiveUnit'];
  #tick: number = 0;
  #timeouts = new Set<number>();
  #toggleViewModes: UIStressRunnerOptions['toggleViewModes'];
  #transport: Transport;

  constructor({
    choiceDelayMs = 250,
    enableWindows = true,
    getData,
    intervalMs = 1200,
    portal,
    screenDurationMs = 900,
    setActiveUnit,
    toggleViewModes,
    transport,
  }: UIStressRunnerOptions) {
    this.#choiceDelayMs = choiceDelayMs;
    this.#enableWindows = enableWindows;
    this.#getData = getData;
    this.#portal = portal;
    this.#screenDurationMs = screenDurationMs;
    this.#setActiveUnit = setActiveUnit;
    this.#toggleViewModes = toggleViewModes;
    this.#transport = transport;

    this.#interval = window.setInterval(() => this.tick(), intervalMs);
  }

  stop(): void {
    window.clearInterval(this.#interval);

    this.#timeouts.forEach((timeout) => window.clearTimeout(timeout));
    this.#timeouts.clear();

    this.closeWindows();
  }

  setWindowsEnabled(enabled: boolean): void {
    this.#enableWindows = enabled;

    if (!enabled) {
      this.closeWindows();
    }
  }

  automateChoice(
    selectionWindow: WindowLike,
    choiceId: string,
    onChoose: (choiceId: string) => void
  ): void {
    this.#automatingChoiceIds.add(choiceId);

    this.setTimeout(() => {
      onChoose(choiceId);
      selectionWindow.close();
      this.#automatingChoiceIds.delete(choiceId);
    }, this.#choiceDelayMs);
  }

  isAutomatingChoice(choiceId: string): boolean {
    return this.#automatingChoiceIds.has(choiceId);
  }

  getDebugState(): {
    automatingChoiceCount: number;
    enableWindows: boolean;
    openWindowCount: number;
    tick: number;
    timeoutCount: number;
  } {
    return {
      automatingChoiceCount: this.#automatingChoiceIds.size,
      enableWindows: this.#enableWindows,
      openWindowCount: this.#openedWindows.size,
      tick: this.#tick,
      timeoutCount: this.#timeouts.size,
    };
  }

  private chooseBuild(action: PlayerAction, turn: number): boolean {
    const cityBuild = action.value as CityData['build'];

    if (!cityBuild.available.length) {
      return false;
    }

    const buildItem = cityBuild.available[turn % cityBuild.available.length];

    this.#transport.send('action', {
      name: cityBuild.building === null ? 'CityBuild' : 'ChangeProduction',
      id: cityBuild.id,
      chosen: buildItem.item._,
    });

    return true;
  }

  private chooseResearch(action: PlayerAction, turn: number): boolean {
    const playerResearch = action.value as GameData['player']['research'];

    if (!playerResearch.available.length) {
      return false;
    }

    const advance =
      playerResearch.available[turn % playerResearch.available.length];

    this.#transport.send('action', {
      name: 'ChooseResearch',
      id: playerResearch.id,
      chosen: advance._,
    });

    return true;
  }

  private chooseRevolution(action: PlayerAction, turn: number): boolean {
    const playerGovernment = action.value as GameData['player']['government'];

    if (!playerGovernment.available.length) {
      return false;
    }

    const government =
      playerGovernment.available[turn % playerGovernment.available.length];

    this.#transport.send('action', {
      name: 'Revolution',
      id: playerGovernment.id,
      chosen: government._,
    });

    return true;
  }

  private safeClose(windowLike: WindowLike): void {
    try {
      windowLike.close();
    } catch (error) {
      console.warn('UI stress harness failed to close window', error);
    }
  }

  private closeWindows(): void {
    this.#openedWindows.forEach((windowLike) => this.safeClose(windowLike));
    this.#openedWindows.clear();
  }

  private focusLocation(data: GameData): void {
    const units = data.player.actions
      .filter((action) => action._ === 'ActiveUnit')
      .map((action) => action.value as Unit);

    if (units.length) {
      const unit = units[this.#tick % units.length];

      this.#setActiveUnit(unit);
      this.#portal.setCenter(unit.tile.x, unit.tile.y);

      return;
    }

    if (data.player.cities.length) {
      const city = data.player.cities[this.#tick % data.player.cities.length];

      this.#portal.setCenter(city.tile.x, city.tile.y);
    }
  }

  private launchSpaceship(action: PlayerAction): boolean {
    const spaceship = action.value as GameData['player']['spaceship'];

    if (spaceship === null) {
      return false;
    }

    this.#transport.send('action', {
      name: 'LaunchSpaceship',
      id: spaceship.id,
    });

    return true;
  }

  private openWindow(data: GameData): void {
    this.closeWindows();

    const factories: (() => WindowLike | null)[] = [
      () => new ScienceReport(data.player),
      () => new CityStatus(data.player, this.#portal, this.#transport),
      () => new HappinessReport(data.player, this.#portal, this.#transport),
      () => new TradeReport(data.player, this.#portal, this.#transport),
      () => {
        if (!data.player.cities.length) {
          return null;
        }

        const city = data.player.cities[this.#tick % data.player.cities.length];

        return new City(city, this.#portal, this.#transport);
      },
    ];

    const factory = factories[this.#tick % factories.length],
      windowLike = factory();

    if (!windowLike) {
      return;
    }

    this.#openedWindows.add(windowLike);

    this.setTimeout(() => {
      this.safeClose(windowLike);
      this.#openedWindows.delete(windowLike);
    }, this.#screenDurationMs);
  }

  private performAction(data: GameData): void {
    const { player } = data,
      turn = Number(data.turn.value ?? 0),
      chooseResearchAction = player.actions.find(
        (action) => action._ === 'ChooseResearch'
      );

    if (
      chooseResearchAction &&
      this.chooseResearch(chooseResearchAction, turn)
    ) {
      return;
    }

    const revolutionAction = player.actions.find(
      (action) => action._ === 'Revolution'
    );

    if (revolutionAction && this.chooseRevolution(revolutionAction, turn)) {
      return;
    }

    const cityBuildAction = player.actions.find((action) =>
      ['CityBuild', 'ChangeProduction'].includes(action._)
    );

    if (cityBuildAction && this.chooseBuild(cityBuildAction, turn)) {
      return;
    }

    const completeProductionAction = player.actions.find(
      (action) => action._ === 'CompleteProduction'
    );

    if (completeProductionAction && player.treasuries.length) {
      this.#transport.send('action', {
        name: 'CompleteProduction',
        id: completeProductionAction.id,
        treasury: player.treasuries[0].id,
      });

      return;
    }

    const spaceshipAction = player.actions.find(
      (action) => action._ === 'LaunchSpaceship'
    );

    if (spaceshipAction && this.launchSpaceship(spaceshipAction)) {
      return;
    }

    const activeUnitActions = player.actions.filter(
      (action) => action._ === 'ActiveUnit'
    );

    if (activeUnitActions.length) {
      const activeUnit = activeUnitActions[turn % activeUnitActions.length]
          .value as Unit,
        unitAction = this.selectUnitAction(activeUnit);

      this.#setActiveUnit(activeUnit);

      if (unitAction) {
        this.#transport.send('action', {
          name: 'ActiveUnit',
          id: activeUnit.id,
          unitAction: unitAction._,
          target: unitAction.to.id,
        });

        return;
      }
    }

    const inactiveUnitAction = player.actions.find(
      (action) => action._ === 'InactiveUnit'
    );

    if (inactiveUnitAction) {
      this.#transport.send('action', {
        name: 'InactiveUnit',
        id: inactiveUnitAction.id,
      });

      return;
    }

    if (
      player.actions.some((action) => action._ === 'EndTurn') ||
      player.mandatoryActions.some((action) => action._ === 'EndTurn')
    ) {
      this.#transport.send('action', {
        name: 'EndTurn',
      });
    }
  }

  private selectUnitAction(unit: Unit): UnitAction | null {
    const candidates = [
      ...Object.values(unit.actionsForNeighbours).flat(),
      ...unit.actions,
    ]
      .filter(
        (action): action is UnitAction =>
          !!action && !!action.to && !blockedUnitActions.has(action._)
      )
      .sort((a, b) => {
        const actionDelta =
          this.unitActionPriority(a._) - this.unitActionPriority(b._);

        if (actionDelta !== 0) {
          return actionDelta;
        }

        if (a.to.x !== b.to.x) {
          return a.to.x - b.to.x;
        }

        if (a.to.y !== b.to.y) {
          return a.to.y - b.to.y;
        }

        return a.id.localeCompare(b.id);
      });

    return candidates[0] ?? null;
  }

  private setTimeout(handler: () => void, timeout: number): void {
    const reference = window.setTimeout(() => {
      this.#timeouts.delete(reference);
      handler();
    }, timeout);

    this.#timeouts.add(reference);
  }

  private tick(): void {
    const data = this.#getData();

    if (!data) {
      return;
    }

    this.#tick++;

    this.focusLocation(data);

    if (this.#toggleViewModes.length) {
      const toggle =
        this.#toggleViewModes[this.#tick % this.#toggleViewModes.length];

      toggle?.();
    }

    if (this.#enableWindows && this.#tick % 2 === 0) {
      this.openWindow(data);
    }

    this.performAction(data);
  }

  private unitActionPriority(actionName: string): number {
    const index = preferredUnitActionOrder.indexOf(actionName);

    return index === -1 ? preferredUnitActionOrder.length : index;
  }
}

export default UIStressRunner;
