import i18next from 'i18next';

// The talks under Civilization II's rules (M2d, #1007), in our own words: what a person may propose in talks they lead
//  (`_own`), the computer player's answers to them (`Answer.<proposal>.<resolution>`, said to the person), the
//  computer player's own proposals and the person's replies to them, and the computer player's lines
//  (`Dialogue.civ2.*`). Keys only: what Civ1's talks already say (`civ1-diplomacy`) is theirs, and isn't changed here.
//  `interaction.for.0` is the player a proposal is made to.
const nation =
    '$t(Generic.civilization-name.nation, { "civilization": "{{interaction.for.0.civilization._}}", "ns": "default" })',
  advance = (path: string): string =>
    `$t({{${path}._}}.name, { "defaultValue": "{{${path}._}}", "ns": "science" })`,
  unit = (path: string): string =>
    `$t({{${path}._}}.name, { "defaultValue": "{{${path}._}}", "ns": "unit" })`,
  plural = (path: string): string =>
    `$t(Generic.civilization-name.plural, { "civilization": "{{${path}.civilization._}}", "ns": "default" })`;

i18next.addResources('en', 'diplomacy', {
  // Our emissary, in talks we open from the Foreign Advisor.
  Initiate_own: `You send an emissary to ${nation}.`,

  // What we may propose, the menu's first level.
  ProposeAlliance_own: 'Propose an alliance.',
  OfferPeace_own: 'Propose a peace treaty.',
  OfferCeasefire_own: 'Propose a ceasefire.',
  AskAlly_own: 'Ask our ally for help.',
  DemandWithdrawal_own: 'Demand that they withdraw their units from our land.',
  CancelAlliance_own: 'End our alliance.',
  // The favours.
  ExchangeKnowledge_own: `Propose an exchange of advances, for ${advance(
    'interaction.advances.0'
  )}.`,
  JoinWar_own: `Ask them to declare war on the ${plural(
    'interaction.against'
  )}.`,
  ShareMaps_own: 'Offer to share our maps.',
  // The gifts.
  'Gift_own-gold': 'Give them {{interaction.gift.value, number}} gold.',
  'Gift_own-advance': `Give them ${advance('interaction.gift')}.`,
  'Gift_own-unit': `Give them our ${unit('interaction.gift')}.`,

  // Their answers to us. Not to what Civ1's talks have (an audience, peace, an exchange), which read as they always
  //  have.
  'Answer.ProposeAlliance.Accept':
    'Agreed. From today our peoples stand together.',
  'Answer.ProposeAlliance.Decline': 'We have no wish to be your allies.',
  'Answer.OfferCeasefire.Accept':
    'Very well. Our armies will hold their ground.',
  'Answer.OfferCeasefire.Decline': 'There will be no ceasefire.',
  'Answer.AskAlly.Accept': 'We will help you, as allies should.',
  'Answer.AskAlly.Decline': 'We cannot spare anything for you now.',
  'Answer.DemandWithdrawal.Accept':
    'Very well. Our units will leave your land.',
  'Answer.DemandWithdrawal.Decline': 'Our units go where they please.',
  'Answer.CancelAlliance.Accept': 'So be it. Our alliance is at an end.',
  'Answer.CancelAlliance.Decline': 'So be it. Our alliance is at an end.',
  'Answer.JoinWar.Accept': 'Very well. We will march against them.',
  'Answer.JoinWar.Decline': 'We have no quarrel with them.',
  'Answer.ShareMaps.Accept': 'Agreed. Here are our maps.',
  'Answer.ShareMaps.Decline': 'Our maps are our own.',
  'Answer.Gift.Accept': 'We accept your gift, and we will remember it.',
  'Answer.Gift.Decline': 'We want nothing from you.',
  'Answer.SellAdvance.Accept': 'A fair price. It is yours.',
  'Answer.SellAdvance.Decline': 'Then you will do without it.',

  // Their proposals.
  ProposeAlliance:
    'Our peoples have much in common. Will you stand with us in an alliance?',
  OfferCeasefire:
    'This war profits neither of us. Will you agree to a ceasefire?',
  AskAlly: 'Our enemies press us hard. Will you help us, as an ally should?',
  DemandWithdrawal: 'Your units are on our land. Withdraw them at once.',
  CancelAlliance: 'Our alliance is at an end.',
  JoinWar: `The ${plural(
    'interaction.against'
  )} are our enemies. Declare war on them, and we will not forget it.`,
  ShareMaps: 'Shall we share what we know of the world?',
  Gift_gold:
    'Take this gift of {{interaction.gift.value, number}} gold, as a token of our goodwill.',
  Gift_advance: `As a token of our goodwill, we will teach you ${advance(
    'interaction.gift'
  )}.`,
  Gift_unit: `Take this ${unit(
    'interaction.gift'
  )}, as a token of our goodwill.`,
  SellAdvance: `We will teach you ${advance(
    'interaction.advance'
  )}, for {{interaction.price.value, number}} gold.`,

  // Our replies to them.
  'Resolution.ProposeAlliance.Accept_own': 'We accept the alliance.',
  'Resolution.ProposeAlliance.Decline_own': 'We prefer to stand alone.',
  'Resolution.OfferCeasefire.Accept_own': 'Agree to the ceasefire.',
  'Resolution.OfferCeasefire.Decline_own': 'The war goes on.',
  'Resolution.AskAlly.Accept_own': 'We will help you.',
  'Resolution.AskAlly.Decline_own': 'We cannot help you.',
  'Resolution.DemandWithdrawal.Accept_own': 'We will withdraw.',
  'Resolution.DemandWithdrawal.Decline_own': 'Our units stay.',
  'Resolution.CancelAlliance.Acknowledge': 'So be it.',
  'Resolution.JoinWar.Accept_own': 'We will join your war.',
  'Resolution.JoinWar.Decline_own': 'We will not fight your war.',
  'Resolution.ShareMaps.Accept_own': 'Share our maps.',
  'Resolution.ShareMaps.Decline_own': 'Keep our maps to ourselves.',
  // A gift carries its kind, so these are as anyone says them.
  'Resolution.Gift.Accept': 'Accept the gift.',
  'Resolution.Gift.Decline': 'Refuse it.',
  'Resolution.SellAdvance.Accept_own':
    'Pay {{interaction.proposal.price.value, number}} gold.',
  'Resolution.SellAdvance.Decline_own': 'The price is too high.',

  // What a computer player says that isn't a proposal.
  'Dialogue.civ2.ally-dismissed':
    'You did not pay what an ally owes. Our alliance is at an end.',
  'Dialogue.civ2.war': 'Enough! Our armies march against you. This means war.',
  'Dialogue.civ2.war-continues': 'Then the war goes on.',
  'Dialogue.civ2.ally-taunts':
    'You ask too much of us. We want no more of this alliance.',
  'Dialogue.civ2.senate-forced-ceasefire':
    'Your Senate has overruled you, and agreed to our ceasefire in your name.',
  'Dialogue.civ2.senate-forced-peace':
    'Your Senate has overruled you, and signed our peace treaty in your name.',
  'Dialogue.civ2.help-refused':
    'You refuse to help your ally? Then you are no ally of ours.',
  'Dialogue.civ2.violators-refused':
    'Our units will stay where they are. If you want them gone, come and move them.',
});
