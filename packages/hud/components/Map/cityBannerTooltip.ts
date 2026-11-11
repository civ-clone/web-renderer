import { City } from '@civ-clone/ui-protocol/types';
import { TooltipContent } from '@civ-clone/ui-component-tooltip/Tooltip';
import { buildOutlook, growthTurns } from '@civ-clone/ui-client/lib/cityTurns';
import {
  cityName,
  growthLimitText,
} from '@civ-clone/ui-client/components/lib/city';
import {
  getLabelForBuildable,
  heldText,
} from '@civ-clone/ui-client/components/lib/cityBuild';
import { reduceKnownYield } from '@civ-clone/ui-client/lib/yieldMap';
import { t } from 'i18next';

// What a city's banner sums up, in full (#747): what it's building, how far along and in how many turns, and how it
//  grows. Only for a city seen in full, which is your own: a rival's banner has nothing more to say (#274).

/** Whether a banner for `city` has a tooltip at all. */
export const hasBannerTooltip = (city: City): boolean => !!city.build;

// How far along the build is, in how many turns, and what a rule holding it waits for (#959): in place of the turns
//  once it's paid for, and after them before.
const buildProgress = (city: City, build: City['build']): string => {
  const { turns, hold } = buildOutlook(city),
    figures = { progress: build.progress.value, total: build.cost.value };

  if (hold === null) {
    return t('CityBanner.progress', { ...figures, turns });
  }

  return t(hold.now ? 'CityBanner.held' : 'CityBanner.will-wait', {
    ...figures,
    turns,
    held: heldText(hold),
  });
};

export const cityBannerTooltip = (city: City): TooltipContent => {
  const { build, growth } = city,
    building = build?.building ? build : null,
    starving = reduceKnownYield(city.yields ?? [], 'Food') < 0,
    rows: TooltipContent['rows'] = [
      building === null
        ? [t('CityWindow.nothing'), '–']
        : [
            getLabelForBuildable(building.building),
            buildProgress(city, building),
          ],
    ];

  if (growth?.cost) {
    const limit = growthLimitText(growth);

    rows.push([
      t('CityBanner.grows', { size: growth.size + 1 }),
      // Not the turns to a growth the rules won't allow (#781), unless it's starving, which matters more.
      limit !== null && !starving
        ? limit
        : t(starving ? 'CityBanner.starving' : 'CityBanner.progress', {
            progress: growth.progress.value,
            total: growth.cost.value,
            turns: growthTurns(city),
          }),
    ]);
  }

  return { title: cityName(city), rows };
};

export default cityBannerTooltip;
