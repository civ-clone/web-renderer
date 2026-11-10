// What a notice is about, for its tint on the notification rows and the Next Turn button (#416): military, science,
//  gold, Wonders and civics, or diplomacy. By the notice's key, as its text is: a key, or the keys under it, in the
//  first group that names it. Anything else is a plain notice, in the notice tint.

import { Notice } from '../Notices';
import { PlayerAction } from '@civ-clone/ui-protocol/types';

export type NoticeCategory =
  | 'civics'
  | 'diplomacy'
  | 'gold'
  | 'military'
  | 'science';

const categories: [NoticeCategory, string[]][] = [
  [
    'gold',
    [
      'Barbarians.ransom',
      'City.improvement-unsupported',
      'GoodyHut.action-performed.Gold',
      'Unit.trade-route-established',
    ],
  ],
  [
    'science',
    [
      'Diplomat.advance-stolen',
      'GoodyHut.action-performed.Advance',
      'Player.research-complete',
      'Player.spaceship-landed',
      'Spaceship',
    ],
  ],
  [
    'military',
    [
      'Barbarians',
      'City.captured-by-us',
      'City.captured-from-us',
      'City.destroyed',
      'City.destroyed-by',
      'City.sdi-protected',
      'Diplomat',
      'GoodyHut.action-performed.Barbarians',
      'Player.defeated',
      'Unit.lost-at-sea',
      'Unit.nuclear-attack',
      'Unit.out-of-fuel',
    ],
  ],
  [
    'civics',
    [
      'City.building-complete.wonder',
      'City.civil-disorder',
      'City.leader-celebration',
      'City.leader-celebration-ended',
      'City.order-restored',
      'CityImprovement.obsolete',
      'Player.government-collapsed',
      'Wonder',
    ],
  ],
  ['diplomacy', ['Player.declaration-broken', 'Player.declaration-expired']],
];

export const noticeCategory = (key: string): NoticeCategory | null =>
  categories.find(([, keys]) =>
    keys.some((name) => key === name || key.startsWith(`${name}.`))
  )?.[0] ?? null;

/** Marks `element` with its notice's category, for its tint: `data-category`, or none for any other action. */
export const setNoticeCategory = (
  element: HTMLElement,
  action: PlayerAction
): void => {
  const category =
    action._ === 'Notice'
      ? noticeCategory((action.value as unknown as Notice).notification.key)
      : null;

  if (category === null) {
    delete element.dataset.category;
  } else {
    element.dataset.category = category;
  }
};

export default noticeCategory;
