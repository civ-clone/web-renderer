import { Player, PlayerResearch, Yield } from '../types';
import { advanceNames, researchingName } from './lib/advances';
import { groupIcons, reduceKnownYield } from '../lib/yieldMap';
import Window from './Window';
import { assetStore } from '../AssetStore';
import { combinedYields } from './lib/playerYields';
import { turnsLeft } from './lib/cityYields';
import { s } from '@dom111/element';
import { t } from 'i18next';
import watchPlayer, { researchIds } from './lib/watchPlayer';

const template = async (playerResearch: PlayerResearch, yields: Yield[]) => {
  const researchIcon = await assetStore
    .getScaled(`./assets/${groupIcons.Research}`, 2)
    .then((image) => `<img src="${image.toDataURL('image/png')}">`);

  return s(
    `<div><p><strong>${t('ScienceReport.researching', {
      researching: researchingName(playerResearch),
      context: playerResearch.researching ? 'researching' : 'notresearching',
    })}</strong></p><p>${t('ScienceReport.progress', {
      progress: playerResearch.progress.value,
      total: playerResearch.cost.value,
      turns: turnsLeft(playerResearch, yields, 'Research'),
      context: playerResearch.researching ? 'researching' : 'notresearching',
    })}</p><p>${researchIcon} ${t('Progress.per-turn', {
      count: reduceKnownYield(yields, 'Research'),
    })}</p><div class="discovered">${advanceNames(
      playerResearch.complete.map((advance) => advance._)
    )
      .map((name) => `<div>${name}</div>`)
      .join('')}</div></div>`
  );
};

export class ScienceReport extends Window {
  #player: Player;
  #unwatch: () => void;

  constructor(player: Player) {
    super(t('ScienceReport.title'), s('<div></div>'), {
      classes: 'science-report',
    });

    this.#player = player;

    this.update();

    this.#unwatch = watchPlayer(player, researchIds, (player) => {
      this.#player = player;

      this.update();
    });
  }

  close() {
    this.#unwatch();

    return super.close();
  }

  update() {
    template(this.#player.research, combinedYields(this.#player)).then(
      (template) => super.update(template)
    );
  }
}

export default ScienceReport;
