import CityBanners from '@civ-clone/ui-map/components/Map/CityBanners';
import CityBuildChoice from '@civ-clone/ui-windows/components/CityBuildChoice';
import CityStatusTable from '@civ-clone/ui-windows/components/CityStatusTable';
import ChoiceWindow from '@civ-clone/ui-widgets/components/ChoiceWindow';
import CivilizationScoreTable from '@civ-clone/ui-windows/components/CivilizationScoreTable';
import HappinessTable from '@civ-clone/ui-windows/components/HappinessTable';
import IntelligenceTable from '@civ-clone/ui-windows/components/IntelligenceTable';
import MilitaryTable from '@civ-clone/ui-windows/components/MilitaryTable';
import TitleMenu from '@civ-clone/ui-windows/components/TitleMenu';
import TopCitiesTable from '@civ-clone/ui-windows/components/TopCitiesTable';
import TradeTable from '@civ-clone/ui-windows/components/TradeTable';
import UnitStackChoice from '@civ-clone/ui-windows/components/UnitStackChoice';
import { choiceList } from '@civ-clone/ui-windows/components/choiceList';
import { choices } from '@civ-clone/ui-windows/components/choices';
import cityLabels from '@civ-clone/ui-map/components/Map/cityLabels';
import cityLayout from '@civ-clone/ui-windows/components/CityLayout';
import { cityScreen } from '@civ-clone/ui-windows/components/openCity';
import manifest from './manifest.json';
import { registerInterface } from '@civ-clone/ui-client/lib/interfaceMode';
import { reports } from '@civ-clone/ui-windows/components/reports';
import { s } from '@dom111/element';
import titleScreen from '@civ-clone/ui-windows/components/titleScreen';

// The modern interface (#735, #825): its manifest, and the pieces it fills its slots with. Everything it uses is
//  shared, so another interface can use any of it too.

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

registerInterface(manifest);
