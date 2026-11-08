import { CityStatus } from './CityStatus';
import CivilizationScoreReport from './CivilizationScoreReport';
import CivilizationScoreTable from './CivilizationScoreTable';
import HappinessReport from './HappinessReport';
import HappinessTable from './HappinessTable';
import IntelligenceReport from './IntelligenceReport';
import IntelligenceTable from './IntelligenceTable';
import MilitaryReport from './MilitaryReport';
import MilitaryTable from './MilitaryTable';
import CityStatusTable from './CityStatusTable';
import { Player } from '@civ-clone-ui/client/types';
import Portal from '@civ-clone-ui/map/components/Portal';
import TradeReport from './TradeReport';
import TradeTable from './TradeTable';
import TopCitiesReport from './TopCitiesReport';
import TopCitiesTable from './TopCitiesTable';
import Transport from '@civ-clone-ui/client/Transport';
import { defineSlot } from '@civ-clone-ui/client/lib/interfaceMode';

// Where the reports are put together (#735): the interface's `reports` slot (#824), which each interface in
//  `interfaces/` fills (#825): the classic ones or the ones drawn with the report table (#744). Every key, menu item and button that opens a report comes here.

export interface Reports {
  cityStatus(
    player: Player,
    portal: Portal,
    transport: Transport
  ): CityStatus | CityStatusTable;
  trade(
    player: Player,
    portal: Portal,
    transport: Transport
  ): TradeReport | TradeTable;
  military(transport: Transport): MilitaryReport | MilitaryTable;
  intelligence(
    transport: Transport,
    civilization: string | null
  ): IntelligenceReport | IntelligenceTable;
  civilizationScore(
    transport: Transport
  ): CivilizationScoreReport | CivilizationScoreTable;
  happiness(
    player: Player,
    portal: Portal,
    transport: Transport
  ): HappinessReport | HappinessTable;
  topCities(
    player: Player,
    portal: Portal,
    transport: Transport
  ): TopCitiesReport | TopCitiesTable;
}

export const reports = defineSlot<Reports>('reports');

/** City Status (F1). */
export const openCityStatus = (
  player: Player,
  portal: Portal,
  transport: Transport
): CityStatus | CityStatusTable =>
  reports.current().cityStatus(player, portal, transport);

/** The Trade report (F5). */
export const openTradeReport = (
  player: Player,
  portal: Portal,
  transport: Transport
): TradeReport | TradeTable =>
  reports.current().trade(player, portal, transport);

/** The Military report (F2). */
export const openMilitaryReport = (
  transport: Transport
): MilitaryReport | MilitaryTable => reports.current().military(transport);

/** The Intelligence Report (F3): every civilization met, or only `civilization`, as when an embassy is established. */
export const openIntelligenceReport = (
  transport: Transport,
  civilization: string | null = null
): IntelligenceReport | IntelligenceTable =>
  reports.current().intelligence(transport, civilization);

/** The Civilization Score (F9). */
export const openCivilizationScore = (
  transport: Transport
): CivilizationScoreReport | CivilizationScoreTable =>
  reports.current().civilizationScore(transport);

/** The Happiness report (F4). */
export const openHappinessReport = (
  player: Player,
  portal: Portal,
  transport: Transport
): HappinessReport | HappinessTable =>
  reports.current().happiness(player, portal, transport);

/** Top Cities in the World (F8). */
export const openTopCities = (
  player: Player,
  portal: Portal,
  transport: Transport
): TopCitiesReport | TopCitiesTable =>
  reports.current().topCities(player, portal, transport);
