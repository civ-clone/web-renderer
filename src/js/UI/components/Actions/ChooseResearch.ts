import { Player, PlayerAction, PlayerResearch } from '../../types';
import Action from './Action';
import { ChoiceRow } from '../ChoiceWindow';
import Transport from '../../Transport';
import { assetStore } from '../../AssetStore';
import { combinedYields } from '../lib/playerYields';
import { advanceName, held, researchClearedLabel } from '../lib/advances';
import { s } from '@dom111/element';
import { t } from 'i18next';
import { turnsLeft, yieldIcon } from '../lib/cityYields';
import entryDetails from '../lib/choiceDetails';
import { instance as localeProvider } from '../../LocaleProvider';
import { openChoice } from '../choiceList';
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
      turns = (advance: string): number | null => {
        const cost = playerResearch.costs?.[advance];

        if (yields === null || cost === undefined) {
          return null;
        }

        return turnsLeft(
          {
            ...playerResearch,
            cost: {
              ...playerResearch.cost,
              value: cost,
            },
          },
          yields,
          'Research'
        );
      },
      rows: ChoiceRow[] = playerResearch.available.map(({ _: advance }) => {
        const name = advanceName(advance, held(playerResearch, advance) + 1),
          cost = playerResearch.costs?.[advance],
          left = turns(advance);

        return {
          value: advance,
          label: name,
          facts: [
            ...(cost === undefined
              ? []
              : [
                  {
                    icon: () => yieldIcon('Research'),
                    label: t('ChoiceWindow.Research.cost'),
                    value: localeProvider.number(cost),
                  },
                ]),
            ...(left === null
              ? []
              : [
                  {
                    label: t('ChoiceWindow.turns'),
                    value: t('Progress.turns', { count: left }),
                  },
                ]),
          ],
          primary: t('ChoiceWindow.Research.research', {
            advance: name,
            interpolation: { escapeValue: false },
          }),
        };
      });

    openChoice(
      t('Actions.ChooseResearch.title'),
      rows,
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
      },
      {
        // What was just researched, when that's why it has opened (#726), above the question.
        intro: (() => {
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
        classes: ['choose-research'],
        // What the advance needs and leads to (#183).
        describe: ({ value }) =>
          entryDetails(this.transport(), value, ['advance']),
        classicLabel: ({ value, label }) => {
          const left = turns(value);

          return left === null
            ? label
            : t('Actions.ChooseResearch.choice', {
                advance: label,
                turns: left,
              });
        },
      }
    );
  }

  build(): void {
    assetStore
      .spriteURL(spriteKey(currentTileset(), 'city/bulb'))
      .then((url) =>
        this.append(
          s(
            `<button class="btn-bare large chooseResearch" title="${t(
              'Actions.ChooseResearch.title'
            )}"><img src="${url}"></button>`
          )
        )
      );
  }

  value(): PlayerResearch {
    return super.value() as PlayerResearch;
  }
}

export default ChooseResearch;
