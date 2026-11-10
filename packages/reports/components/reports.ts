import Window from '@civ-clone/ui-component-window/Window';
import { Player } from '@civ-clone/ui-protocol/types';
import Portal from '@civ-clone/ui-map/components/Portal';
import Transport from '@civ-clone/ui-client/Transport';
import { defineSlot } from '@civ-clone/ui-platform/lib/interfaceMode';

// Where the reports are put together (#735): the interface's `reports` slot (#824), which each interface in
//  `interfaces/` fills (#825): the classic ones or the ones drawn with the report table (#744). Every key, menu item and button that opens a report comes here.

export interface Reports {
  cityStatus(player: Player, portal: Portal, transport: Transport): Window;
  trade(player: Player, portal: Portal, transport: Transport): Window;
  military(transport: Transport): Window;
  intelligence(transport: Transport, civilization: string | null): Window;
  civilizationScore(transport: Transport): Window;
  happiness(player: Player, portal: Portal, transport: Transport): Window;
  topCities(player: Player, portal: Portal, transport: Transport): Window;
}

export const reports = defineSlot<Reports>('reports');

/** City Status (F1). */
export const openCityStatus = (
  player: Player,
  portal: Portal,
  transport: Transport
): Window => reports.current().cityStatus(player, portal, transport);

/** The Trade report (F5). */
export const openTradeReport = (
  player: Player,
  portal: Portal,
  transport: Transport
): Window => reports.current().trade(player, portal, transport);

/** The Military report (F2). */
export const openMilitaryReport = (transport: Transport): Window =>
  reports.current().military(transport);

/** The Intelligence Report (F3): every civilization met, or only `civilization`, as when an embassy is established. */
export const openIntelligenceReport = (
  transport: Transport,
  civilization: string | null = null
): Window => reports.current().intelligence(transport, civilization);

/** The Civilization Score (F9). */
export const openCivilizationScore = (transport: Transport): Window =>
  reports.current().civilizationScore(transport);

/** The Happiness report (F4). */
export const openHappinessReport = (
  player: Player,
  portal: Portal,
  transport: Transport
): Window => reports.current().happiness(player, portal, transport);

/** Top Cities in the World (F8). */
export const openTopCities = (
  player: Player,
  portal: Portal,
  transport: Transport
): Window => reports.current().topCities(player, portal, transport);
