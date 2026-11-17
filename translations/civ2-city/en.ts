import i18next from 'i18next';

// Civilization II's trade (M2d part 2, #1007), in our own words. The goods a Caravan or Freight carries are civ2-city's
//  sixteen keys (`lib/tradeRoutes`); the eight Civilization has too keep the words they have (`ui-protocol`), and these
//  are the other eight's.
i18next.addResources('en', 'default', {
  'TradeRoute.goods.Hides': 'Leather',
  'TradeRoute.goods.Wool': 'Fleece',
  'TradeRoute.goods.Beads': 'Trinkets',
  'TradeRoute.goods.Cloth': 'Linen',
  'TradeRoute.goods.Coal': 'Fuel',
  'TradeRoute.goods.Gold': 'Bullion',
  'TradeRoute.goods.Oil': 'Petroleum',
  'TradeRoute.goods.Uranium': 'Fissile ore',
});

// A delivery pays its bonus in gold and as much again in research (`ui-rules-civ2`'s notice, in place of the shared
//  one).
i18next.addResources('en', 'notification', {
  'Unit.trade-route-delivered.title': 'Trade route established',
  'Unit.trade-route-delivered.body': `Our traders from {{- home, cityName}} have sold their $t(TradeRoute.goods.{{goods}}, { "defaultValue": "{{goods}}", "ns": "default" }) in {{- city, cityName}}, earning {{bonus, number}} gold and as much again in research.`,
});
