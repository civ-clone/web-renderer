// An edit to what a city builds after its current item (#774): `add` the item `chosen` (at `index`, or the end),
//  `remove` the one at `index`, `move` the one at `index` to `to`, or `clear` them all. `queued` is the queue as the
//  player saw it, so a second click sent before the first's update changes nothing.
export type QueueEdit =
  | { op: 'add'; chosen: string; index?: number }
  | { op: 'remove'; index: number; queued: string[] }
  | { op: 'move'; index: number; to: number; queued: string[] }
  | { op: 'clear' };
