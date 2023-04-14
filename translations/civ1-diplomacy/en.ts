import i18next from "i18next";

i18next.addResources(
  'en',
  'diplomacy',
  {
    'Action.Terminate': 'Good bye!',

    'Dialogue.accept-peace.neutral': 'We affirm this treaty of eternal friendship and goodwill between the people of the $t({{interaction.by.civilization._}}.name, { "defaultValue": "{{interaction.by.civilization._}}", "ns": "civilization" }) and $t({{interaction.for.0.civilization._}}.name, { "defaultValue": "{{interaction.for.0.civilization._}}", "ns": "civilization" }) civilizations.',
    'Dialogue.decline-demand.neutral': 'In spite of your disrespectful attitude, we will spare you from the wrath of our mighty armies.',
    'Dialogue.decline-peace.neutral': 'Very well, we will mobilize our armies for WAR! You will pay for your foolish pride!',
    'Dialogue.handover': 'You respond...',
    'Dialogue.welcome.no-peace': 'Greetings from $t(Leader.{{interaction.by.civilization.leader._}}.name, { "defaultValue": "{{interaction.by.civilization.leader._}}", "ns": "civilization" }), leader of the powerful $t({{interaction.by.civilization._}}.nation, { "defaultValue": "{{interaction.by.civilization._}}", "ns": "civilization" }).',
    'Dialogue.welcome.peace': 'Greetings from $t(Leader.{{interaction.by.civilization.leader._}}.name, { "defaultValue": "{{interaction.by.civilization.leader._}}", "ns": "civilization" }), leader of the powerful $t({{interaction.by.civilization._}}.nation, { "defaultValue": "{{interaction.by.civilization._}}", "ns": "civilization" }). We always enjoy spending time with our good friends $t({{interaction.for.0.civilization._}}.nation, { "defaultValue": "{{interaction.for.0.civilization._}}", "ns": "civilization" }).',
    'Dialogue.welcome-peace': 'We welcome peace with the $t({{interaction.for.0.civilization._}}.plural, { "defaultValue": "{{interaction.by.civilization._}}", "ns": "civilization" }).',

    'DemandTribute': 'We demand tribute for our patience.',

    'ExchangeKnowledge': 'We notice that your primitive civilization has not even discovered $t({{interaction.advances.0._}}.name, { "defaultValue": "{{interaction.advances.0._}}", "ns": "science" }). Do you care to exchange knowledge with us?',

    'Initiate': 'An emissary from $t({{interaction.by.civilization._}}.nation, { "defaultValue": "{{interaction.by.civilization._}}", "ns": "civilization" }) wishes to speak with you. Will you receive them?',

    'OfferPeace': 'You may be worthy to make peace with us. We have prepared a treaty for your signature.',

    'Resolution.Initiate.Accept': 'Yes',
    'Resolution.Initiate.Decline': 'No',
    'Resolution.OfferPeace.Accept': "Accept",
    'Resolution.OfferPeace.Decline': 'Reject',
    'Resolution.ExchangeKnowledge.Accept': "OK, let's exchange knowledge.",
    'Resolution.ExchangeKnowledge.Decline': 'No, we do not need $t({{interaction.proposal.advances.0._}}.name, { "defaultValue": "{{interaction.proposal.advances.0._}}", "ns": "science" }).',
    'Resolution.Dialogue.Acknowledge': 'OK',
    'Resolution.DemandTribute.Accept': 'We present you with a gift of {{interaction.proposal.tribute.value, number}} $t({{interaction.proposal.tribute._}}.name, { "defaultValue": "{{interaction.proposal.tribute._}}", "ns": "yield" }) in tribute to your peaceful nature.',
    'Resolution.DemandTribute.Decline': 'We ignore your feeble threats.',
  }
);
