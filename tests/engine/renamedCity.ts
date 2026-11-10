// A renamed city's new name is kept from later cities by the rules (#876), not by the page's worker, which used to
//  claim it itself after renaming the city: any other way of renaming one left the name free to be given again.
//
// With the plugins the game is built with, `City#setName` on a real city claims the new name in the game's city names,
// and the worker's own `RenameCity` (tests/engine/clientHandleAction.ts) only renames.

// Must stay first: it seeds the engine's random source before any engine module evaluates.
import './lib/seed';

import City from '@civ-clone/core-city/City';
import Renamed from '@civ-clone/core-city/Rules/Renamed';
import { instance as cityNames } from '@civ-clone/core-civilization/CityNameRegistry';
import { instance as rules } from '@civ-clone/core-rule/RuleRegistry';

const failures: string[] = [];
let checks = 0;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  const [a, e] = [actual, expected].map((value) => JSON.stringify(value));

  if (a !== e) {
    failures.push(`${description}\n    expected: ${e}\n    actual:   ${a}`);
  }
};

const taken = (): string[] => cityNames.taken().map((name) => name.name());

import('../../src/js/plugins')
  .then((): void => {
    expect(
      'the rules the game is built with answer a city being renamed',
      rules.get(Renamed).length > 0,
      true
    );

    // A city as far as its name goes: `City#setName` is all of `City` that this needs, and making a whole one would
    //  found it.
    const city = Object.assign(Object.create(City.prototype), {
      _name: 'Thebes',
      _ruleRegistry: rules,
    }) as City;

    const before = taken();

    city.setName('Akkad');

    expect(
      'a city renamed has its new name taken, so no later city is given it',
      taken().filter((name) => !before.includes(name)),
      ['Akkad']
    );

    city.setName('Akkad');

    expect(
      'the same name again takes nothing more',
      taken().filter((name) => name === 'Akkad').length,
      1
    );

    if (failures.length > 0) {
      process.stderr.write(
        `FAIL renamedCity (${
          failures.length
        } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
      );
      process.exit(1);
    }

    process.stdout.write(`PASS renamedCity (${checks} checks)\n`);
    process.exit(0);
  })
  .catch((error) => {
    process.stderr.write(`FAIL renamedCity: ${error.stack ?? error}\n`);
    process.exit(1);
  });
