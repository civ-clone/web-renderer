// What happens on the map, as it happens (packages/worker-client/Client/mapEvents.ts, docs/3d-renderer.md §8), checked
//  with stand-in units, a stand-in view, data filter and transport:
//
// - a move is a step: a `Move` or `SneakMove` to another square, by a unit still there at its end. The `unit:moved`
//   the engine raises after other actions (founding a city, a GoTo's own after its steps, an attack, a unit lost on
//   the way) sends nothing;
// - a move goes with the unit as the page holds it (a rival's by its stand-in), its player, and the squares it left and
//   entered: the player's own always, anyone else's between squares the player knows, one in sight, and everyone's to
//   a watcher of the whole map;
// - a battle: both sides and who won; the player's own always (attacking or attacked), anyone else's between known
//   squares, one side in sight; a defeat that wasn't a battle sends nothing, and a defeat raised twice is sent once;
// - a failure telling of one doesn't escape into the engine's move or attack;
// - disposing removes both listeners.

import registerMapEvents from '@civ-clone/ui-worker-client/Client/mapEvents';
import { MapEvent } from '@civ-clone/ui-protocol/mapEvents';
import { Move } from '@civ-clone/library-unit/Actions/Move';
import { SneakMove } from '@civ-clone/library-unit/Actions/SneakMove';

const failures: string[] = [];
let checks = 0,
  finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  const [a, e] = [actual, expected].map((value) => JSON.stringify(value));

  if (a !== e) {
    failures.push(`${description}\n    expected: ${e}\n    actual:   ${a}`);
  }
};

// A run that stops before it reports has checked nothing (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      'FAIL clientMapEvents: stopped before the checks ran\n'
    );
    process.exitCode = 1;
  }
});

// Players, each with the id the page has for it: a rival's is its stand-in's.
const player = (id: string, pageId: string = id) => ({
    id: () => id,
    pageId,
  }),
  ours = player('Player-1'),
  rival = player('Player-2', 'UnknownPlayer-2'),
  other = player('Player-3', 'UnknownPlayer-3'),
  // Squares on a grid of squares, each `radius` around one being those within that many steps either way, as the
  //  square grid's area is: the scout, two squares in its sight (one and two steps off), a rival's lookout with two known
  //  squares in its sight but not ours, and a square the player has never seen.
  squares: any[] = [],
  tile = (x: number, y: number): any => {
    const within = (radius: number) => (other: any) =>
        Math.max(Math.abs(other.x() - x), Math.abs(other.y() - y)) <= radius,
      square: any = {
        x: () => x,
        y: () => y,
        getSurroundingArea: (radius: number) => ({
          entries: () => squares.filter(within(radius)),
          includes: within(radius),
        }),
      };

    squares.push(square);

    return square;
  },
  scoutSquare = tile(0, 1),
  near = tile(1, 1),
  nearToo = tile(2, 1),
  lookoutSquare = tile(29, 20),
  far = tile(30, 20),
  farToo = tile(31, 20),
  unknown = tile(60, 40),
  // A unit of a type, on a square, with the id the page has for it: a rival's is its stand-in's.
  unitOf = (
    type: string,
    owner: ReturnType<typeof player>,
    on: object,
    pageId: string
  ) => {
    class Type {
      at = on;
      lost = false;
      pageId = pageId;
      player = () => owner;
      tile = () => this.at;
      destroyed = () => this.lost;
    }

    Object.defineProperty(Type, 'name', { value: type });

    return new Type() as any;
  },
  // One of the player's units, which sees two squares: `near` and `nearToo`. The client finds it only by looking far
  //  enough round `nearToo`, two steps off.
  scout = {
    destroyed: () => false,
    player: () => ours,
    visibility: () => ({ value: () => 2 }),
    tile: () => scoutSquare,
  },
  // A rival's unit, which sees `far` and `farToo`: what it sees isn't the player's.
  lookout = {
    destroyed: () => false,
    player: () => rival,
    visibility: () => ({ value: () => 2 }),
    tile: () => lookoutSquare,
  },
  // The player's view, or a watcher's of the whole map, which has no players of its own.
  setUp = (wholeMap = false) => {
    const sent: MapEvent[] = [],
      listeners: [string, (...args: any[]) => void][] = [],
      engine = {
        on: (event: string, listener: (...args: any[]) => void) =>
          listeners.push([event, listener]),
        off: (event: string, listener: (...args: any[]) => void) =>
          listeners.splice(
            listeners.findIndex(([e, l]) => e === event && l === listener),
            1
          ),
      },
      dispose = registerMapEvents(
        engine as any,
        {
          view: {
            owners: () => (wholeMap ? [] : [ours]),
            owns: (owner: object) => !wholeMap && owner === ours,
            tile: (square: object) => (square === unknown ? null : {}),
          },
          units: {
            getByTile: (square: object) =>
              [scout, lookout].filter((unit) => unit.tile() === square),
          },
          // The page's own ids, as the client's filter sends each object.
          dataFilter: () => (object: any) => ({ id: () => object.pageId }),
          transport: {
            send: (channel: string, data: MapEvent) => {
              if (channel === 'mapEvent') {
                sent.push(data);
              }
            },
          },
        } as any
      ),
      emit = (event: string, ...args: unknown[]) =>
        listeners
          .filter(([name]) => name === event)
          .forEach(([, listener]) => listener(...args));

    return { dispose, emit, listeners, sent };
  },
  // An action of `Kind` from one square to another, as the engine raises `unit:moved` after it.
  action = (Kind: any, unit: any, from: object, to: object) =>
    Object.assign(Object.create(Kind.prototype), {
      unit: () => unit,
      from: () => from,
      to: () => to,
    }),
  // Some other action: founding a city, a GoTo's own, an attack.
  Other = class Other {},
  // A step: the unit is on `to` once it's made, as the engine leaves it before `unit:moved`.
  step = (
    emit: (event: string, ...args: unknown[]) => void,
    unit: any,
    from: object,
    to: object,
    Kind: any = Move
  ) => {
    unit.at = to;
    emit('unit:moved', unit, action(Kind, unit, from, to));
  },
  moved = (id: string, type: string, owner: string, from: any, to: any) => ({
    kind: 'moved',
    unit: {
      id,
      type,
      player: owner,
      tile: { x: from.x(), y: from.y() },
    },
    from: { x: from.x(), y: from.y() },
    to: { x: to.x(), y: to.y() },
  }),
  attack = (attacker: any) => ({ unit: () => attacker } as any);

// Moves.
{
  const { emit, sent } = setUp(),
    settlers = unitOf('Settlers', ours, near, 'Settlers-1'),
    explorer = unitOf('Explorer', ours, far, 'Explorer-1'),
    legion = unitOf('Legion', rival, near, 'UnknownUnit-7'),
    trireme = unitOf('Trireme', rival, far, 'UnknownUnit-8'),
    horsemen = unitOf('Horsemen', rival, nearToo, 'UnknownUnit-9'),
    archers = unitOf('Archers', rival, far, 'UnknownUnit-17'),
    diplomat = unitOf('Diplomat', ours, near, 'Diplomat-1');

  // Our Settlers' step, and our Explorer's far from anything we see: ours, so both sent.
  step(emit, settlers, near, nearToo);
  step(emit, explorer, far, farToo);
  // A rival's Legion leaves a square we see for a known one we don't: sent.
  step(emit, legion, near, far);
  // A rival's Trireme between known squares we don't see, though its own lookout does: not sent.
  step(emit, trireme, far, farToo);
  // A rival's Archers onto the square two steps from our scout: sent.
  step(emit, archers, far, nearToo);
  // A rival's Horsemen, seen leaving, onto a square we've never seen: not sent, which would tell us of it.
  step(emit, horsemen, nearToo, unknown);
  // Our Diplomat sneaks across a border: a step, sent.
  step(emit, diplomat, near, nearToo, SneakMove);

  expect(
    "steps: ours always, a rival's between known squares, one in sight, by the page's ids",
    sent,
    [
      moved('Settlers-1', 'Settlers', 'Player-1', near, nearToo),
      moved('Explorer-1', 'Explorer', 'Player-1', far, farToo),
      moved('UnknownUnit-7', 'Legion', 'UnknownPlayer-2', near, far),
      moved('UnknownUnit-17', 'Archers', 'UnknownPlayer-2', far, nearToo),
      moved('Diplomat-1', 'Diplomat', 'Player-1', near, nearToo),
    ]
  );
}

// Not steps.
{
  const { emit, sent } = setUp(),
    settlers = unitOf('Settlers', ours, nearToo, 'Settlers-1'),
    diplomat = unitOf('Diplomat', ours, far, 'Diplomat-1'),
    catapult = unitOf('Catapult', ours, near, 'Catapult-1'),
    trireme = unitOf('Trireme', ours, near, 'Trireme-1');

  // Founding a city: no other square; and a `Move` that goes nowhere.
  emit('unit:moved', settlers, action(Other, settlers, nearToo, nearToo));
  emit('unit:moved', settlers, action(Move, settlers, nearToo, nearToo));
  // A GoTo's own, after the steps it took: not a `Move`.
  emit('unit:moved', diplomat, action(Other, diplomat, near, far));
  // A `Move` that left the unit where it was, and one the unit was lost on.
  emit('unit:moved', catapult, action(Move, catapult, near, nearToo));
  trireme.lost = true;
  step(emit, trireme, near, nearToo);

  expect(
    'founding a city, a GoTo after its steps, a unit that stayed or was lost: nothing',
    sent,
    []
  );
}

// A step raised twice with the same action (`Embark` and `LandAircraft` run `Moved` after `Move`'s own) is sent once.
{
  const { emit, sent } = setUp(),
    settlers = unitOf('Settlers', ours, near, 'Settlers-1'),
    boarding = action(Move, settlers, near, nearToo);

  settlers.at = nearToo;
  emit('unit:moved', settlers, boarding);
  emit('unit:moved', settlers, boarding);

  expect('a step raised twice is sent once', sent, [
    moved('Settlers-1', 'Settlers', 'Player-1', near, nearToo),
  ]);
}

// A watcher of the whole map sees every step.
{
  const { emit, sent } = setUp(true),
    trireme = unitOf('Trireme', rival, far, 'UnknownUnit-8');

  step(emit, trireme, far, farToo);

  const chariot = unitOf('Chariot', rival, far, 'UnknownUnit-13'),
    warriors = unitOf('Warriors', other, farToo, 'UnknownUnit-14');

  emit('unit:defeated', warriors, chariot, { unit: () => chariot });

  expect(
    "a watcher of the whole map: a rival's step and a battle out of anyone's sight",
    sent.map(({ kind }) => kind),
    ['moved', 'battle']
  );
}

// Battles.
{
  const { emit, sent } = setUp(),
    musketmen = unitOf('Musketmen', ours, far, 'Musketmen-1'),
    cavalry = unitOf('Cavalry', rival, far, 'UnknownUnit-9'),
    catapult = unitOf('Catapult', ours, near, 'Catapult-1'),
    phalanx = unitOf('Phalanx', rival, nearToo, 'UnknownUnit-10'),
    knights = unitOf('Knights', rival, near, 'UnknownUnit-11'),
    archers = unitOf('Archers', other, far, 'UnknownUnit-12'),
    chariot = unitOf('Chariot', rival, far, 'UnknownUnit-13'),
    warriors = unitOf('Warriors', other, farToo, 'UnknownUnit-14'),
    legion = unitOf('Legion', rival, near, 'UnknownUnit-15'),
    pikemen = unitOf('Pikemen', other, unknown, 'UnknownUnit-16'),
    side = (id: string, type: string, owner: string, x: number, y: number) => ({
      id,
      type,
      player: owner,
      tile: { x, y },
    });

  // A rival's Cavalry attacks our Musketmen, out of sight, and loses: ours, so sent.
  emit('unit:defeated', cavalry, musketmen, attack(cavalry));
  // Our Catapult attacks the rival's Phalanx and wins; the defeat raised twice.
  emit('unit:defeated', phalanx, catapult, attack(catapult));
  emit('unit:defeated', phalanx, catapult, attack(catapult));
  // The rival's Knights, in sight, attack the other's Archers, out of it, and win.
  emit('unit:defeated', archers, knights, attack(knights));
  // The rival's Chariot attacks the other's Warriors, out of sight.
  emit('unit:defeated', warriors, chariot, attack(chariot));
  // The rival's Legion, in sight, attacks Pikemen on a square we've never seen.
  emit('unit:defeated', pikemen, legion, attack(legion));
  // A unit defeated some other way (no action, or one neither side took).
  emit('unit:defeated', knights, archers);
  emit('unit:defeated', knights, archers, attack(chariot));

  expect(
    "battles: ours always, a rival's between known squares, one side in sight, each once, and who won",
    sent,
    [
      {
        kind: 'battle',
        attacker: side('UnknownUnit-9', 'Cavalry', 'UnknownPlayer-2', 30, 20),
        defender: side('Musketmen-1', 'Musketmen', 'Player-1', 30, 20),
        winner: 'defender',
      },
      {
        kind: 'battle',
        attacker: side('Catapult-1', 'Catapult', 'Player-1', 1, 1),
        defender: side('UnknownUnit-10', 'Phalanx', 'UnknownPlayer-2', 2, 1),
        winner: 'attacker',
      },
      {
        kind: 'battle',
        attacker: side('UnknownUnit-11', 'Knights', 'UnknownPlayer-2', 1, 1),
        defender: side('UnknownUnit-12', 'Archers', 'UnknownPlayer-3', 30, 20),
        winner: 'attacker',
      },
    ]
  );
}

// A failure telling of one doesn't stop the move or the attack it's told inside: it's logged.
{
  const { emit } = setUp(),
    broken = unitOf('Settlers', ours, near, 'Settlers-2'),
    logged: unknown[] = [],
    log = console.error;

  console.error = (error: unknown) => logged.push(error);

  let escaped: unknown = null;

  try {
    // A step whose squares can't be read, and a battle whose loser can't say whose it is.
    step(emit, broken, {}, {});
    emit(
      'unit:defeated',
      // No player to say whose it is.
      {},
      broken,
      {
        unit: () => broken,
      }
    );
  } catch (error) {
    escaped = error;
  } finally {
    console.error = log;
  }

  expect(
    "a failure doesn't escape into the engine's move or attack, and is logged",
    [escaped, logged.length],
    [null, 2]
  );
}

// Disposing.
{
  const { dispose, listeners } = setUp(),
    before = listeners.map(([event]) => event);

  dispose();

  expect(
    'it listens for moves and defeats, and stops when disposed',
    [before, listeners.length],
    [['unit:moved', 'unit:defeated'], 0]
  );
}

finished = true;

if (failures.length) {
  process.stderr.write(
    `FAIL clientMapEvents (${
      failures.length
    } of ${checks} checks)\n  ${failures.join('\n  ')}\n`
  );
  process.exit(1);
}

process.stdout.write(`PASS clientMapEvents (${checks} checks)\n`);
