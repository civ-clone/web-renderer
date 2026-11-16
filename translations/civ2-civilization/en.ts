import i18next from 'i18next';

// Civilization II's civilizations that Civilization has none of (M2a, #1008), named as their packages name their people
//  and nation (the Celts' as one nation, as the Sioux's is), and the leaders Civilization II's tribes have that
//  Civilization's don't.
i18next.addResources('en', 'civilization', {
  'Carthaginian.name': 'Carthaginian',
  'Carthaginian.nation': 'Carthage',
  'Carthaginian.plural': 'Carthaginians',
  'Celtic.name': 'Celtic',
  'Celtic.nation': 'the Celtic Nation',
  'Celtic.plural': 'Celts',
  'Persian.name': 'Persian',
  'Persian.nation': 'Persia',
  'Persian.plural': 'Persians',
  'Spanish.name': 'Spanish',
  'Spanish.nation': 'Spain',
  'Spanish.plural': 'Spanish',

  // Leaders
  'Leader.Brennus.name': 'Brennus',
  'Leader.CatherineTheGreat.name': 'Catherine the Great',
  'Leader.HannibalBarca.name': 'Hannibal Barca',
  'Leader.IsabellaI.name': 'Isabella I',
  'Leader.XerxesI.name': 'Xerxes I',
});

// What a leader is called under each government (civ2-civilization's `LeaderTitle` rules, M2d), in our own words,
//  wherever the leader is named.
i18next.addResources('en', 'civilization', {
  'LeaderTitle.civ2.Anarchy': 'Rebel Leader',
  'LeaderTitle.civ2.Despotism': 'Tyrant',
  'LeaderTitle.civ2.Monarchy': 'Sovereign',
  'LeaderTitle.civ2.Communism': 'Chairman',
  'LeaderTitle.civ2.Fundamentalism': 'Supreme Guide',
  'LeaderTitle.civ2.Republic': 'First Citizen',
  'LeaderTitle.civ2.Democracy': 'Prime Minister',
});
