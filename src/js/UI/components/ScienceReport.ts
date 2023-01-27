import { GameData, Player, PlayerResearch, Yield } from '../types';
import { knownIcons, reduceKnownYield } from '../lib/yieldMap';
import DataObserver from '../DataObserver';
import Window from './Window';
import { combinedYields } from './lib/playerYields';
import { renderProgress } from './lib/cityYields';
import { s } from '@dom111/element';
import { assetStore } from '../AssetStore';

const template = async (playerResearch: PlayerResearch, yields: Yield[]) => {
  const researchIcon = await assetStore
    .getScaled(`./assets/${knownIcons.Research}`, 2)
    .then((image) => `<img src="${image.toDataURL('image/png')}">`);

  return s(
    `<div><p><strong>Researching ${
      playerResearch.researching ? playerResearch.researching._ : 'nothing'
    }</strong>${
      playerResearch.researching
        ? ` ${renderProgress(playerResearch, yields, 'Research')}`
        : ''
    }</p><p>${researchIcon} ${reduceKnownYield(
      yields,
      'Research'
    )} / turn</p><div class="discovered">${playerResearch.complete
      .map((advance) => `<div>${advance._}</div>`)
      .join('')}</div></div>`
  );
};

export class ScienceReport extends Window {
  #dataObserver: DataObserver;
  #player: Player;

  constructor(player: Player) {
    super('Player research', s('<div></div>'), {
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
