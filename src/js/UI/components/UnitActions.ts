import {
  IconLayer,
  drawUnitActionIcon,
  unitActionIconLayers,
} from '../lib/unitActionIcon';
import { Tile, Unit } from '../types';
import { Element, s } from '@dom111/element';
import { keyForAction } from '../lib/unitActionKeys';
import { t } from 'i18next';
import { unitActions } from '../lib/unitActions';

const keyName = (key: string): string => (key === ' ' ? 'Space' : key);

// The active unit's own-tile actions as picture buttons (#348), for finding what Explore, Automate and the Workers'
//  actions do without knowing the keys. A click asks for the action as the key would, through `act`: the active unit's
//  controller, which sends it and keeps the keys typed after it until it is answered (#543).
export class UnitActions extends Element {
  #act: (unitId: string, unitAction: string) => void;
  #draw: (canvas: HTMLCanvasElement, layers: IconLayer[]) => void;
  #signature = '';

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
                t(`Action.${action._}.icon`, {
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

    this.empty();

    if (unit === null) {
      return;
    }

    actions.forEach((action, index) => {
      const name = t(`Action.${action._}.name`, {
          defaultValue: action._,
          ns: 'unit',
        }),
        key = keyForAction(action._),
        button = s<HTMLButtonElement>(
          `<button type="button" class="unit-action ${action._}"><canvas width="16" height="16"></canvas></button>`
        ),
        label = key ? `${name} (${keyName(key)})` : name;

      button.title = label;
      button.setAttribute('aria-label', label);

      button.addEventListener('click', () => this.#act(unit.id, action._));

      this.element().append(button);

      // Once it is on the page, so the picture can be drawn at the size it is shown at.
      this.#draw(button.querySelector('canvas')!, layers[index]);
    });
  }
}

export default UnitActions;
