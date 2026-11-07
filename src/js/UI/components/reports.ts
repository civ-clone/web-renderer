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
import { defineSlot } from '../lib/interfaceMode';

// Where the reports are put together (#735): the interface's `reports` slot (#824), the classic ones or the ones drawn
//  with the report table (#744). Every key, menu item and button that opens a report comes here.

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
