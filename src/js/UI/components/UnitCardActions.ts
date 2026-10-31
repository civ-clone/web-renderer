import {
  IconLayer,
  drawUnitActionIcon,
  unitActionIconLayers,
} from '../lib/unitActionIcon';
import { TOptions, t } from 'i18next';
import { Tile, Unit, UnitAction } from '../types';
import { Element, s } from '@dom111/element';
import tooltip, { hideTooltipWithin } from './lib/Tooltip';
import button from '../lib/button';
import { keyForAction } from '../lib/unitActionKeys';
import { nameOf, performWithPrompts } from '../lib/unitActionPrompts';
import { unitActions } from '../lib/unitActions';

// Every string here is set as text, not markup, so i18next's HTML escaping would show a name with `&` or `'` in it as
//  `&amp;` or `&#39;` (#704).
const text = (key: string, options: TOptions = {}): string =>
  t(key, { ...options, interpolation: { escapeValue: false } });

// As `aria-keyshortcuts` names a key, and as the tooltip shows it: a capital is typed with Shift (Disband, Pillage).
const keyName = (key: string): string =>
  key === ' ' ? 'Space' : /^[A-Z]$/.test(key) ? `Shift+${key}` : key;

export type ActionGroup = 'orders' | 'terrain' | 'special';

// Where each action is listed on the card: what the unit is told to do, what it does to the land, and the rest (founding
//  a city, a caravan's or a diplomat's errands). An action not named here is special.
const groupOf: { [name: string]: ActionGroup } = {
  Activate: 'orders',
  Automate: 'orders',
  Disband: 'orders',
  Disembark: 'orders',
  Embark: 'orders',
  Explore: 'orders',
  Fortify: 'orders',
  NoOrders: 'orders',
  SetHomeCity: 'orders',
  Sleep: 'orders',
  Unload: 'orders',
  BuildFortress: 'terrain',
  BuildIrrigation: 'terrain',
  BuildMine: 'terrain',
  BuildRailroad: 'terrain',
  BuildRoad: 'terrain',
  CleanPollution: 'terrain',
  ClearForest: 'terrain',
  ClearJungle: 'terrain',
  ClearSwamp: 'terrain',
  Pillage: 'terrain',
  PlantForest: 'terrain',
  SneakPillage: 'terrain',
};

export const actionGroup = (action: UnitAction): ActionGroup =>
  groupOf[nameOf(action)] ?? 'special';

const groups: ActionGroup[] = ['orders', 'terrain', 'special'];

/**
 * The active unit's actions inside its card, under the new interface (#743, #735): picture buttons as the strip at the
 *  bottom left draws them (#348), grouped under an eyebrow each, with the action's name and key in the tooltip. The
 *  engine sends only what the unit can do, so a group with nothing in it isn't shown. A click asks for the action as
 *  the key would, through `act`, the active unit's controller (#543).
 */
export class UnitCardActions extends Element {
  #act: (unitId: string, unitAction: string) => void;
  #draw: (canvas: HTMLCanvasElement, layers: IconLayer[]) => void;
  #signature = '';
  #unitId: string | null = null;

  constructor(
    container: HTMLElement,
    act: (unitId: string, unitAction: string) => void,
    draw: (
      canvas: HTMLCanvasElement,
      layers: IconLayer[]
    ) => void = drawUnitActionIcon
  ) {
    super(container);

    this.#act = act;
    this.#draw = draw;
  }

  /**
   * @param tile The unit's tile as the world holds it, for the city and the cargo on it.
   */
  build(unit: Unit | null, tile: Tile | null): void {
    const actions = unit ? unitActions(unit) : [],
      layers =
        unit === null
          ? []
          : actions.map((action) =>
              unitActionIconLayers(
                action,
                unit,
                tile,
                t(`Action.${nameOf(action)}.icon`, {
                  defaultValue: '',
                  ns: 'unit',
                })
              )
            ),
      // Rebuilt only when something it shows changed: this runs with every render.
      signature = JSON.stringify([
        unit?.id,
        unit?.player?.civilization?._,
        // The target too: a unit that moved keeps the same actions, aimed at its new tile.
        actions.map((action) => [action._, action.to?.id]),
        layers.map((actionLayers) =>
          actionLayers.map((layer) =>
            layer.type === 'unit'
              ? [layer.type, layer.unit._, layer.fortified, layer.status]
              : layer
          )
        ),
      ]);

    if (signature === this.#signature) {
      return;
    }

    this.#signature = signature;

    // A keyboard player who has just pressed one keeps their place: the same action again, or the first.
    //  Not for another unit: its first action could be Disband, under a key about to be pressed again.
    const focused =
      document.activeElement instanceof HTMLElement &&
      this.element().contains(document.activeElement) &&
      unit?.id === this.#unitId
        ? document.activeElement.dataset.action ?? null
        : null;

    hideTooltipWithin(this.element());
    this.empty();

    this.#unitId = unit?.id ?? null;

    if (unit === null) {
      return;
    }

    groups.forEach((group) => {
      const listed = actions
        .map((action, index) => ({ action, index }))
        .filter(({ action }) => actionGroup(action) === group);

      if (listed.length === 0) {
        return;
      }

      const buttons = s('<div class="ui-unit-card-buttons"></div>'),
        section = s(
          `<div class="ui-unit-card-group" data-group="${group}"><p class="ui-unit-card-eyebrow"></p></div>`,
          buttons
        );

      section.querySelector('.ui-unit-card-eyebrow')!.textContent = text(
        `UnitCard.group.${group}`
      );

      this.element().append(section);

      listed.forEach(({ action, index }) => {
        const name = text(`Action.${nameOf(action)}.name`, {
            defaultValue: nameOf(action),
            ns: 'unit',
          }),
          found = keyForAction(nameOf(action)),
          key = found === null ? null : keyName(found),
          actionButton = button('<canvas width="16" height="16"></canvas>', {
            variant: 'icon',
            hotkey: key,
            className: `ui-unit-card-action ${action._}`,
          });

        actionButton.setAttribute('aria-label', name);
        actionButton.dataset.action = action._;
        tooltip(actionButton, () => ({
          title: name,
          rows: key ? [[text('UnitCard.key'), key]] : [],
        }));

        // Through the same windows as the keys: pillaging a treaty partner's land asks first (#287).
        actionButton.addEventListener('click', () =>
          performWithPrompts(unit, action, actions, (chosen) =>
            this.#act(unit.id, chosen._)
          )
        );

        buttons.append(actionButton);

        // Once it is on the page, so the picture can be drawn at the size it is shown at.
        this.#draw(actionButton.querySelector('canvas')!, layers[index]);
      });
    });

    if (focused !== null) {
      (
        this.element().querySelector<HTMLElement>(
          `.ui-unit-card-action[data-action="${focused}"]`
        ) ?? this.element().querySelector<HTMLElement>('.ui-unit-card-action')
      )?.focus();
    }
  }
}

export default UnitCardActions;
