// The city package's own text (#825).
import i18next from 'i18next';

i18next.addResources('en', 'default', {
  'Actions.ShowOnMap.label': 'Show on map',
  'CitySquares.city': '{{- square}}, the city. {{- yields}}',
  'CitySquares.free': '{{- square}}, not worked. {{- yields}}',
  'CitySquares.label':
    "The city's squares: arrow keys move, Enter works or frees a square",
  'CitySquares.no-yields': 'Yields nothing',
  'CitySquares.taken': '{{- square}}, worked by another city',
  'CitySquares.worked': '{{- square}}, worked. {{- yields}}',
  'CitySquares.yield': '{{- name}}: {{value, number}}',
  'City.CompleteProduction.body':
    'Do you want to rush building of {{- item}} for {{spendCost.value, number}} $t({{spendCost.resource._}}.name, { "defaultValue": "{{spendCost.resource._}}", "ns": "yield" })? You currently have {{treasury.value, number}} $t({{treasury.yield._}}.name, { "defaultValue": "{{treasury.yield._}}", "ns": "yield" }) available.',
  // After the question, for a build that will wait once paid for (#959): `held` is what it waits for, as the city
  //  screen says it.
  'City.CompleteProduction.held': '{{- held}}.',
  'City.SellImprovement.body':
    'Do you want to sell your {{- item}} for {{saleValue.value, number}} $t({{saleValue.resource._}}.name, { "defaultValue": "{{saleValue.resource._}}", "ns": "yield" })?',
  'City.Progress.per-turn': '{{count, number(signDisplay: exceptZero)}} / turn',
  'City.Rename.label': 'The name of your city',
  'City.Rename.title': 'City name',
  'City.anarchy': 'No taxes or research are collected during Anarchy.',
  'City.size': '{{size, number}}',
  'City.pollution':
    'Pollution {{count, number}}: this city may pollute the land around it',
  'City.trade-routes': 'Trade routes',
  'City.trade-route': '{{city}}: +{{trade, number}}',
  'City.Specialist.change': 'Change {{- specialist}}',
  'City.Yield.summary':
    '{{- yield}}: {{made, number}}, {{used, number}} used, {{spare, number}} spare',
  'City.Yield.summary_made': '{{- yield}}: {{made, number}}',
  'City.Yield.summary_short':
    '{{- yield}}: {{made, number}}, {{used, number}} used, {{short, number}} short',
  'ConfirmationWindow.Generic.title': 'Are you sure?',
  'FindCity.no-cities': "You don't know of any cities yet.",
  'FindCity.title': 'Find City',
  'ReportTable.CityStatus.size': 'Size',
  'Progress.data': '{{progress, number}} / {{total, number}}',
  'Progress.turns_one': '{{count, number}} turn',
  'Progress.turns_other': '{{count, number}} turns',
  'Progress.turns_zero': 'Never',
  'SquareTooltip.list': '{{items, list(type: unit)}}',
  'City.Build.auto-marker': 'Auto',
  'City.Build.unavailable': 'Can’t build…',
  'City.Build.change': 'Change',
  'City.Build.choose': 'Choose',
  'City.Build.title': '{{- item}}',
  'City.SellImprovement.sell': 'Sell',
  'City.Growth.size': 'Size {{size, number}}',
  'City.next': 'Next city',
  'City.previous': 'Previous city',
  'City.rename': 'Rename',
});
