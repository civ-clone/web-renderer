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
import { Player } from '../types';
import Portal from './Portal';
import TradeReport from './TradeReport';
import TradeTable from './TradeTable';
import TopCitiesReport from './TopCitiesReport';
import TopCitiesTable from './TopCitiesTable';
import Transport from '../Transport';
import { interfaceMode } from '../lib/interfaceMode';

// Where the reports are put together (#735): the classic ones, or under the new interface the ones drawn with the
//  report table (#744). Every key, menu item and button that opens a report comes here.

/** City Status (F1). */
export const openCityStatus = (
  player: Player,
  portal: Portal,
  transport: Transport
): CityStatus | CityStatusTable =>
  interfaceMode() === 'new'
    ? new CityStatusTable(player, portal)
    : new CityStatus(player, portal, transport);

/** The Trade report (F5). */
export const openTradeReport = (
  player: Player,
  portal: Portal,
  transport: Transport
): TradeReport | TradeTable =>
  interfaceMode() === 'new'
    ? new TradeTable(player, portal)
    : new TradeReport(player, portal, transport);

/** The Military report (F2). */
export const openMilitaryReport = (
  transport: Transport
): MilitaryReport | MilitaryTable =>
  interfaceMode() === 'new'
    ? new MilitaryTable(transport)
    : new MilitaryReport(transport);

/** The Intelligence Report (F3): every civilization met, or only `civilization`, as when an embassy is established. */
export const openIntelligenceReport = (
  transport: Transport,
  civilization: string | null = null
): IntelligenceReport | IntelligenceTable =>
  interfaceMode() === 'new'
    ? new IntelligenceTable(transport, civilization)
    : new IntelligenceReport(transport, civilization);

/** The Civilization Score (F9). */
export const openCivilizationScore = (
  transport: Transport
): CivilizationScoreReport | CivilizationScoreTable =>
  interfaceMode() === 'new'
    ? new CivilizationScoreTable(transport)
    : new CivilizationScoreReport(transport);

/** The Happiness report (F4). */
export const openHappinessReport = (
  player: Player,
  portal: Portal,
  transport: Transport
): HappinessReport | HappinessTable =>
  interfaceMode() === 'new'
    ? new HappinessTable(player, portal)
    : new HappinessReport(player, portal, transport);

/** Top Cities in the World (F8). */
export const openTopCities = (
  player: Player,
  portal: Portal,
  transport: Transport
): TopCitiesReport | TopCitiesTable =>
  interfaceMode() === 'new'
    ? new TopCitiesTable(player, portal, transport)
    : new TopCitiesReport(transport);
