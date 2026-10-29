// The player's build options (#690, #691), from the page's options to the game's rules: the page sends both, as booleans,
//  whatever is stored; the client sets them for its own player, and only ever booleans; and a client that stops
//  listening sets nothing more.

import BuildPreferencesRegistry from '@civ-clone/core-city-build/BuildPreferencesRegistry';
import Player from '@civ-clone/core-player/Player';
import { instance as options } from '../../src/js/UI/GameOptionsRegistry';
import registerBuildPreferences from '../../src/js/Engine/Client/buildPreferences';
import sendBuildPreferences from '../../src/js/UI/lib/buildPreferences';

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

// A run that stops before it reports has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      `FAIL buildPreferences: stopped after ${checks} checks, before the end\n`
    );
    process.exitCode = 1;
  }
});

// The page's side.
{
  const sent: [string, unknown][] = [],
    transport = {
      send: (channel: string, data: unknown) => sent.push([channel, data]),
    } as any;

  options.defaults({
    keepBuildingMilitaryUnits: false,
    newCitiesBuildDefender: false,
  });

  sendBuildPreferences(transport);

  expect('both off to begin with', sent.pop(), [
    'buildPreferences',
    { firstBuild: false, repeat: false },
  ]);

  options.set('keepBuildingMilitaryUnits', true);
  sendBuildPreferences(transport);

  expect('one on', sent.pop(), [
    'buildPreferences',
    { firstBuild: false, repeat: true },
  ]);

  options.set('newCitiesBuildDefender', 'yes');
  sendBuildPreferences(transport);

  expect('only true is on', sent.pop(), [
    'buildPreferences',
    { firstBuild: false, repeat: true },
  ]);
}

// The client's side.
{
  let receiver: ((data: any) => void) | null = null;

  const transport = {
      receive: (channel: string, handler: (data: any) => void) => {
        expect('it listens for the build options', channel, 'buildPreferences');

        receiver = handler;

        return () => {
          receiver = null;
        };
      },
    } as any,
    registry = new BuildPreferencesRegistry(),
    player = new Player(),
    other = new Player(),
    dispose = registerBuildPreferences(
      transport,
      { player: () => player },
      registry
    );

  receiver!({ firstBuild: true, repeat: false });

  expect('set for its own player', registry.get(player), {
    firstBuild: true,
    repeat: false,
  });
  expect('and nobody else', registry.get(other), {
    firstBuild: false,
    repeat: false,
  });

  receiver!({ firstBuild: 'yes', repeat: 1 });

  expect('only true is on', registry.get(player), {
    firstBuild: false,
    repeat: false,
  });

  dispose();

  expect('it stops listening', receiver, null);
}

finished = true;

if (failures.length) {
  process.stderr.write(
    `FAIL buildPreferences (${
      failures.length
    } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

console.log(`PASS buildPreferences (${checks} checks)`);
