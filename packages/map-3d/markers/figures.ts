// The built-in set's units, made by code (docs/3d-renderer.md §6, plan 2.1): soldiers on foot in their era's kit, riders,
//  elephants, carts, siege engines, vehicles, ships and aircraft, in their owner's colours, from what the built-in set
//  says each unit type looks like (`@civ-clone/ui-models-builtin/units`). Plain shapes, not models: they stand in until
//  a hosted set brings models (D3).
//
// Each unit is one geometry, its parts merged with their colours in its vertices, so a unit is one draw call, however
//  many figures stand for it (D6). The marker kit makes each once for each look and owner's colours, and shares it.

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CartKind,
  UnitDress,
  UnitEra,
  UnitGear,
  UnitLook,
} from '@civ-clone/ui-models-builtin/units';

/** A unit's two colours, its owner's first and second. */
export type FigureColours = readonly [string, string];

// Colours that aren't the owner's: skin, cloth, leather, wood, metal, and a modern army's drab.
const SKIN = '#c79a72',
  CLOTH = '#5a4a3a',
  LEATHER = '#6b4a2a',
  WOOD = '#7a5532',
  IRON = '#5f6266',
  STEEL = '#8a8f96',
  DRAB = '#5d6447',
  CANVAS = '#e8e0cc',
  HORSE = '#6e4b2f',
  ELEPHANT = '#8a8580',
  HULL = '#5b3e27',
  GREY = '#7d858c';

// The vertical, about which a figure's parts are turned with it.
const UP = new Vector3(0, 1, 0);

// The shapes parts are made from: each a unit across, cut to size by its transform.
const box = new BoxGeometry(1, 1, 1),
  cylinder = new CylinderGeometry(0.5, 0.5, 1, 10),
  cone = new ConeGeometry(0.5, 1, 10),
  sphere = new SphereGeometry(0.5, 10, 8);

/**
 * A part: a shape, its colour, where its middle is, how big it is, how it's turned, and then how far it's turned about
 *  the vertical with the figure it's part of.
 */
export type Part = {
  shape: BufferGeometry;
  colour: string;
  at: [number, number, number];
  size: [number, number, number];
  turn?: [number, number, number];
  yaw?: number;
};

// Parts in the order they're added to, with an offset and a turn about the vertical for the whole of them.
class Parts {
  readonly parts: Part[] = [];

  add(part: Part): this {
    this.parts.push(part);

    return this;
  }

  // Every part of `other`, moved by `offset` and turned by `yaw` about its middle.
  addAll(other: Parts, offset: [number, number, number], yaw = 0): this {
    const cos = Math.cos(yaw),
      sin = Math.sin(yaw);

    other.parts.forEach((part) => {
      const [x, y, z] = part.at;

      // Turned about the vertical after its own turn, so a tilted shield or sword turns with the soldier.
      this.parts.push({
        ...part,
        at: [
          offset[0] + x * cos + z * sin,
          offset[1] + y,
          offset[2] - x * sin + z * cos,
        ],
        yaw: (part.yaw ?? 0) + yaw,
      });
    });

    return this;
  }
}

// What a figure on foot wears on its head in each era.
const headgear = (era: UnitEra, colours: FigureColours, parts: Parts): void => {
  switch (era) {
    case 'ancient':
      parts.add({
        shape: sphere,
        colour: colours[1],
        at: [0, 0.172, 0],
        size: [0.048, 0.03, 0.048],
      });
      break;
    case 'medieval':
      parts.add({
        shape: cone,
        colour: IRON,
        at: [0, 0.188, 0],
        size: [0.05, 0.04, 0.05],
      });
      break;
    case 'renaissance':
      parts.add({
        shape: box,
        colour: '#2a2a2a',
        at: [0, 0.178, 0],
        size: [0.06, 0.016, 0.06],
      });
      break;
    case 'industrial':
      parts.add({
        shape: cylinder,
        colour: colours[0],
        at: [0, 0.18, 0],
        size: [0.046, 0.022, 0.046],
      });
      break;
    default:
      parts.add({
        shape: sphere,
        colour: DRAB,
        at: [0, 0.172, 0],
        size: [0.052, 0.034, 0.052],
      });
  }
};

// What a figure carries in its right hand, or across it.
const carried = (
  gear: UnitGear,
  era: UnitEra,
  colours: FigureColours,
  parts: Parts
): void => {
  switch (gear) {
    case 'club':
      parts.add({
        shape: cylinder,
        colour: WOOD,
        at: [0.04, 0.1, 0.01],
        size: [0.014, 0.08, 0.014],
        turn: [0, 0, 0.5],
      });
      break;
    case 'spear':
      parts.add({
        shape: cylinder,
        colour: WOOD,
        at: [0.04, 0.12, 0],
        size: [0.006, 0.2, 0.006],
      });
      parts.add({
        shape: cone,
        colour: IRON,
        at: [0.04, 0.23, 0],
        size: [0.012, 0.025, 0.012],
      });
      break;
    case 'pike':
      parts.add({
        shape: cylinder,
        colour: WOOD,
        at: [0.04, 0.15, 0],
        size: [0.006, 0.28, 0.006],
      });
      parts.add({
        shape: cone,
        colour: STEEL,
        at: [0.04, 0.3, 0],
        size: [0.012, 0.03, 0.012],
      });
      break;
    case 'sword':
      parts.add({
        shape: box,
        colour: STEEL,
        at: [0.045, 0.12, 0.012],
        size: [0.008, 0.07, 0.004],
        turn: [0.3, 0, 0],
      });
      break;
    case 'bow':
      parts.add({
        shape: box,
        colour: WOOD,
        at: [-0.04, 0.11, 0.02],
        size: [0.006, 0.11, 0.006],
      });
      break;
    case 'lance':
      parts.add({
        shape: cylinder,
        colour: WOOD,
        at: [0.04, 0.14, 0.05],
        size: [0.006, 0.24, 0.006],
        turn: [1.1, 0, 0],
      });
      break;
    case 'musket':
    case 'rifle':
      parts.add({
        shape: box,
        colour: gear === 'rifle' ? '#3a3a3a' : WOOD,
        at: [0.03, 0.12, 0.02],
        size: [0.008, 0.11, 0.01],
        turn: [0, 0, 0.4],
      });
      break;
    case 'case':
      // A diplomat's case, in hand.
      parts.add({
        shape: box,
        colour: '#3b2a1e',
        at: [0.042, 0.072, 0.008],
        size: [0.03, 0.022, 0.009],
      });
      break;
    case 'pack':
      // An explorer's pack, and a staff.
      parts
        .add({
          shape: box,
          colour: '#7a6a48',
          at: [0, 0.115, -0.025],
          size: [0.042, 0.05, 0.022],
        })
        .add({
          shape: cylinder,
          colour: WOOD,
          at: [0.042, 0.1, 0.012],
          size: [0.006, 0.19, 0.006],
        });
      break;
    default:
  }

  // Shields, before muskets.
  if (era === 'ancient' && (gear === 'spear' || gear === 'sword')) {
    parts.add({
      shape: cylinder,
      colour: colours[1],
      at: [-0.035, 0.1, 0.012],
      size: [0.05, 0.008, 0.05],
      turn: [Math.PI / 2, 0, 0.2],
    });
  }
};

// What a figure dressed otherwise than in its era's uniform wears: white for snow, plain clothes for irregulars.
const dressed: { [dress in UnitDress]?: { coat: string; legs: string } } = {
  snow: { coat: '#e8eaec', legs: '#d4d7da' },
  irregular: { coat: '#6a5a40', legs: '#4a4036' },
};

/** One person on foot, about a fifth of a square tall, facing south (towards `+z`). */
const person = (
  era: UnitEra,
  gear: UnitGear,
  colours: FigureColours,
  { legs = true, dress }: { legs?: boolean; dress?: UnitDress } = {}
): Parts => {
  const parts = new Parts(),
    clothes = dress === undefined ? undefined : dressed[dress],
    uniform = clothes?.coat ?? (era === 'modern' ? DRAB : colours[0]),
    trousers =
      clothes?.legs ??
      (era === 'ancient' ? SKIN : era === 'modern' ? DRAB : CLOTH);

  if (legs) {
    parts.add({
      shape: box,
      colour: trousers,
      at: [-0.012, 0.04, 0],
      size: [0.018, 0.08, 0.02],
    });
    parts.add({
      shape: box,
      colour: trousers,
      at: [0.012, 0.04, 0],
      size: [0.018, 0.08, 0.02],
    });
  }

  parts.add({
    shape: box,
    colour: uniform,
    at: [0, 0.112, 0],
    size: [0.05, 0.065, 0.028],
  });
  // A sash or belt in the owner's second colour.
  parts.add({
    shape: box,
    colour: colours[1],
    at: [0, 0.088, 0],
    size: [0.052, 0.012, 0.03],
  });
  parts.add({
    shape: box,
    colour: uniform,
    at: [-0.032, 0.11, 0],
    size: [0.014, 0.055, 0.016],
  });
  parts.add({
    shape: box,
    colour: uniform,
    at: [0.032, 0.11, 0],
    size: [0.014, 0.055, 0.016],
  });
  parts.add({
    shape: sphere,
    colour: SKIN,
    at: [0, 0.16, 0],
    size: [0.034, 0.038, 0.034],
  });
  // A hood for snow, a cap in the owner's colour for irregulars, or the era's.
  if (dress === 'snow') {
    parts.add({
      shape: sphere,
      colour: '#f2f3f4',
      at: [0, 0.172, -0.002],
      size: [0.044, 0.034, 0.044],
    });
  } else if (dress === 'irregular') {
    parts.add({
      shape: sphere,
      colour: colours[1],
      at: [0, 0.176, 0],
      size: [0.042, 0.016, 0.042],
    });
  } else {
    headgear(era, colours, parts);
  }

  // A parachute's pack on the back.
  if (dress === 'parachute') {
    parts.add({
      shape: box,
      colour: '#4d5340',
      at: [0, 0.112, -0.026],
      size: [0.046, 0.06, 0.026],
    });
  }

  carried(gear, era, colours, parts);

  return parts;
};

// Where the figures of a squad of `count` stand, round the square's middle.
const formation = (count: number): [number, number][] =>
  count <= 1
    ? [[0, 0]]
    : count === 2
    ? [
        [-0.045, 0],
        [0.045, 0.02],
      ]
    : [
        [0, -0.04],
        [-0.06, 0.04],
        [0.06, 0.04],
      ];

const horse = (colour = HORSE): Parts =>
  new Parts()
    .add({ shape: box, colour, at: [0, 0.09, 0], size: [0.05, 0.05, 0.14] })
    .add({
      shape: box,
      colour,
      at: [0, 0.13, 0.08],
      size: [0.03, 0.06, 0.03],
      turn: [0.5, 0, 0],
    })
    .add({
      shape: box,
      colour,
      at: [0, 0.155, 0.105],
      size: [0.026, 0.026, 0.05],
    })
    .add({
      shape: box,
      colour,
      at: [-0.017, 0.035, 0.05],
      size: [0.012, 0.07, 0.012],
    })
    .add({
      shape: box,
      colour,
      at: [0.017, 0.035, 0.05],
      size: [0.012, 0.07, 0.012],
    })
    .add({
      shape: box,
      colour,
      at: [-0.017, 0.035, -0.05],
      size: [0.012, 0.07, 0.012],
    })
    .add({
      shape: box,
      colour,
      at: [0.017, 0.035, -0.05],
      size: [0.012, 0.07, 0.012],
    });

const rider = (era: UnitEra, gear: UnitGear, colours: FigureColours): Parts =>
  new Parts()
    .addAll(horse(), [0, 0, 0])
    // A saddle cloth in the owner's colour.
    .add({
      shape: box,
      colour: colours[0],
      at: [0, 0.118, 0],
      size: [0.056, 0.01, 0.06],
    })
    .addAll(person(era, gear, colours, { legs: false }), [0, 0.04, 0]);

const elephant = (colours: FigureColours): Parts =>
  new Parts()
    .add({
      shape: box,
      colour: ELEPHANT,
      at: [0, 0.12, 0],
      size: [0.09, 0.08, 0.17],
    })
    .add({
      shape: box,
      colour: ELEPHANT,
      at: [0, 0.14, 0.1],
      size: [0.07, 0.07, 0.06],
    })
    .add({
      shape: cylinder,
      colour: ELEPHANT,
      at: [0, 0.08, 0.14],
      size: [0.016, 0.09, 0.016],
      turn: [0.3, 0, 0],
    })
    .add({
      shape: box,
      colour: ELEPHANT,
      at: [-0.03, 0.04, 0.05],
      size: [0.025, 0.08, 0.025],
    })
    .add({
      shape: box,
      colour: ELEPHANT,
      at: [0.03, 0.04, 0.05],
      size: [0.025, 0.08, 0.025],
    })
    .add({
      shape: box,
      colour: ELEPHANT,
      at: [-0.03, 0.04, -0.05],
      size: [0.025, 0.08, 0.025],
    })
    .add({
      shape: box,
      colour: ELEPHANT,
      at: [0.03, 0.04, -0.05],
      size: [0.025, 0.08, 0.025],
    })
    // A howdah in the owner's colours.
    .add({
      shape: box,
      colour: colours[0],
      at: [0, 0.18, -0.01],
      size: [0.07, 0.03, 0.07],
    })
    .add({
      shape: box,
      colour: colours[1],
      at: [0, 0.2, -0.01],
      size: [0.074, 0.008, 0.074],
    });

const wheel = (at: [number, number, number], size = 0.05): Part => ({
  shape: cylinder,
  colour: WOOD,
  at,
  size: [size, 0.01, size],
  turn: [0, 0, Math.PI / 2],
});

// A cart drawn by a beast: settlers' covered wagon, a caravan's laden with goods, or a war chariot and its spearman.
const cart = (colours: FigureColours, kind: CartKind, era: UnitEra): Parts => {
  if (kind === 'chariot') {
    return new Parts()
      .addAll(horse(), [0, 0, 0.09])
      .add({
        shape: box,
        colour: WOOD,
        at: [0, 0.055, -0.04],
        size: [0.064, 0.035, 0.05],
      })
      .add({
        shape: box,
        colour: colours[0],
        at: [0, 0.075, -0.016],
        size: [0.066, 0.012, 0.006],
      })
      .add(wheel([-0.042, 0.035, -0.045], 0.065))
      .add(wheel([0.042, 0.035, -0.045], 0.065))
      .addAll(person(era, 'spear', colours, { legs: false }), [0, 0.0, -0.045]);
  }

  const parts = new Parts()
    .addAll(horse(era === 'ancient' ? '#8a7a64' : HORSE), [0, 0, 0.1])
    .add({
      shape: box,
      colour: WOOD,
      at: [0, 0.07, -0.06],
      size: [0.07, 0.04, 0.1],
    })
    .add({
      shape: box,
      colour: colours[0],
      at: [0, 0.092, -0.06],
      size: [0.072, 0.008, 0.102],
    })
    .add(wheel([-0.042, 0.03, -0.03]))
    .add(wheel([0.042, 0.03, -0.03]))
    .add(wheel([-0.042, 0.03, -0.09]))
    .add(wheel([0.042, 0.03, -0.09]));

  if (kind === 'wagon') {
    parts.add({
      shape: cylinder,
      colour: CANVAS,
      at: [0, 0.1, -0.06],
      size: [0.07, 0.1, 0.07],
      turn: [Math.PI / 2, 0, 0],
    });
  } else {
    // Bales and a chest, roped on.
    parts
      .add({
        shape: box,
        colour: CANVAS,
        at: [-0.016, 0.112, -0.04],
        size: [0.032, 0.03, 0.04],
      })
      .add({
        shape: box,
        colour: colours[0],
        at: [0.018, 0.11, -0.08],
        size: [0.03, 0.026, 0.036],
      })
      .add({
        shape: box,
        colour: '#8a5a2a',
        at: [0.014, 0.112, -0.035],
        size: [0.026, 0.03, 0.03],
      });
  }

  return parts;
};

const siege = (era: UnitEra, colours: FigureColours, large: boolean): Parts => {
  if (era === 'ancient' || era === 'medieval') {
    // A catapult: a frame, its arm, and its wheels.
    return new Parts()
      .add({
        shape: box,
        colour: WOOD,
        at: [0, 0.04, 0],
        size: [0.08, 0.025, 0.14],
      })
      .add({
        shape: box,
        colour: WOOD,
        at: [0, 0.09, -0.02],
        size: [0.012, 0.12, 0.012],
        turn: [-0.7, 0, 0],
      })
      .add({
        shape: box,
        colour: colours[0],
        at: [0, 0.055, 0.05],
        size: [0.082, 0.012, 0.03],
      })
      .add(wheel([-0.045, 0.03, 0.04], 0.045))
      .add(wheel([0.045, 0.03, 0.04], 0.045))
      .add(wheel([-0.045, 0.03, -0.04], 0.045))
      .add(wheel([0.045, 0.03, -0.04], 0.045));
  }

  const length = large ? 0.19 : era === 'renaissance' ? 0.12 : 0.16,
    metal = era === 'renaissance' ? '#3d3a36' : era === 'modern' ? DRAB : IRON;

  // A gun on its carriage, aimed ahead.
  return new Parts()
    .add({
      shape: cylinder,
      colour: metal,
      at: [0, 0.07, 0.04],
      size: [0.024, length, 0.024],
      turn: [1.35, 0, 0],
    })
    .add({
      shape: box,
      colour: era === 'modern' ? DRAB : WOOD,
      at: [0, 0.045, -0.02],
      size: [0.05, 0.03, 0.09],
    })
    .add({
      shape: box,
      colour: colours[0],
      at: [0, 0.064, -0.02],
      size: [0.052, 0.008, 0.06],
    })
    .add(wheel([-0.04, 0.035, 0], 0.07))
    .add(wheel([0.04, 0.035, 0], 0.07));
};

const vehicle = (
  era: UnitEra,
  colours: FigureColours,
  large: boolean
): Parts => {
  if (era === 'industrial') {
    // A truck.
    return new Parts()
      .add({
        shape: box,
        colour: GREY,
        at: [0, 0.07, -0.03],
        size: [0.08, 0.07, 0.12],
      })
      .add({
        shape: box,
        colour: colours[0],
        at: [0, 0.06, 0.07],
        size: [0.07, 0.05, 0.05],
      })
      .add(wheel([-0.045, 0.025, 0.06], 0.045))
      .add(wheel([0.045, 0.025, 0.06], 0.045))
      .add(wheel([-0.045, 0.025, -0.06], 0.045))
      .add(wheel([0.045, 0.025, -0.06], 0.045));
  }

  const parts = new Parts()
    .add({
      shape: box,
      colour: DRAB,
      at: [0, 0.045, 0],
      size: [0.1, 0.05, 0.17],
    })
    // Its tracks.
    .add({
      shape: box,
      colour: '#2e2e2a',
      at: [-0.055, 0.028, 0],
      size: [0.022, 0.05, 0.18],
    })
    .add({
      shape: box,
      colour: '#2e2e2a',
      at: [0.055, 0.028, 0],
      size: [0.022, 0.05, 0.18],
    })
    .add({
      shape: box,
      colour: colours[0],
      at: [0, 0.072, -0.05],
      size: [0.08, 0.006, 0.04],
    });

  if (large) {
    // A tank's turret and gun.
    parts
      .add({
        shape: box,
        colour: DRAB,
        at: [0, 0.088, -0.01],
        size: [0.07, 0.035, 0.08],
      })
      .add({
        shape: cylinder,
        colour: DRAB,
        at: [0, 0.09, 0.08],
        size: [0.014, 0.13, 0.014],
        turn: [Math.PI / 2, 0, 0],
      });
  } else {
    // A troop carrier's sloped front.
    parts.add({
      shape: box,
      colour: DRAB,
      at: [0, 0.07, 0.06],
      size: [0.09, 0.03, 0.05],
      turn: [0.4, 0, 0],
    });
  }

  return parts;
};

const ship = (look: UnitLook, colours: FigureColours): Parts => {
  const scale = look.large ? 1.25 : 1,
    length = 0.3 * scale,
    beam = 0.07 * scale,
    parts = new Parts();

  switch (look.hull) {
    case 'oars':
    case 'sail': {
      parts
        .add({
          shape: box,
          colour: HULL,
          at: [0, 0.03, 0],
          size: [beam, 0.045, length * 0.8],
        })
        .add({
          shape: cone,
          colour: HULL,
          at: [0, 0.03, length * 0.45],
          size: [beam, 0.1, 0.045],
          turn: [Math.PI / 2, 0, 0],
        })
        .add({
          shape: box,
          colour: colours[0],
          at: [0, 0.056, 0],
          size: [beam + 0.004, 0.008, length * 0.82],
        });

      const masts = look.hull === 'oars' ? 1 : look.large ? 3 : 2;

      for (let mast = 0; mast < masts; mast++) {
        const z = (mast - (masts - 1) / 2) * 0.09 * scale;

        parts
          .add({
            shape: cylinder,
            colour: WOOD,
            at: [0, 0.14, z],
            size: [0.008, 0.2, 0.008],
          })
          .add({
            shape: box,
            colour: mast === 0 ? colours[1] : CANVAS,
            at: [0, 0.16, z],
            size: [beam * 1.3, 0.09, 0.005],
          });
      }

      // A row of gun ports along each side.
      if ((look.guns ?? 0) > 0) {
        parts.add({
          shape: box,
          colour: '#1f1f1f',
          at: [0, 0.036, 0],
          size: [beam + 0.006, 0.009, length * 0.66],
        });
      }

      if (look.hull === 'oars') {
        parts
          .add({
            shape: box,
            colour: WOOD,
            at: [-beam * 0.8, 0.025, 0],
            size: [0.05, 0.004, length * 0.6],
            turn: [0, 0, 0.4],
          })
          .add({
            shape: box,
            colour: WOOD,
            at: [beam * 0.8, 0.025, 0],
            size: [0.05, 0.004, length * 0.6],
            turn: [0, 0, -0.4],
          });
      }

      return parts;
    }
    case 'submarine':
      return parts
        .add({
          shape: cylinder,
          colour: '#33383d',
          at: [0, 0.018, 0],
          size: [0.05, length, 0.05],
          turn: [Math.PI / 2, 0, 0],
        })
        .add({
          shape: box,
          colour: '#33383d',
          at: [0, 0.055, 0.02],
          size: [0.02, 0.04, 0.05],
        })
        .add({
          shape: box,
          colour: colours[0],
          at: [0, 0.078, 0.02],
          size: [0.022, 0.006, 0.052],
        });
    case 'carrier':
      return parts
        .add({
          shape: box,
          colour: GREY,
          at: [0, 0.035, 0],
          size: [beam * 1.1, 0.05, length * 1.15],
        })
        .add({
          shape: box,
          colour: '#55595e',
          at: [0, 0.062, 0],
          size: [beam * 1.5, 0.008, length * 1.2],
        })
        .add({
          shape: box,
          colour: GREY,
          at: [beam * 0.55, 0.09, 0.02],
          size: [0.02, 0.05, 0.06],
        })
        .add({
          shape: box,
          colour: colours[0],
          at: [beam * 0.55, 0.12, 0.02],
          size: [0.022, 0.008, 0.062],
        });
    default: {
      // Steam and steel: a grey hull, its superstructure, funnels, and guns on the warships.
      parts
        .add({
          shape: box,
          colour: look.era === 'industrial' ? '#4a4a48' : GREY,
          at: [0, 0.03, 0],
          size: [beam, 0.045, length * 0.85],
        })
        .add({
          shape: cone,
          colour: look.era === 'industrial' ? '#4a4a48' : GREY,
          at: [0, 0.03, length * 0.47],
          size: [beam, 0.08, 0.045],
          turn: [Math.PI / 2, 0, 0],
        })
        .add({
          shape: box,
          colour: GREY,
          at: [0, 0.075, -0.02],
          size: [beam * 0.6, 0.05, length * 0.3],
        })
        .add({
          shape: cylinder,
          colour: colours[0],
          at: [0, 0.12, -0.03],
          size: [0.022, 0.05, 0.022],
        })
        .add({
          shape: box,
          colour: colours[1],
          at: [0, 0.056, 0],
          size: [beam + 0.004, 0.006, length * 0.86],
        });

      // Its guns' turrets, fore, aft and fore again, their barrels pointing out; and a missile cruiser's launchers.
      [0.3, -0.34, 0.14].slice(0, look.guns ?? 0).forEach((along) => {
        const way = along > 0 ? 1 : -1;

        parts
          .add({
            shape: box,
            colour: '#5f666c',
            at: [0, 0.066, length * along],
            size: [0.035, 0.02, 0.035],
          })
          .add({
            shape: cylinder,
            colour: '#5f666c',
            at: [0, 0.07, length * along + way * 0.04],
            size: [0.008, 0.06, 0.008],
            turn: [Math.PI / 2, 0, 0],
          });
      });

      if (look.missiles) {
        [-1, 1].forEach((side) =>
          parts.add({
            shape: box,
            colour: '#4a5056',
            at: [side * beam * 0.22, 0.072, -length * 0.3],
            size: [0.022, 0.022, 0.05],
            turn: [-0.5, 0, 0],
          })
        );
      }

      return parts;
    }
  }
};

const aircraft = (look: UnitLook, colours: FigureColours): Parts => {
  const scale = look.large ? 1.3 : 1,
    body = look.stealth ? '#2c3034' : look.large ? '#6e7378' : '#7d8890';

  return new Parts()
    .add({
      shape: cylinder,
      colour: body,
      at: [0, 0.3, 0],
      size: [0.03 * scale, 0.2 * scale, 0.03 * scale],
      turn: [Math.PI / 2, 0, 0],
    })
    .add({
      shape: cone,
      colour: body,
      at: [0, 0.3, 0.12 * scale],
      size: [0.03 * scale, 0.05 * scale, 0.03 * scale],
      turn: [Math.PI / 2, 0, 0],
    })
    .add({
      shape: box,
      colour: body,
      at: [0, 0.3, 0.01],
      size: [0.26 * scale, 0.006, 0.05 * scale],
    })
    .add({
      shape: box,
      colour: colours[0],
      at: [0, 0.304, 0.01],
      size: [0.06 * scale, 0.004, 0.052 * scale],
    })
    .add({
      shape: box,
      colour: body,
      at: [0, 0.3, -0.09 * scale],
      size: [0.09 * scale, 0.005, 0.03 * scale],
    })
    .add({
      shape: box,
      colour: colours[1],
      at: [0, 0.325, -0.09 * scale],
      size: [0.005, 0.045, 0.03 * scale],
    });
};

const helicopter = (colours: FigureColours): Parts =>
  new Parts()
    .add({
      shape: sphere,
      colour: DRAB,
      at: [0, 0.27, 0.02],
      size: [0.06, 0.055, 0.09],
    })
    .add({
      shape: box,
      colour: DRAB,
      at: [0, 0.275, -0.08],
      size: [0.015, 0.015, 0.12],
    })
    .add({
      shape: box,
      colour: colours[0],
      at: [0, 0.3, -0.13],
      size: [0.004, 0.04, 0.025],
    })
    .add({
      shape: box,
      colour: '#2e2e2e',
      at: [0, 0.31, 0.02],
      size: [0.24, 0.003, 0.012],
    })
    .add({
      shape: box,
      colour: '#2e2e2e',
      at: [0, 0.31, 0.02],
      size: [0.012, 0.003, 0.24],
    });

const missile = (colours: FigureColours, large: boolean): Parts => {
  const scale = large ? 1.4 : 1;

  return new Parts()
    .add({
      shape: cylinder,
      colour: '#d8d8d8',
      at: [0, 0.14 * scale, 0],
      size: [0.024 * scale, 0.18 * scale, 0.024 * scale],
    })
    .add({
      shape: cone,
      colour: large ? '#c8a020' : colours[0],
      at: [0, 0.255 * scale, 0],
      size: [0.024 * scale, 0.05 * scale, 0.024 * scale],
    })
    .add({
      shape: box,
      colour: colours[1],
      at: [0, 0.06 * scale, 0],
      size: [0.07 * scale, 0.03 * scale, 0.004],
    })
    .add({
      shape: box,
      colour: colours[1],
      at: [0, 0.06 * scale, 0],
      size: [0.004, 0.03 * scale, 0.07 * scale],
    });
};

/** The parts a unit that looks like `look` is made of, in `colours`, standing on its square's middle, facing south. */
export const figureParts = (look: UnitLook, colours: FigureColours): Parts => {
  switch (look.shape) {
    case 'foot': {
      const parts = new Parts();

      formation(look.squad).forEach(([x, z], index) =>
        parts.addAll(
          person(look.era, look.gear ?? 'none', colours, { dress: look.dress }),
          [x, 0, z],
          index * 0.3 - 0.3
        )
      );

      return parts;
    }
    case 'mounted': {
      const parts = new Parts();

      formation(look.squad).forEach(([x, z]) =>
        parts.addAll(rider(look.era, look.gear ?? 'none', colours), [
          x * 1.4,
          0,
          z,
        ])
      );

      return parts;
    }
    case 'elephant':
      return elephant(colours);
    case 'cart':
      return cart(colours, look.cart ?? 'wagon', look.era);
    case 'siege':
      return siege(look.era, colours, look.large === true);
    case 'vehicle':
      return vehicle(look.era, colours, look.large === true);
    case 'ship':
      return ship(look, colours);
    case 'aircraft':
      return aircraft(look, colours);
    case 'helicopter':
      return helicopter(colours);
    default:
      return missile(colours, look.large === true);
  }
};

/**
 * Where a part goes: cut to size, turned as it says, then about the vertical with its figure, and moved to its place.
 */
export const partMatrix = ({
  at,
  size,
  turn = [0, 0, 0],
  yaw = 0,
}: Part): Matrix4 =>
  new Matrix4().compose(
    new Vector3(...at),
    new Quaternion()
      .setFromAxisAngle(UP, yaw)
      .multiply(new Quaternion().setFromEuler(new Euler(...turn))),
    new Vector3(...size)
  );

/** One geometry of `parts`: each placed, its colour in its vertices, all merged, with its bounds worked out. */
export const mergeParts = (parts: readonly Part[]): BufferGeometry => {
  const pieces = parts.map((part) => {
    const { shape, colour } = part,
      piece = shape.clone(),
      linear = new Color(colour),
      count = piece.getAttribute('position').count,
      colours = new Float32Array(count * 3);

    for (let at = 0; at < count; at++) {
      colours.set([linear.r, linear.g, linear.b], at * 3);
    }

    piece.applyMatrix4(partMatrix(part));
    piece.setAttribute('color', new BufferAttribute(colours, 3));

    return piece;
  });

  const geometry = mergeGeometries(pieces) ?? new BufferGeometry();

  pieces.forEach((piece) => piece.dispose());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
};

/**
 * One geometry for a unit that looks like `look`, in `colours`: its parts merged, their colours in its vertices, with
 *  its bounds worked out. Each call makes a new one, which the caller lets go.
 */
export const figureGeometry = (
  look: UnitLook,
  colours: FigureColours
): BufferGeometry => mergeParts(figureParts(look, colours).parts);

// A unit's stand, and a fortified unit's low wall round it.
const standShape = new CylinderGeometry(0.19, 0.2, 1, 28),
  bankShape = new TorusGeometry(0.22, 0.014, 4, 32);

/**
 * All that's drawn of a unit on the land, as one geometry: its figures as `look` says, `scale` times their size, on a
 *  stand `stand` thick in its owner's second colour (a ship rides the water without one), behind a low wall when
 *  `fortified`. One draw call.
 */
export const unitBodyGeometry = (
  look: UnitLook,
  colours: FigureColours,
  {
    fortified,
    scale,
    stand,
  }: { fortified: boolean; scale: number; stand: number }
): BufferGeometry => {
  const afloat = look.shape === 'ship',
    lift = afloat ? 0 : stand,
    parts: Part[] = figureParts(look, colours).parts.map((part) => ({
      ...part,
      at: [part.at[0] * scale, part.at[1] * scale + lift, part.at[2] * scale],
      size: [part.size[0] * scale, part.size[1] * scale, part.size[2] * scale],
    }));

  if (!afloat) {
    parts.push({
      shape: standShape,
      colour: colours[1],
      at: [0, stand / 2, 0],
      size: [1, stand, 1],
    });
  }

  if (fortified) {
    parts.push({
      shape: bankShape,
      colour: '#b5ab98',
      at: [0, lift + 0.015, 0],
      size: [1, 1, 2.5],
      turn: [Math.PI / 2, 0, 0],
    });
  }

  return mergeParts(parts);
};

// A city's buildings: a block, and its roof; and its walls.
const roofShape = new ConeGeometry(0.75, 0.5, 4),
  wallShape = new TorusGeometry(0.36, 0.025, 6, 24);

/** A city's buildings, each its height and width, at its place round the city's middle, from the middle out. */
export type Building = { x: number; z: number; width: number; height: number };

/**
 * A city as one geometry: its `buildings` in stone with roofs in its owner's colour, and walls round them if it's
 *  `walled`. One draw call.
 */
export const cityGeometry = (
  buildings: readonly Building[],
  roof: string,
  walled: boolean
): BufferGeometry =>
  mergeParts([
    ...buildings.flatMap(({ x, z, width, height }): Part[] => [
      {
        shape: box,
        colour: '#b5ab98',
        at: [x, height / 2, z],
        size: [width, height, width],
      },
      {
        shape: roofShape,
        colour: roof,
        at: [x, height + width * 0.2, z],
        size: [width, width * 0.8, width],
        turn: [0, Math.PI / 4, 0],
      },
    ]),
    ...(walled
      ? [
          {
            shape: wallShape,
            colour: '#8d8577',
            at: [0, 0.02, 0],
            size: [1, 1, 2.5],
            turn: [Math.PI / 2, 0, 0],
          } as Part,
        ]
      : []),
  ]);
