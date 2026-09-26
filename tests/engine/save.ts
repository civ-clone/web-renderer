// Stage 5's acceptance checks, against a real game.
//
// The three properties 03-save-format.md asks for are round-trip identity,
// replay equivalence and no-op suppression. Two of them are here; replay
// equivalence is not, and the reason is reported rather than skipped quietly —
// see the note at the end of the run.

// Must stay first: seeds `Math.random` before any engine module evaluates.
import { config } from './lib/seed';

import Built from '@civ-clone/core-world/Rules/Built';
import { Game } from '@civ-clone/core-game/Game';
import Player from '@civ-clone/core-player/Player';
import { SaveError } from '@civ-clone/core-save-game/SaveGame';
import SimpleAIClient from '@civ-clone/simple-ai-client/SimpleAIClient';
import Effect from '@civ-clone/core-rule/Effect';
import { defaultGame, defaultSlots } from '@civ-clone/core-game/defaultGame';
import { gameForLoad } from '@civ-clone/core-save-game/gameForLoad';
import { hydrate } from '@civ-clone/core-save-game/hydrate';
import { instance as clientRegistryInstance } from '@civ-clone/core-client/ClientRegistry';
import { instance as engine } from '@civ-clone/core-engine/Engine';
import { instance as playerRegistryInstance } from '@civ-clone/core-player/PlayerRegistry';
import { instance as ruleRegistryInstance } from '@civ-clone/core-rule/RuleRegistry';
import { PendingEffect } from '@civ-clone/core-pending-effect';
import StrategyNote from '@civ-clone/core-strategy/StrategyNote';
import Tile from '@civ-clone/core-world/Tile';
import Unit from '@civ-clone/core-unit/Unit';
import BusyGoTo from '@civ-clone/base-unit-action-goto/Busy/GoTo';
import { Carrier, Fighter } from '@civ-clone/civ1-unit/Units';
import { LandAircraft } from '@civ-clone/civ1-unit/Actions';
import Stowed from '@civ-clone/base-unit-action-embark/Busy/Stowed';
import { generateKey, goToBusy } from '@civ-clone/base-unit-action-goto/GoTo';
import { instance as unitRegistryInstance } from '@civ-clone/core-unit/UnitRegistry';
import { registerClasses } from '@civ-clone/core-save-game/registerClasses';
import { save } from '@civ-clone/core-save-game/save';
import City from '@civ-clone/core-city/City';
import {
  changeSpecialist,
  changeWorkedTile,
} from '@civ-clone/civ1-city/lib/assignWorkers';

const TURNS = 12;

const checks: [string, () => unknown, unknown][] = [];
const notes: string[] = [];

// Collected rather than thrown, so one ambiguous name does not hide the rest.
// A collected name is simply absent from the registry, so a save that uses one
// fails to load rather than loading the wrong class.
const collisions: string[] = [];

const push = (
  label: string,
  actual: () => unknown,
  expected: unknown
): void => {
  checks.push([label, actual, expected]);
};

let stopped = false;
const LOOP = ['player:turn-end', 'player:turn-start', 'turn:end', 'turn:start'];
const emitDirect = engine.emit.bind(engine);

engine.emit = (event: string, ...args: any[]): void => {
  if (stopped && LOOP.includes(event)) {
    return;
  }

  emitDirect(event, ...args);
};

const report = (): void => {
  // The host is what knows the loaded packages and their versions, so it is
  // what registers the manifest. Without one, `save` refuses — an empty
  // manifest means "cannot check", not "nothing loaded".
  engine.registerPlugins({ '@civ-clone/core-game': '0.1.2' });

  notes.push(
    `${defaultGame.classes.length} classes registered at boot; ` +
      `${collisions.length} ambiguous name(s) refused` +
      (collisions.length
        ? `: ${[...new Set(collisions)].sort().join(', ')}`
        : '')
  );

  // --- a unit mid-journey -------------------------------------------------
  // `GoTo` was the last `Busy` state that could not be saved, and the reason
  // was two steps back: its criterion compares against a `Path` held in a
  // `StrategyNote`, and `StrategyNote` was not a `DataObject`, so nothing in
  // `strategyNotes` ever reached the file despite the slot being dispositioned
  // as runtime state.
  //
  // Built here rather than by issuing a real `GoTo`, so the check does not
  // depend on the AI happening to order one — but with the same pieces
  // `GoTo.perform` uses, including the exported factory.
  let journeying: Unit | undefined;
  let destination: Tile | undefined;

  const journeyStarted = ((): string => {
    try {
      [journeying] = unitRegistryInstance.entries();

      if (!journeying) {
        return 'no units in the game';
      }

      const here = journeying.tile();
      const [next] = here.getNeighbours();

      destination = next ?? here;

      defaultGame.strategyNotes.replace(
        new StrategyNote(generateKey(journeying), [here, destination])
      );
      journeying.setBusy(goToBusy(journeying, defaultGame.strategyNotes));

      // And a debt owed to it. Stage 5 refused any save carrying one, because
      // effects had no saveable shape yet; they are ordinary entities now, so
      // what was a refusal check is a round trip.
      defaultGame.pendingEffects.register(
        new PendingEffect('save-suite:owed', journeying, { endTurn: '41' })
      );

      return 'ok';
    } catch (error) {
      return (error as Error).message;
    }
  })();

  push('a unit can be put on a journey', () => journeyStarted, 'ok');

  // An aircraft landed on a Carrier (#81). Landing stows it and marks it
  // `Stowed`, so the save has to carry the manifest and rebuild the busy rule,
  // or the aircraft loads back in mid-air and is lost when its fuel runs out.
  let carrier: Unit | undefined;
  let fighter: Unit | undefined;

  const landed = ((): string => {
    try {
      const player = (journeying as Unit).player();
      const water = (journeying as Unit)
        .tile()
        .map()
        .entries()
        .find(
          (tile) =>
            tile.isWater() &&
            unitRegistryInstance.getByTile(tile).length === 0 &&
            tile.getNeighbours().some((neighbour) => neighbour.isWater())
        );

      if (!water) {
        return 'no open water';
      }

      const [takeOff] = water
        .getNeighbours()
        .filter((neighbour) => neighbour.isWater());

      carrier = new Carrier(null, player, water, ruleRegistryInstance);
      fighter = new Fighter(null, player, takeOff, ruleRegistryInstance);

      [carrier, fighter]
        .filter((unit) => !unitRegistryInstance.includes(unit))
        .forEach((unit) => unitRegistryInstance.register(unit));

      const land = fighter
        .actions(water)
        .find((action) => action instanceof LandAircraft);

      if (!land) {
        return `no LandAircraft, only ${fighter
          .actions(water)
          .map((action) => action.constructor.name)
          .join(', ')}`;
      }

      fighter.action(land);

      return defaultGame.transports.hasUnit(fighter)
        ? 'ok'
        : 'the fighter was not stowed';
    } catch (error) {
      return (error as Error).message;
    }
  })();

  push('an aircraft can land on a Carrier', () => landed, 'ok');

  // Specialists (#84). A citizen taken off a tile becomes an Entertainer, and
  // clicking one changes its kind, which is its class, so the save has to
  // carry the entities and resolve each class by name.
  let specialistCity: City | undefined;

  const specialised = ((): string => {
    try {
      specialistCity = defaultGame.cities
        .entries()
        .find((city) => city.tilesWorked().length >= 3);

      if (!specialistCity) {
        return 'no city working two tiles';
      }

      const centre = specialistCity.tile(),
        [first, second] = specialistCity
          .tilesWorked()
          .entries()
          .filter((tile) => tile !== centre),
        changes = [first, second].map((tile) =>
          changeWorkedTile(specialistCity as City, tile)
        );

      if (changes.some((change) => change !== 'removed')) {
        return `taking tiles off gave ${changes.join(', ')}`;
      }

      const [entertainer, other] =
        defaultGame.specialists.getByCity(specialistCity);

      if (!entertainer || !other) {
        return 'taking two tiles off did not make two specialists';
      }

      changeSpecialist(changeSpecialist(other));
      changeSpecialist(entertainer);

      return 'ok';
    } catch (error) {
      return (error as Error).message;
    }
  })();

  push('citizens can be made specialists', () => specialised, 'ok');
  push(
    'as a Tax collector and a Scientist',
    () =>
      specialistCity
        ? defaultGame.specialists
            .getByCity(specialistCity)
            .map((specialist) => specialist.constructor.name)
            .sort()
        : null,
    ['Scientist', 'TaxCollector']
  );

  // --- what a save of a real game actually contains -----------------------
  // `save` refuses rather than writing something unloadable, so a refusal is
  // the measurement — report it and stop, instead of crashing the run.
  let first: ReturnType<typeof save>;

  try {
    first = save(defaultGame, { name: 'acceptance', createdAt: 0 });
  } catch (error) {
    push('save succeeds', () => (error as Error).message, 'ok');

    checks.forEach(([label, actual, expected]) => {
      const result = actual();

      process.stdout.write(
        `  FAIL ${label.padEnd(52)} ${JSON.stringify(
          result
        )} (expected ${JSON.stringify(expected)})\n`
      );
    });

    process.stdout.write(
      `\n  ${notes.join('\n  ')}\n\n0/${checks.length} — save and load\n`
    );
    process.exit(1);
  }

  const json = JSON.stringify(first);
  const gzipped = require('zlib').gzipSync(json).length;

  notes.push(
    `${first.entities.length} entities, ${
      Object.keys(first.registries).length
    } ` +
      `registries, ${(json.length / 1024).toFixed(0)}KB JSON, ` +
      `${(gzipped / 1024).toFixed(0)}KB gzipped`
  );

  const types = [...new Set(first.entities.map(({ type }) => type))].sort();
  const unresolvable = types.filter((type) => !defaultGame.classes.get(type));

  // A `$class` with no name can never be decoded, so find out whose it is.
  const anonymous = first.entities
    .flatMap((entity) =>
      Object.entries(entity.state)
        .filter(([, value]) => JSON.stringify(value)?.includes('"$class":""'))
        .map(([field]) => `${entity.type}.${field}`)
    )
    .filter((x, i, all) => all.indexOf(x) === i);

  if (anonymous.length > 0) {
    notes.push(`unnameable classes in: ${anonymous.slice(0, 8).join(', ')}`);
  }

  if (process.env.SAVE_DUMP_TYPES) {
    // A debugging aid, like the conformance suite's `CONFORMANCE_DUMP`: the
    // type list is what says whether a class is reached at all.
    notes.push(`types: ${types.join(', ')}`);
  }

  notes.push(
    `${types.length} distinct entity types; ${unresolvable.length} not ` +
      `resolvable from the class registries${
        unresolvable.length
          ? `: ${unresolvable.slice(0, 12).join(', ')}${
              unresolvable.length > 12 ? ` …(${unresolvable.length})` : ''
            }`
          : ''
      }`
  );

  // A 150-turn save must be under 1MB gzipped. This is turn 12 on the
  // conformance world, so it is an early read rather than the answer.
  push(`under 1MB gzipped at turn ${TURNS}`, () => gzipped < 1024 * 1024, true);

  const loadTarget = (): Game => {
    const game = gameForLoad(defaultSlots);

    registerClasses(game, { collisions: [] });

    return game;
  };

  // --- no-op suppression --------------------------------------------------
  // Loading must not emit the events that mean "this just happened". A
  // regression here sprays a half-loaded game at the renderer.
  const emitted: string[] = [];
  const watched = [
    'city:created',
    'unit:created',
    'city:captured',
    'player:added',
    'tile:improvement:built',
  ];

  engine.emit = (event: string, ...args: any[]): void => {
    if (stopped && LOOP.includes(event)) {
      return;
    }

    if (watched.includes(event)) {
      emitted.push(event);
    }

    emitDirect(event, ...args);
  };

  const target = loadTarget();

  let loadError: Error | null = null;

  try {
    hydrate(first, target);
  } catch (error) {
    loadError = error as Error;
  }

  push('hydrate succeeds', () => loadError?.message ?? 'ok', 'ok');
  push('loading emits no creation events', () => [...new Set(emitted)], []);

  // The journey, after the round trip. `_busy` holds a rule, so the save
  // carries only the identity and `BusyRegistry` rebuilds it — and the rule is
  // only rebuildable because the path it reads now survives as saved state.
  const restored = journeying
    ? target.units.entries().find((unit) => unit.id() === journeying?.id())
    : undefined;

  push('the journeying unit comes back', () => restored !== undefined, true);
  push(
    'and is still following its path',
    () => restored?.busy() instanceof BusyGoTo,
    true
  );

  const restoredNote = journeying
    ? target.strategyNotes.getByKey<Tile[]>(generateKey(journeying))
    : undefined;

  const restoredEffect = journeying
    ? target.pendingEffects
        .entries()
        .find((effect) => effect.handler() === 'save-suite:owed')
    : undefined;

  push(
    'a pending effect comes back as an entity',
    () => restoredEffect !== undefined,
    true
  );
  push(
    'owed to the same unit, with its data',
    () => [restoredEffect?.target()?.id(), restoredEffect?.data().endTurn],
    [journeying?.id(), '41']
  );
  push(
    'and the legacy top-level field is no longer written',
    () => 'pendingEffects' in first,
    false
  );

  push('the path comes back as a note', () => restoredNote !== undefined, true);
  push(
    'as real `Tile`s and not `$ref` strings',
    () => restoredNote?.value().every((tile) => tile instanceof Tile),
    true
  );
  push(
    'ending where it ended before',
    () => restoredNote?.value().at(-1)?.id(),
    destination?.id()
  );
  // The point of the whole exercise: the rebuilt rule reads the restored note,
  // so it knows the journey is unfinished.
  push(
    'and the rebuilt rule still says the unit is going somewhere',
    () => restored?.busy()?.validate(restored as never) === false,
    true
  );

  // The specialists, after the round trip.
  push(
    'the specialists come back as the same kinds',
    () => {
      const restoredCity = target.cities
        .entries()
        .find((city) => city.id() === specialistCity?.id());

      return restoredCity
        ? target.specialists
            .getByCity(restoredCity)
            .map((specialist) => specialist.constructor.name)
            .sort()
        : null;
    },
    ['Scientist', 'TaxCollector']
  );

  // The aircraft on the Carrier, after the round trip.
  const restoredFighter = fighter
    ? target.units.entries().find((unit) => unit.id() === fighter?.id())
    : undefined;

  push(
    'the landed aircraft comes back',
    () => restoredFighter !== undefined,
    true
  );
  push(
    'still aboard the same Carrier',
    () =>
      restoredFighter && target.transports.hasUnit(restoredFighter)
        ? target.transports.getByUnit(restoredFighter).transport().id()
        : null,
    carrier?.id()
  );
  push(
    'and still `Stowed`',
    () => restoredFighter?.busy() instanceof Stowed,
    true
  );

  // --- round-trip identity ------------------------------------------------
  // Save, load, save again: the two must be identical. This is the check that
  // catches a dropped field, because a field missing from `stateKeys()` is
  // absent from both saves and a field dropped by `encode` is absent from the
  // second.
  if (!loadError) {
    const second = save(target, { name: 'acceptance', createdAt: 0 });

    push(
      'round-trip: same entity count',
      () => second.entities.length,
      first.entities.length
    );
    // Compared by hash: the membership lists run to several thousand ids, and
    // printing them on every run buries everything else in the output.
    const membership = (file: typeof first): string =>
      `${Object.keys(file.registries).length} registries, ${Object.values(
        file.registries
      ).reduce((total, ids) => total + ids.length, 0)} members`;

    push(
      'round-trip: same registry membership',
      () =>
        JSON.stringify(second.registries) === JSON.stringify(first.registries)
          ? membership(second)
          : `differs: ${membership(second)} vs ${membership(first)}`,
      membership(first)
    );
    push(
      'round-trip: byte-identical',
      () => JSON.stringify(second) === json,
      true
    );

    if (JSON.stringify(second) !== json) {
      // Say *where*, rather than only that they differ.
      const a = first.entities;
      const b = new Map(second.entities.map((entity) => [entity.id, entity]));
      const differing = a
        .filter(
          (entity) =>
            JSON.stringify(b.get(entity.id)) !== JSON.stringify(entity)
        )
        .slice(0, 3);

      differing.forEach((entity) => {
        const other = b.get(entity.id);

        notes.push(
          `  first difference — ${entity.id} (${entity.type}): ` +
            `${other ? 'differs' : 'missing from the second save'}`
        );

        if (other) {
          Object.keys(entity.state).forEach((field) => {
            if (
              JSON.stringify(entity.state[field]) !==
              JSON.stringify(other.state[field])
            ) {
              notes.push(
                `    .${field}: ${JSON.stringify(entity.state[field])?.slice(
                  0,
                  70
                )}` + ` -> ${JSON.stringify(other.state[field])?.slice(0, 70)}`
              );
            }
          });
        }
      });
    }
  }

  // --- the compatibility tiers -------------------------------------------
  push(
    'refuses an unreadable format',
    () => {
      try {
        hydrate({ ...first, format: 99 } as never, loadTarget());

        return 'accepted';
      } catch (error) {
        return error instanceof SaveError ? 'refused' : 'wrong error';
      }
    },
    'refused'
  );

  push(
    'refuses a save needing a plugin that is not loaded',
    () => {
      const missing = {
        ...first,
        engine: {
          ...first.engine,
          plugins: {
            ...first.engine.plugins,
            '@civ-clone/not-loaded': '1.0.0',
          },
        },
      };

      try {
        hydrate(missing, loadTarget());

        return 'accepted';
      } catch (error) {
        return (error as Error).message.includes('not-loaded')
          ? 'refused, naming it'
          : `refused, unhelpfully: ${(error as Error).message}`;
      }
    },
    'refused, naming it'
  );

  push(
    'warns on version drift rather than refusing',
    () => {
      const drifted = {
        ...first,
        engine: {
          ...first.engine,
          plugins: Object.fromEntries(
            Object.keys(first.engine.plugins).map((name) => [name, '0.0.1'])
          ),
        },
      };
      const warnings: unknown[] = [];
      const target = loadTarget();

      target.engine.on('save:version-drift', (changed: unknown) =>
        warnings.push(changed)
      );

      try {
        hydrate(drifted, target);
      } catch (error) {
        return `refused: ${(error as Error).message}`;
      }

      return warnings.length > 0 ? 'warned' : 'silent';
    },
    'warned'
  );

  notes.push(
    'replay equivalence is NOT checked: the plugin loader registers rules ' +
      'into `defaultGame` at import, so a loaded game has no rules and cannot ' +
      'be played. Stage 3 built `register(game)` for exactly this, but the ' +
      'generated import list does not expose the register functions.'
  );

  let failures = 0;

  checks.forEach(([label, actual, expected]) => {
    let result: unknown;

    try {
      result = actual();
    } catch (error) {
      result = `threw: ${error instanceof Error ? error.message : error}`;
    }

    const ok = JSON.stringify(result) === JSON.stringify(expected);

    if (!ok) {
      failures += 1;
    }

    process.stdout.write(
      `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(52)} ${JSON.stringify(result)}${
        ok ? '' : ` (expected ${JSON.stringify(expected)})`
      }\n`
    );
  });

  process.stdout.write(`\n${notes.map((note) => `  ${note}`).join('\n')}\n`);
  process.stdout.write(
    `\n${checks.length - failures}/${checks.length} — save and load\n`
  );

  process.exit(failures > 0 ? 1 : 0);
};

ruleRegistryInstance.register(new Built(new Effect((): void => {})));

engine.on('turn:start', (turn: number): void => {
  if (stopped) {
    return;
  }

  if (turn >= TURNS) {
    stopped = true;
    report();
  }
});

// Registered before the handler that creates players, because `civ1-player`
// *unregisters* a civilisation and leader when a player takes one. Registering
// classes after a game has been played therefore misses every claimed
// civilisation — which is a property of when you look, not of the save.
engine.on('engine:start', (): void => {
  registerClasses(defaultGame, { collisions });
});

engine.on('engine:start', (): void => {
  new Array(config.players).fill(0).forEach((): void => {
    const player = new Player();

    playerRegistryInstance.register(player);
    clientRegistryInstance.register(new SimpleAIClient(player));
  });
});

engine.setOption('players', config.players);
engine.setOption('height', config.height);
engine.setOption('width', config.width);

engine.start();

import('../../src/js/plugins')
  .then(() => engine.emit('plugins:load:end'))
  .catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exit(1);
  });
