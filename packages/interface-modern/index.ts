import CityBanners from './components/CityBanners';
import CityBuildChoice from './components/CityBuildChoice';
import CityStatusTable from './components/CityStatusTable';
import ChoiceWindow from '@civ-clone/ui-component-choice-window/ChoiceWindow';
import CivilizationScoreTable from './components/CivilizationScoreTable';
import HappinessTable from './components/HappinessTable';
import IntelligenceTable from './components/IntelligenceTable';
import MilitaryTable from './components/MilitaryTable';
import NextTurn from './components/NextTurn';
import NotificationRows from './components/NotificationRows';
import TitleMenu from './components/TitleMenu';
import TopCitiesTable from './components/TopCitiesTable';
import TradeTable from './components/TradeTable';
import UnitCard from './components/UnitCard';
import UnitCardActions from './components/UnitCardActions';
import UnitStackChoice from './components/UnitStackChoice';
import { choiceList } from '@civ-clone/ui-windows/components/choiceList';
import { choices } from '@civ-clone/ui-windows/components/choices';
import cityLabels from '@civ-clone/ui-map/components/Map/cityLabels';
import cityLayout from './components/CityLayout';
import { cityScreen } from '@civ-clone/ui-windows/components/openCity';
import meetingTalks from './components/meetingTalks';
import manifest from './manifest.json';
import mapMenus from '@civ-clone/ui-windows/components/mapMenus';
import sharedMenus from './components/sharedMenus';
import {
  InterfaceManifest,
  registerInterface,
} from '@civ-clone/ui-client/lib/interfaceMode';
import { registerTheme } from '@civ-clone/ui-widgets/lib/theme';
import { reports } from '@civ-clone/ui-windows/components/reports';
import { s } from '@dom111/element';
import talks from '@civ-clone/ui-windows/components/talks';
import nextTurnQueue from '@civ-clone/ui-client/lib/nextTurnQueue';
import titleScreen from '@civ-clone/ui-windows/components/titleScreen';
import turnControls from '@civ-clone/ui-windows/components/turnControls';
import unitPanel from '@civ-clone/ui-windows/components/unitPanel';
import windowChrome from '@civ-clone/ui-component-window/windowChrome';
import framedChrome from './components/framedChrome';

// The modern interface (#735, #825): its manifest, and the pieces it fills its slots with. Those only it uses are its
//  own, in `components/`; the rest are shared.

titleScreen.provide('titleMenu', TitleMenu);

// The banners (#747), drawn with the theme's tokens and fonts, and wide enough to cover a row of the yields.
cityLabels.provide('banners', {
  layer: CityBanners,
  followTheme: true,
  giveWayToYields: true,
});

cityScreen.provide('window', cityLayout);

reports.provide('tables', {
  cityStatus: (player, portal) => new CityStatusTable(player, portal),
  trade: (player, portal) => new TradeTable(player, portal),
  military: (transport) => new MilitaryTable(transport),
  intelligence: (transport, civilization) =>
    new IntelligenceTable(transport, civilization),
  civilizationScore: (transport) => new CivilizationScoreTable(transport),
  happiness: (player, portal) => new HappinessTable(player, portal),
  topCities: (player, portal, transport) =>
    new TopCitiesTable(player, portal, transport),
});

choices.provide('choiceWindows', {
  cityBuild: (...args) => new CityBuildChoice(...args),
  unitSelection: (...args) => new UnitStackChoice(...args),
});

choiceList.provide(
  'choiceWindow',
  (
    title,
    rows,
    onChoose,
    {
      intro = null,
      chosen = null,
      canClose = true,
      modal = false,
      classes = [],
      describe = null,
    } = {}
  ) => {
    let introNode: Node | null = typeof intro === 'string' ? null : intro;

    if (typeof intro === 'string' && intro !== '') {
      introNode = s('<p></p>');
      introNode.textContent = intro;
    }

    return new ChoiceWindow(title, rows, onChoose, {
      canClose,
      modal,
      chosen,
      classes,
      describe,
      intro: introNode,
    });
  }
);

// The unit's card, with its actions in it (#743): no strip at the bottom left.
unitPanel.provide('card', ({ unitInfo, unitActionArea }, deps) => {
  const card = new UnitCard(unitInfo, deps),
    actions = new UnitCardActions(card.actionArea(), deps.unitAction);

  unitActionArea.remove();

  return {
    update: (unit) => card.update(unit),
    actions: (unit, tile) => actions.build(unit, tile),
    dispose: () => card.dispose(),
  };
});

talks.provide('meetingWindow', meetingTalks);

mapMenus.provide('shared', sharedMenus);

// The notification rows (#416) over the Next Turn button (#702), in place of the orbs.
turnControls.provide(
  'nextTurn',
  (actionArea, { centreActiveUnit, dismiss, portal, transport }) => {
    const rows = s('<div class="ui-notification-rows"></div>'),
      next = s('<div class="ui-next-turn-area"></div>');

    actionArea.replaceChildren(rows, next);

    const notificationRows = new NotificationRows(rows, {
        dismiss,
        portal,
        transport,
      }),
      nextTurn = new NextTurn(next, {
        centreActiveUnit,
        portal,
        transport,
      });

    return {
      build: ({ kept, actions, waiting, player, turn }) => {
        notificationRows.build(
          kept.filter((action) =>
            ['CivilDisorder', 'Notice'].includes(action._)
          ),
          player
        );
        nextTurn.build(
          nextTurnQueue(kept, actions, waiting),
          waiting,
          player,
          turn
        );
      },
      nextTurn: () => nextTurn,
    };
  }
);

windowChrome.provide('framed', framedChrome);

// The theme it comes with (#736), Slate and brass, whose tokens are in `styles/_slate.scss`: the default, which the
//  stylesheet draws on `:root` with no `data-ui-theme`.
registerTheme({
  id: 'slate',
  name: 'GameOptions.theme-choice.slate',
  default: true,
});

// It fills every slot, which the build checks; what it names as features is checked as it registers (#861).
const checked: Pick<InterfaceManifest, 'slots'> = manifest;

registerInterface(checked);
