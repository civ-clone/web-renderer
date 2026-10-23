import i18next from "i18next";

i18next.addResources(
  'en-GB',
  'diplomacy',
  {
    'Dialogue.accept-peace.neutral': 'We affirm this treaty of eternal friendship and goodwill between the people of the $t(Generic.civilization-name.name, { "civilization": "{{interaction.by.civilization._}}", "ns": "default" }) and $t(Generic.civilization-name.name, { "civilization": "{{interaction.for.0.civilization._}}", "ns": "default" }) civilisations.',
    'Dialogue.declare-war.mobilize': 'Very well, we will mobilise our armies for WAR! You will pay for your foolish pride!',
    'CancelTreaty': 'The $t(Generic.civilization-name.plural, { "civilization": "{{interaction.with.civilization._}}", "ns": "default" }) are our enemies. Cancel your treaty with them, and we will remember the favour.',
    'ExchangeKnowledge': 'We notice that your primitive civilisation has not even discovered $t({{interaction.advances.0._}}.name, { "defaultValue": "{{interaction.advances.0._}}", "ns": "science" }). Do you care to exchange knowledge with us?',
  }
);
