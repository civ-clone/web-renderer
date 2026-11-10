import CityBanners from '@civ-clone/ui-map/components/Map/CityBanners';
import CityBuildChoice from './components/CityBuildChoice';
import CityStatusTable from './components/CityStatusTable';
import ChoiceWindow from '@civ-clone/ui-component-choice-window/ChoiceWindow';
import CivilizationScoreTable from './components/CivilizationScoreTable';
import HappinessTable from './components/HappinessTable';
import IntelligenceTable from './components/IntelligenceTable';
import MilitaryTable from './components/MilitaryTable';
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
import { registerInterface } from '@civ-clone/ui-client/lib/interfaceMode';
import { reports } from '@civ-clone/ui-windows/components/reports';
import { s } from '@dom111/element';
import talks from '@civ-clone/ui-windows/components/talks';
import titleScreen from '@civ-clone/ui-windows/components/titleScreen';
import unitPanel from '@civ-clone/ui-windows/components/unitPanel';

// The modern interface (#735, #825): its manifest, and the pieces it fills its slots with. Those only it uses are its
//  own, in `components/`; the rest are shared.

titleScreen.provide('titleMenu', TitleMenu);

cityLabels.provide('banners', CityBanners);

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

registerInterface(manifest);
