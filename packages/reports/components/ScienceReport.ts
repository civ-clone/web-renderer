import { Player, PlayerResearch, Yield } from '@civ-clone/ui-protocol/types';
import {
  advanceNames,
  researchingName,
} from '@civ-clone/ui-client/lib/advances';
import { groupIcons } from '@civ-clone/ui-assets/lib/groupIcons';
import { reduceKnownYield } from '@civ-clone/ui-client/lib/yieldMap';
import Window from '@civ-clone/ui-component-window/Window';
import { assetStore } from '@civ-clone/ui-assets/AssetStore';
import interfaceArt, {
  interfaceSpriteKey,
} from '@civ-clone/ui-assets/lib/interfaceArt';
import { combinedYields } from '@civ-clone/ui-client/lib/playerYields';
import { turnsLeft } from '@civ-clone/ui-city/components/lib/cityYields';
import { s } from '@dom111/element';
import { t } from 'i18next';
import watchPlayer, { researchIds } from './lib/watchPlayer';

const template = async (playerResearch: PlayerResearch, yields: Yield[]) => {
  const researchIcon = await assetStore
    .shownAtURL(interfaceSpriteKey(groupIcons.Research), interfaceArt().ui.icon)
    .then((url) => `<img src="${url}">`);
  const names = advanceNames(
    playerResearch.complete.map((advance) => advance._)
  );

  const element = s(
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
    })}</p><div class="discovered">${names
      .map((name) => `<div>${name}</div>`)
      .join('')}</div></div>`
  );

  // Each column is as wide as the longest name, in characters, so the columns fit the names in whatever language and
  //  font: as many as there's room for, up to four (#957).
  element
    .querySelector<HTMLElement>('.discovered')!
    .style.setProperty(
      '--name-width',
      `${Math.max(1, ...names.map((name) => name.length))}ch`
    );

  return element;
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

  override close() {
    this.#unwatch();

    return super.close();
  }

  override update() {
    template(this.#player.research, combinedYields(this.#player)).then(
      (template) => super.update(template)
    );
  }
}

export default ScienceReport;
