import { Tile, Unit, UnitAction } from '../types';
import { t } from 'i18next';
import Transport from '../Transport';
import { directionKeys, keyToActionsMap } from './unitActionKeys';
import NotificationWindow from '../components/NotificationWindow';
import { cityNameText } from '../components/lib/city';
import {
  chooseUnitAction,
  nameOf,
  performWithPrompts,
} from './unitActionPrompts';
import { neighbourActions, unitActions } from './unitActions';
import PendingMove, { plainMove } from './PendingMove';
import { Topology } from './topologyFor';

// What a unit key does to the active unit (#326, #543), for `ActiveUnitController`, which plays it typed now or kept
//  while a move or an order is answered. Moved out of the controller (#503).

/** What a key did, as `playUnitKey` says. */
export type PlayedKey = 'sent' | 'prompted' | null;

/** What a key needs of the controller and the game. */
export type PlayUnitKeyContext = {
  // Makes the unit active again, so the layers draw it on the tile its move is going to.
  apply: (unit: Unit) => void;
  pendingMove: Pick<PendingMove<Tile>, 'start'>;
  scheduleRender: () => void;
  // Sends an order and waits for its answer (#543); `towardsTile` for one behind a direction key.
  send: (unitId: string, action: UnitAction, towardsTile?: boolean) => void;
  transport: Pick<Transport, 'send'>;
  // `topology` for the keys that move a unit: one per direction the world has (#88).
  world: { get(x: number, y: number): Tile; topology(): Topology };
};

// 'sent' when the key sent an action, 'prompted' when it opened a window to choose or confirm first, and `null` when it
//  does nothing.
export const playUnitKey = (
  key: string,
  unit: Unit | null,
  {
    apply,
    pendingMove,
    scheduleRender,
    send,
    transport,
    world,
  }: PlayUnitKeyContext
): PlayedKey => {
  if (unit === null) {
    return null;
  }

  if (key in keyToActionsMap) {
    const actions = [...keyToActionsMap[key]];

    while (actions.length) {
      const actionName = actions.shift(),
        ownActions = unitActions(unit),
        // An action a Senate overrules goes by the name of what was asked for (#133).
        [unitAction] = ownActions.filter(
          (action): boolean => nameOf(action) === actionName
        );

      if (unitAction) {
        // Through the same windows as the arrow keys: pillaging a treaty partner's land asks first (#287).
        let sent = false;

        performWithPrompts(unit, unitAction, ownActions, (chosen) => {
          sent = true;

          send(unit.id, chosen);
        });

        return sent ? 'sent' : 'prompted';
      }
    }
  }

  // Where the engine refuses a join, it says why, so the key
  // doesn't do nothing and say nothing.
  if (key === 'b' && unit.joinCityRefusal) {
    const { reason, ...details } = unit.joinCityRefusal,
      city = world.get(unit.tile.x, unit.tile.y).city;

    new NotificationWindow(
      t(`JoinCity.${reason}.title`),
      document.createTextNode(
        t(`JoinCity.${reason}.body`, {
          ...details,
          city: city ? cityNameText(city) : '',
        })
      )
    );

    return 'prompted';
  }

  const keyDirections = directionKeys(world.topology());

  if (!(key in keyDirections)) {
    return null;
  }

  const directionActions = neighbourActions(unit, keyDirections[key]),
    // Taken now: a window below isn't modal, and another unit can be active by the time it's answered
    //  (#57).
    unitId = unit.id,
    move = plainMove(directionActions);

  // Drawn on the tile it is moving to now, rather than once the
  // engine has answered and the frame after that has drawn it, and
  // waited for as that, not as an order.
  if (move !== null) {
    transport.send('action', {
      name: 'ActiveUnit',
      id: unitId,
      unitAction: move._,
      target: move.to.id,
    });

    pendingMove.start(unitId, move.to);

    apply(unit);

    scheduleRender();

    return 'sent';
  }

  if (directionActions.length === 0) {
    return null;
  }

  let sent = false;

  chooseUnitAction(unit, directionActions, (chosen) => {
    sent = true;

    send(unitId, chosen, true);
  });

  return sent ? 'sent' : 'prompted';
};

export default playUnitKey;
