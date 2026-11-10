// The interface-modern package's own text, as en-GB has it where it differs from en (#825).
import i18next from 'i18next';

i18next.addResources('en-GB', 'default', {
  'ChoiceWindow.Build.defence': 'Defence',
  'GameSetup.difficulty-summary.Prince': 'A fair game for a practised player.',
  'ReportTable.Intelligence.civilization': 'Civilisation',
  'ReportTable.Military.defence': 'Defence',
  'NextTurn.waiting.unmet-player': 'Waiting for an unknown civilisation…',
  'UnitCard.defence-bonus':
    '+{{bonus, number(style: percent; maximumFractionDigits: 0)}} defence',
  'UnitCard.defence-bonus.title': 'Defence bonus',
});
