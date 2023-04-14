import { GameData, Player, PlayerResearch, Yield } from '../types';
import { knownIcons, reduceKnownYield } from '../lib/yieldMap';
import DataObserver from '../DataObserver';
import Window from './Window';
import { assetStore } from '../AssetStore';
import { combinedYields } from './lib/playerYields';
import { renderProgress, turnsLeft } from './lib/cityYields';
import { s } from '@dom111/element';
import { t } from 'i18next';

const template = async (playerResearch: PlayerResearch, yields: Yield[]) => {
  const researchIcon = await assetStore
    .getScaled(`./assets/${knownIcons.Research}`, 2)
    .then((image) => `<img src="${image.toDataURL('image/png')}">`);

  return s(
    `<div><p><strong>${t('ScienceReport.researching', {
      researching: playerResearch.researching?._,
      context: playerResearch.researching ? 'researching' : 'notresearching',
    })}</strong></p><p>${t('ScienceReport.progress', {
      progress: playerResearch.progress.value,
      total: playerResearch.cost.value,
      turns: turnsLeft(playerResearch, yields, 'Research'),
      context: playerResearch.researching ? 'researching' : 'notresearching',
    })}</p><p>${researchIcon} ${t('Progress.per-turn', {
      count: reduceKnownYield(yields, 'Research'),
    })}</p><div class="discovered">${playerResearch.complete
      .map(
        (advance) =>
          `<div>${t(`${advance._}.name`, {
            defaultValue: advance._,
            ns: 'science',
          })}</div>`
      )
      .join('')}</div></div>`
  );
};

export class ScienceReport extends Window {
  #dataObserver: DataObserver;
  #player: Player;

  constructor(player: Player) {
    super(t('ScienceReport.title'), s('<div></div>'), {
      classes: 'science-report',
    });

    this.#player = player;

    this.update();

    this.#dataObserver = new DataObserver(
      [player.id, player.research.id, ...player.cities.map((city) => city.id)],
      (data) => {
        const player = (data as GameData).player;

        this.#dataObserver.setIds([
          player.id,
          player.research.id,
          ...player.cities.map((city) => city.id),
        ]);

        this.#player = player;

        this.update();
      }
    );
  }

  close() {
    this.#dataObserver.dispose();

    return super.close();
  }

  update() {
    template(this.#player.research, combinedYields(this.#player)).then(
      (template) => super.update(template)
    );
  }
}

export default ScienceReport;
