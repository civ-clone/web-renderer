import { Player, PlayerAction, PlayerResearch } from '../../types';
import Action from './Action';
import SelectionWindow from '../SelectionWindow';
import Transport from '../../Transport';
import { assetStore } from '../../AssetStore';
import { combinedYields } from '../lib/playerYields';
import { advanceName, held, researchClearedLabel } from '../lib/advances';
import { s } from '@dom111/element';
import { t } from 'i18next';
import { turnsLeft } from '../lib/cityYields';
import currentTileset from '../../lib/tilesets';
import { spriteKey } from '../../tilesets/TilesetDescriptor';

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
        const name = advanceName(advance, held(playerResearch, advance) + 1),
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
          chosen: selection,
        });

        this.complete();

        chooseWindow.close();
      },
      // What was just researched, when that's why it has opened (#726), above the question.
      (() => {
        const body = s('<div></div>'),
          cleared = researchClearedLabel(playerResearch),
          question = s('<p></p>');

        if (cleared !== null) {
          const reason = s('<p class="research-cleared"></p>');

          reason.textContent = cleared;
          body.append(reason);
        }

        question.textContent = t('Actions.ChooseResearch.body');
        body.append(question);

        return body;
      })(),
      {
        displayAll: true,
      }
    );
  }

  build(): void {
    assetStore
      .get(spriteKey(currentTileset(), 'city/bulb'))
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
