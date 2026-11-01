import { CityStatus } from './CityStatus';
import CityStatusTable from './CityStatusTable';
import { Player } from '../types';
import Portal from './Portal';
import TradeReport from './TradeReport';
import TradeTable from './TradeTable';
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
