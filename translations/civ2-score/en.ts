import i18next from 'i18next';

// Civilization II's score (M2e, #1008), in our own words: what each term counts under its rules (the `civ2` context
//  `ui-rules-civ2` gives each term, and `civ2-own` for civ2-enhanced's own pollution), its barbarian term, and the 24
//  titles a rating earns, lowest first (civ2-score's `title`, 0 to 23): rulers history remembers, from the least to the
//  greatest. The names are ours; the original's aren't used.
i18next.addResources('en', 'default', {
  'CivilizationScoreReport.term.citizens.detail_civ2':
    '2 for each happy citizen, 1 for each content one or specialist',
  'CivilizationScoreReport.term.wonders.detail_civ2':
    '20 for each Wonder, obsolete or not',
  'CivilizationScoreReport.term.spaceship.detail_civ2':
    'Once it lands first: its colonists (in tens of thousands) × its chance of success',
  'CivilizationScoreReport.term.pollution.detail_civ2':
    '−10 for each polluted square in the world, but 10 back for each computer player’s city whose radius it lies in',
  'CivilizationScoreReport.term.pollution.detail_civ2-own':
    '−10 for each polluted square around your own cities',
  'CivilizationScoreReport.term.peace.detail_civ2':
    'From turn 200, 3 for each turn of world peace, up to 100',
  'CivilizationScoreReport.term.future-technology.detail_civ2':
    '5 for each Future Technology',
  'CivilizationScoreReport.term.barbarians': 'Barbarians',
  'CivilizationScoreReport.term.barbarians.detail_civ2':
    '−50, and 25 more for each level of barbarian activity',
  'CivilizationScoreReport.bonus.detail_civ2':
    'Conquering the world: 400, 2 for each turn before turn 570 and 100 for each opponent, more on a large map and less on a small one. It counts when it beats the rest.',
  'RatingTitle.civ2-score.0': 'Romulus Augustulus',
  'RatingTitle.civ2-score.1': 'Caligula',
  'RatingTitle.civ2-score.2': 'Commodus',
  'RatingTitle.civ2-score.3': 'King John',
  'RatingTitle.civ2-score.4': 'Emperor Puyi',
  'RatingTitle.civ2-score.5': 'Richard III',
  'RatingTitle.civ2-score.6': 'Charles I',
  'RatingTitle.civ2-score.7': 'Tsar Nicholas II',
  'RatingTitle.civ2-score.8': 'Henry VIII',
  'RatingTitle.civ2-score.9': 'Frederick Barbarossa',
  'RatingTitle.civ2-score.10': 'Richard the Lionheart',
  'RatingTitle.civ2-score.11': 'Kublai Khan',
  'RatingTitle.civ2-score.12': 'Elizabeth I',
  'RatingTitle.civ2-score.13': 'Peter the Great',
  'RatingTitle.civ2-score.14': 'Catherine the Great',
  'RatingTitle.civ2-score.15': 'Saladin',
  'RatingTitle.civ2-score.16': 'Mansa Musa',
  'RatingTitle.civ2-score.17': 'Ramesses the Great',
  'RatingTitle.civ2-score.18': 'Ashoka the Great',
  'RatingTitle.civ2-score.19': 'Qin Shi Huang',
  'RatingTitle.civ2-score.20': 'Genghis Khan',
  'RatingTitle.civ2-score.21': 'Julius Caesar',
  'RatingTitle.civ2-score.22': 'Akbar the Great',
  'RatingTitle.civ2-score.23': 'Alexander the Great',
});
