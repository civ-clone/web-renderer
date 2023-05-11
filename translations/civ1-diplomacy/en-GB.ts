import i18next from "i18next";

i18next.addResources(
  'en-GB',
  'diplomacy',
  {
    'Dialogue.accept-peace.neutral': 'We affirm this treaty of eternal friendship and goodwill between the people of the $t(Generic.civilization-name.name, { "civilization": "{{interaction.by.civilization._}}", "ns": "default" }) and $t(Generic.civilization-name.name, { "civilization": "{{interaction.for.0.civilization._}}", "ns": "default" }) civilisations.',
    'Dialogue.decline-peace.neutral': 'Very well, we will mobilise our armies for WAR! You will pay for your foolish pride!',
    'ExchangeKnowledge': 'We notice that your primitive civilisation has not even discovered $t({{interaction.advances.0._}}.name, { "defaultValue": "{{interaction.advances.0._}}", "ns": "science" }). Do you care to exchange knowledge with us?',
  }
);
