// A sidebar section collapses and expands from its heading, a button (so Enter and Space work as a click does), and
//  a collapsed section is still collapsed after a reload, from the client options in browser storage (#697). A section
//  collapsed by default (the cities and scores, #700, #701) starts collapsed, and once opened stays open after a
//  reload, kept in an option of its own so the stored `sidebarCollapsed` means what it did.

// Must stay first: the components read `document` as they load.
import './lib/dom';

import GameOptionsRegistry, {
  OptionStorage,
} from '../../src/js/UI/GameOptionsRegistry';
import SidebarSection from '../../src/js/UI/components/SidebarSection';

const failures: string[] = [];
let checks = 0;

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

const items: { [key: string]: string } = {},
  storage: OptionStorage = {
    getItem: (key: string) => items[key] ?? null,
    setItem: (key: string, value: string) => {
      items[key] = value;
    },
  },
  pageLoad = () => {
    const registry = new GameOptionsRegistry(() => storage);

    registry.defaults({ sidebarCollapsed: [], sidebarExpanded: [] });

    return registry;
  },
  state = (section: SidebarSection) => {
    const button = section.element().querySelector('button') as HTMLElement;

    return {
      expanded: button.getAttribute('aria-expanded'),
      hidden: section.body().hidden,
    };
  };

{
  const options = pageLoad(),
    content = document.createElement('p'),
    world = new SidebarSection('world', 'World', [content], options),
    unit = new SidebarSection('unit', 'Active <Unit>', [], options),
    button = world.element().querySelector('button') as HTMLButtonElement;

  document.body.append(world.element(), unit.element());

  expect(
    'the heading is the title, as text',
    unit.element().textContent,
    'Active <Unit>'
  );
  expect(
    'the content is in the body',
    content.parentElement === world.body(),
    true
  );
  expect(
    'the heading controls the body',
    button.getAttribute('aria-controls'),
    world.body().id
  );
  expect('a section starts expanded', state(world), {
    expanded: 'true',
    hidden: false,
  });

  button.click();

  expect('a click collapses it', state(world), {
    expanded: 'false',
    hidden: true,
  });
  expect('and stores its key', options.get('sidebarCollapsed'), ['world']);

  unit.setCollapsed(true);

  expect('another is stored beside it', options.get('sidebarCollapsed'), [
    'world',
    'unit',
  ]);

  // Enter and Space press a button as a click does, so the keyboard takes this path too.
  button.click();

  expect('a second click expands it again', state(world), {
    expanded: 'true',
    hidden: false,
  });
  expect('and only its own key goes', options.get('sidebarCollapsed'), [
    'unit',
  ]);
}

{
  const options = pageLoad(),
    world = new SidebarSection('world', 'World', [], options),
    unit = new SidebarSection('unit', 'Active Unit', [], options);

  expect('after a reload, a collapsed section stays collapsed', state(unit), {
    expanded: 'false',
    hidden: true,
  });
  expect('and an expanded one stays expanded', state(world), {
    expanded: 'true',
    hidden: false,
  });
}

{
  const options = new GameOptionsRegistry(() => null);

  options.defaults({ sidebarCollapsed: [] });

  const world = new SidebarSection('world', 'World', [], options);

  world.setCollapsed(true);

  expect('with no storage, it still collapses', world.collapsed(), true);
}

{
  const options = pageLoad(),
    scores = new SidebarSection('scores', 'Scores', [], options, {
      collapsedByDefault: true,
    });
  let toggled = 0;

  scores.element().addEventListener('sidebar-section-toggle', () => toggled++);

  expect('a section collapsed by default starts collapsed', state(scores), {
    expanded: 'false',
    hidden: true,
  });

  (scores.element().querySelector('button') as HTMLButtonElement).click();

  expect('a click opens it', state(scores), {
    expanded: 'true',
    hidden: false,
  });
  expect('and says so', toggled, 1);
  expect('which is stored as opened', options.get('sidebarExpanded'), [
    'scores',
  ]);
  expect(
    'leaving the collapsed sections as they were',
    options.get('sidebarCollapsed'),
    ['unit']
  );
}

{
  const options = pageLoad(),
    scores = new SidebarSection('scores', 'Scores', [], options, {
      collapsedByDefault: true,
    }),
    cities = new SidebarSection('cities', 'Cities', [], options, {
      collapsedByDefault: true,
    });

  expect('after a reload, the one opened is still open', state(scores), {
    expanded: 'true',
    hidden: false,
  });
  expect('and the other still collapsed', state(cities), {
    expanded: 'false',
    hidden: true,
  });

  scores.setCollapsed(true);

  expect(
    'collapsed again, it is no longer stored as opened',
    options.get('sidebarExpanded'),
    []
  );
}

if (failures.length) {
  process.stderr.write(
    `FAIL sidebarSection\n${failures
      .map((failure) => `  ${failure}`)
      .join('\n')}\n`
  );
  process.exit(1);
}

console.log(`PASS sidebarSection (${checks} checks)`);
