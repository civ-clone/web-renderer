import CityBanners from '../../components/Map/CityBanners';
import CityBuildChoice from '../../components/CityBuildChoice';
import CityStatusTable from '../../components/CityStatusTable';
import ChoiceWindow from '../../components/ChoiceWindow';
import CivilizationScoreTable from '../../components/CivilizationScoreTable';
import HappinessTable from '../../components/HappinessTable';
import IntelligenceTable from '../../components/IntelligenceTable';
import MilitaryTable from '../../components/MilitaryTable';
import TitleMenu from '../../components/TitleMenu';
import TopCitiesTable from '../../components/TopCitiesTable';
import TradeTable from '../../components/TradeTable';
import UnitStackChoice from '../../components/UnitStackChoice';
import { choiceList } from '../../components/choiceList';
import { choices } from '../../components/choices';
import cityLabels from '../../components/Map/cityLabels';
import cityLayout from '../../components/CityLayout';
import { cityScreen } from '../../components/openCity';
import manifest from './manifest.json';
import { registerInterface } from '../../lib/interfaceMode';
import { reports } from '../../components/reports';
import { s } from '@dom111/element';
import titleScreen from '../../components/titleScreen';

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
