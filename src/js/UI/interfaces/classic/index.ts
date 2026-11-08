import { ChoiceRow } from '../../components/ChoiceWindow';
import { CityStatus } from '../../components/CityStatus';
import CityBuildSelectionWindow from '../../components/CityBuildSelectionWindow';
import CityNames from '../../components/Map/CityNames';
import CivilizationScoreReport from '../../components/CivilizationScoreReport';
import HappinessReport from '../../components/HappinessReport';
import IntelligenceReport from '../../components/IntelligenceReport';
import MainMenu from '../../components/MainMenu';
import MilitaryReport from '../../components/MilitaryReport';
import SelectionWindow from '../../components/SelectionWindow';
import TopCitiesReport from '../../components/TopCitiesReport';
import TradeReport from '../../components/TradeReport';
import UnitSelectionWindow from '../../components/UnitSelectionWindow';
import { choiceList } from '../../components/choiceList';
import { choices } from '../../components/choices';
import cityLabels from '../../components/Map/cityLabels';
import { classicCityLayout } from '../../components/City';
import { cityScreen } from '../../components/openCity';
import manifest from './manifest.json';
import { registerInterface } from '../../lib/interfaceMode';
import { reports } from '../../components/reports';
import titleScreen from '../../components/titleScreen';

// The classic interface (#735, #825), after Civ1's own: its manifest, and the pieces it fills its slots with.

titleScreen.provide('mainMenu', MainMenu);

cityLabels.provide('names', CityNames);

cityScreen.provide('page', classicCityLayout);

reports.provide('classic', {
  cityStatus: (player, portal, transport) =>
    new CityStatus(player, portal, transport),
  trade: (player, portal, transport) =>
    new TradeReport(player, portal, transport),
  military: (transport) => new MilitaryReport(transport),
  intelligence: (transport, civilization) =>
    new IntelligenceReport(transport, civilization),
  civilizationScore: (transport) => new CivilizationScoreReport(transport),
  happiness: (player, portal, transport) =>
    new HappinessReport(player, portal, transport),
  topCities: (_player, _portal, transport) => new TopCitiesReport(transport),
});

choices.provide('classic', {
  cityBuild: (...args) => new CityBuildSelectionWindow(...args),
  unitSelection: (...args) => new UnitSelectionWindow(...args),
});

choiceList.provide(
  'selectionWindow',
  (
    title,
    rows,
    onChoose,
    {
      intro = null,
      chosen = null,
      canClose = true,
      modal = false,
      classicLabel = ({ label }: ChoiceRow) => label,
      classicIntro = intro,
    } = {}
  ) => {
    const window = new SelectionWindow(
      title,
      rows.map((row) => ({
        label: classicLabel(row),
        value: row.value,
        ...(row.group === undefined ? {} : { group: row.group }),
      })),
      onChoose,
      classicIntro,
      {
        canClose,
        displayAll: true,
        modal,
      }
    );

    if (chosen !== null && !window.autoChosen()) {
      window.selectionList().value = chosen;
    }

    return window;
  }
);

registerInterface(manifest);
