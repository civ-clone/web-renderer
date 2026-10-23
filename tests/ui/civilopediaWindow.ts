// The Civilopedia window (#183) draws what the engine sends: an index by section, and an entry's page with its
//  requirements in words, each class a link. Following "Needs Gunpowder" from Musketmen shows Gunpowder, Back returns,
//  and an entry on a base class (`Naval`) or a condition reads as words. The build list's Can't build window words each
//  refusing rule from its requirement entry, says "not available" for a rule without one, and links each item.

// Must stay first: `Window.ts` reads `document.body` as it loads.
import { document } from './lib/dom';

import Civilopedia, {
  CivilopediaData,
  entryHtml,
} from '../../src/js/UI/components/Civilopedia';
import CityBuildUnavailableWindow, {
  reasons,
} from '../../src/js/UI/components/CityBuildUnavailableWindow';
import { CivilopediaEntry } from '../../src/js/Engine/lib/civilopedia';
import { RequirementData } from '../../src/js/Engine/lib/requirements';
import i18next from 'i18next';
import i18nOptions from '../../src/js/UI/app/i18nOptions';

const failures: string[] = [];
let checks = 0,
  finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

// A suite that stops before its checks would otherwise pass in silence (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      `FAIL civilopedia-window: stopped after ${checks} checks\n`
    );
    process.exitCode = 1;
  }
});

const entry = (
    key: string,
    kind: CivilopediaEntry['kind'],
    values: Partial<CivilopediaEntry> = {}
  ): CivilopediaEntry => ({
    key,
    name: key,
    kind,
    requires: [],
    leadsTo: [],
    cost: null,
    stats: null,
    ...values,
  }),
  requirement = (
    id: string,
    subject: string,
    relation: RequirementData['relation'],
    targets: RequirementData['targets'],
    values: Partial<RequirementData> = {}
  ): RequirementData => ({
    id,
    subject,
    relation,
    targets,
    mode: 'all',
    range: 'player',
    where: null,
    ...values,
  });

const requirements = [
    requirement('musketman/requires', 'Musketman', 'requires', [
      { class: 'Gunpowder' },
    ]),
    requirement('musketman/obsolete', 'Musketman', 'obsoletedBy', [
      { class: 'Conscription' },
    ]),
    requirement('musketman/replaced', 'Musketman', 'replacedBy', [
      { class: 'Rifleman' },
    ]),
    requirement('naval/coast', 'Naval', 'requires', [
      { condition: 'civ1-unit:coastal-city' },
    ]),
    requirement(
      'pyramids/obsolete',
      'Pyramids',
      'obsoletedBy',
      [{ class: 'Electricity' }],
      { range: 'world' }
    ),
    requirement('irrigation/available', 'Irrigation', 'requires', [], {
      range: 'tile',
      where: ['Desert', 'Grassland'],
    }),
  ],
  entries = [
    entry('Musketman', 'unit', {
      requires: [
        'musketman/requires',
        'musketman/obsolete',
        'musketman/replaced',
      ],
      cost: 30,
      stats: { attack: 2, defence: 3, movement: 1 },
    }),
    entry('Trireme', 'unit', { requires: ['naval/coast'] }),
    entry('Gunpowder', 'advance', { leadsTo: ['musketman/requires'] }),
    entry('Conscription', 'advance', { leadsTo: ['musketman/obsolete'] }),
    entry('Electricity', 'advance', { leadsTo: ['pyramids/obsolete'] }),
    entry('Rifleman', 'unit', { leadsTo: ['musketman/replaced'] }),
    entry('Pyramids', 'wonder', { requires: ['pyramids/obsolete'] }),
    entry('Irrigation', 'tileImprovement', {
      requires: ['irrigation/available'],
    }),
    entry('Desert', 'terrain'),
    entry('Grassland', 'terrain'),
  ],
  data: CivilopediaData = {
    entries: new Map(entries.map((entry) => [entry.key, entry])),
    requirements: new Map(
      requirements.map((requirement) => [requirement.id, requirement])
    ),
  };

// The page's text, without the markup.
const text = (html: string): string => {
    const element = document.createElement('div');

    element.innerHTML = html;

    return element.textContent ?? '';
  },
  links = (html: string): string[] =>
    Array.from(html.matchAll(/data-key="([^"]+)"/g), ([, key]) => key);

const wait = () => new Promise((resolve) => setTimeout(resolve, 0));

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  await import('../../translations/local/en');
  await import('../../translations/civ1-unit/en');
  await import('../../translations/civ1-science/en');
  await import('../../translations/civ1-wonder/en');
  await import('../../translations/civ1-world/en');

  const musketman = entryHtml(data.entries.get('Musketman')!, data);

  expect(
    "Musketmen's page: numbers, cost, what they need and what replaces them",
    text(musketman),
    'MusketmanUnitAttack: 2 · Defense: 3 · Moves: 1 · Cost: 30RequirementsNeeds GunpowderObsolete with ConscriptionReplaced by Rifleman'
  );
  expect('each class a link to its entry', links(musketman), [
    'Gunpowder',
    'Conscription',
    'Rifleman',
  ]);
  expect(
    'what Gunpowder leads to',
    text(entryHtml(data.entries.get('Gunpowder')!, data)),
    'GunpowderCivilization AdvanceLeads toAllows Musketman'
  );
  expect(
    'a ship needs a coastal city, through an entry on Naval',
    text(entryHtml(data.entries.get('Trireme')!, data)),
    'TriremeUnitRequirementsNeeds a coastal city'
  );
  expect(
    'a world-wide entry says so',
    text(entryHtml(data.entries.get('Pyramids')!, data)).includes(
      'Obsolete with Electricity, once any civilization has it'
    ),
    true
  );
  expect(
    'a tile improvement says where it goes, and a terrain what goes on it',
    [
      text(entryHtml(data.entries.get('Irrigation')!, data)).includes(
        'Can be built on Desert and Grassland'
      ),
      text(entryHtml(data.entries.get('Desert')!, data)).includes(
        'Can be built hereIrrigation'
      ),
    ],
    [true, true]
  );

  // The window itself, with a transport that answers from the data above.
  const transport = {
      request: async (request: { channel(): string }) => {
        const channel = request.channel();

        if (channel === 'getCivilopedia') {
          return entries;
        }

        if (channel === 'getRequirements') {
          return requirements;
        }

        if (channel === 'cityBuildUnavailable') {
          return [
            {
              key: 'Musketman',
              name: 'Musketman',
              refusedBy: ['musketman/requires', 'civ1-unit:some-other-rule'],
            },
          ];
        }

        throw new Error(`unexpected request ${channel}`);
      },
    } as any,
    window = new Civilopedia(transport);

  await wait();

  const body = window.element(),
    click = (selector: string): void =>
      (body.querySelector(selector) as HTMLElement).click();

  expect(
    'the index lists each section that has entries',
    Array.from(
      body.querySelectorAll('.index-section h4'),
      (heading) => heading.textContent
    ),
    [
      'Civilization Advances',
      'Wonders of the World',
      'Units',
      'Tile Improvements',
      'Terrain Types',
    ]
  );

  click('.index a[data-key="Musketman"]');

  expect('a link in the index shows its entry', window.shown(), 'Musketman');

  click('.entry a[data-key="Gunpowder"]');

  expect('a link on a page shows that entry', window.shown(), 'Gunpowder');

  click('.entry button.back');

  expect('Back returns to the entry before', window.shown(), 'Musketman');

  click('.entry button.back');

  expect('and then to the index', window.shown(), null);

  window.close();

  expect(
    'opening at an entry shows it',
    await (async () => {
      const opened = new Civilopedia(transport, 'Pyramids');

      await wait();

      const shown = opened.shown();

      opened.close();

      return shown;
    })(),
    'Pyramids'
  );

  expect(
    'the Can’t build window words a rule with an entry, and folds one without',
    reasons(
      {
        key: 'Musketman',
        name: 'Musketman',
        refusedBy: ['musketman/requires', 'one', 'two'],
      },
      data
    ).map(text),
    ['Needs Gunpowder']
  );
  expect(
    'and says only "not available" when no rule that refuses it has an entry',
    reasons(
      { key: 'Musketman', name: 'Musketman', refusedBy: ['one'] },
      data
    ).map(text),
    ['Not available in this city']
  );

  const unavailable = new CityBuildUnavailableWindow(
    {
      id: 'city-build-1',
      city: {
        name: 'Rome',
        originalPlayer: { civilization: { _: 'Roman' } },
      },
    } as any,
    transport
  );

  await wait();

  expect(
    'and lists each item with its reasons, linked to the Civilopedia',
    [
      unavailable.element().querySelector('.item a')?.getAttribute('data-key'),
      Array.from(
        unavailable.element().querySelectorAll('.reasons li'),
        (reason) => reason.textContent
      ),
    ],
    ['Musketman', ['Needs Gunpowder']]
  );

  (unavailable.element().querySelector('.item a') as HTMLElement).click();

  await wait();

  const opened = Array.from(
    document.querySelectorAll('dialog.window.civilopedia')
  );

  expect(
    'following an item opens the Civilopedia at its entry',
    opened.length > 0 &&
      opened[opened.length - 1]
        .querySelector('.entry')
        ?.getAttribute('data-key'),
    'Musketman'
  );

  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL civilopedia-window (${
        failures.length
      } of ${checks})\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS civilopedia-window (${checks} checks)\n`);
  process.exit(0);
};

run().catch((error) => {
  process.stderr.write(`FAIL civilopedia-window: ${error?.stack ?? error}\n`);
  process.exit(1);
});
