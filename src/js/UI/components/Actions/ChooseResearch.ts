import { Player, PlayerAction, PlayerResearch } from '../../types';
import Action from './Action';
import SelectionWindow from '../SelectionWindow';
import Transport from '../../Transport';
import { assetStore } from '../../AssetStore';
import { combinedYields } from '../lib/playerYields';
import { s } from '@dom111/element';
import { t } from 'i18next';
import { turnsLeft } from '../lib/cityYields';

export class ChooseResearch extends Action {
  #player: Player | null;

  constructor(
    action: PlayerAction,
    transport: Transport,
    player: Player | null = null
  ) {
    super(action, transport);

    this.#player = player;
  }

  activate(): void {
    const playerResearch = this.value(),
      yields = this.#player ? combinedYields(this.#player) : null,
      label = (advance: string): string => {
        const name = t(`${advance}.name`, {
            defaultValue: advance,
            ns: 'science',
          }),
          cost = playerResearch.costs?.[advance];

        if (yields === null || cost === undefined) {
          return name;
        }

        return t('Actions.ChooseResearch.choice', {
          advance: name,
          turns: turnsLeft(
            {
              ...playerResearch,
              cost: {
                ...playerResearch.cost,
                value: cost,
              },
            },
            yields,
            'Research'
          ),
        });
      };

    const chooseWindow = new SelectionWindow(
      t('Actions.ChooseResearch.title'),
      playerResearch.available.map((advance) => ({
        label: label(advance._),
        value: advance._,
      })),
      (selection) => {
        if (!selection) {
          return;
        }

        this.transport().send('action', {
          name: 'ChooseResearch',
          id: this.value().id,
          chosen: selection ? selection : '@',
        });

        this.complete();

        chooseWindow.close();
      },
      t('Actions.ChooseResearch.body'),
      {
        displayAll: true,
      }
    );
  }

  build(): void {
    assetStore
      .get('./assets/city/bulb.png')
      .then((asset) =>
        this.append(
          s(
            `<button class="large chooseResearch" title="${t(
              'Actions.ChooseResearch.title'
            )}"><img src="${asset!.uri}"></button>`
          )
        )
      );
  }

  value(): PlayerResearch {
    return super.value() as PlayerResearch;
  }
}

export default ChooseResearch;
