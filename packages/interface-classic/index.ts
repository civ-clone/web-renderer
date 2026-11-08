import { ChoiceRow } from '@civ-clone/ui-component-choice-window/ChoiceWindow';
import { CityStatus } from './components/CityStatus';
import CityBuildSelectionWindow from './components/CityBuildSelectionWindow';
import CityNames from '@civ-clone/ui-map/components/Map/CityNames';
import CivilizationScoreReport from '@civ-clone/ui-windows/components/CivilizationScoreReport';
import HappinessReport from './components/HappinessReport';
import IntelligenceReport from './components/IntelligenceReport';
import MainMenu from './components/MainMenu';
import MilitaryReport from './components/MilitaryReport';
import SelectionWindow from '@civ-clone/ui-component-selection-window/SelectionWindow';
import TopCitiesReport from './components/TopCitiesReport';
import TradeReport from './components/TradeReport';
import UnitSelectionWindow from '@civ-clone/ui-windows/components/UnitSelectionWindow';
import { choiceList } from '@civ-clone/ui-windows/components/choiceList';
import { choices } from '@civ-clone/ui-windows/components/choices';
import cityLabels from '@civ-clone/ui-map/components/Map/cityLabels';
import { classicCityLayout } from '@civ-clone/ui-windows/components/City';
import { cityScreen } from '@civ-clone/ui-windows/components/openCity';
import manifest from './manifest.json';
import { registerInterface } from '@civ-clone/ui-client/lib/interfaceMode';
import { reports } from '@civ-clone/ui-windows/components/reports';
import titleScreen from '@civ-clone/ui-windows/components/titleScreen';

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
